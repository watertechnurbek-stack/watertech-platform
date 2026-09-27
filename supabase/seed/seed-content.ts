import { config } from "dotenv";
import path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";

// Must run before any import that reads process.env at module load time
// (lib/env.ts, pulled in transitively by lib/supabase/admin.ts) — see the
// dynamic import in main() below for why that one is deferred instead of
// imported at the top like everything else here.
config({ path: path.resolve(process.cwd(), ".env.local") });

import { scripts } from "@/lib/content/scripts";
import { objections } from "@/lib/content/objections";
import { faqs } from "@/lib/content/faq";
import { competitors } from "@/lib/content/competitors";
import { packageGroups } from "@/lib/content/packages";
import { products } from "@/lib/content/products";
import { contacts } from "@/lib/content/contacts";
import { sops } from "@/lib/content/sops";
import {
  scriptToRow,
  objectionToRow,
  faqToRow,
  competitorToRow,
  packageGroupToRow,
  packageToRow,
  productToRow,
  contactToRow,
  sopToRow,
} from "@/lib/content/db";
import { assessmentSeedRows } from "@/supabase/seed/assessment-items";
import { checkSeedTarget, formatPlan, parseSeedFlags, type SeedFlags, type TablePlan } from "@/supabase/seed/guard";

// Runs under tsx with `--conditions=react-server` (see package.json), which is
// what resolves the `server-only` import inside lib/supabase/admin.ts to its
// empty stub. Without it Node takes the default export condition, whose whole
// job is to throw — the seed could not build a client at all.
//
// Usage:
//   SEED_TARGET=staging PROD_PROJECT_REFS=<prod-ref> npm run seed:content -- --dry-run
//   SEED_TARGET=staging PROD_PROJECT_REFS=<prod-ref> npm run seed:content
//   SEED_TARGET=staging PROD_PROJECT_REFS=<prod-ref> npm run seed:content -- --force
//
// Insert-only by default: a row whose id already exists is left exactly as the
// manager last saved it. Only --force overwrites. The guard in
// supabase/seed/guard.ts refuses to run at all without SEED_TARGET=staging and
// a project ref that is not listed in PROD_PROJECT_REFS; both that module and
// this one read process.env directly, which is the documented exception to
// CLAUDE.md §7 (a developer CLI, never app runtime).

type SeedRow = Record<string, unknown> & { id: string };

interface SeedTable {
  table: string;
  rows: SeedRow[];
}

/** Ids already present in a table, so the plan can say insert vs. skip before
 * anything is written. */
async function existingIds(admin: SupabaseClient, table: string): Promise<Set<string>> {
  const { data, error } = await admin.from(table).select("id");
  if (error) throw new Error(`${table}: ${error.message}`);
  return new Set((data ?? []).map((row: { id: string }) => row.id));
}

function planFor(table: string, rows: readonly SeedRow[], existing: ReadonlySet<string>): TablePlan {
  const insert = rows.filter((row) => !existing.has(row.id)).length;
  return { table, insert, existing: rows.length - insert };
}

/**
 * Writes one table. `ignoreDuplicates: true` (the default path) becomes
 * `ON CONFLICT DO NOTHING`, so an existing row keeps every column it has —
 * including `status`, which is why re-running the seed no longer pushes
 * published contacts back to draft. `--force` flips it to a real upsert.
 *
 * Returns how many rows the database actually wrote, read back from the
 * statement rather than assumed from the payload length.
 */
async function writeTable(admin: SupabaseClient, { table, rows }: SeedTable, flags: SeedFlags): Promise<number> {
  if (rows.length === 0) return 0;
  const { data, error } = await admin
    .from(table)
    .upsert(rows, { onConflict: "id", ignoreDuplicates: !flags.force })
    .select("id");
  if (error) throw new Error(`${table}: ${error.message}`);
  return (data ?? []).length;
}

/** Every seeded table in dependency order: content_packages.group_id
 * references content_package_groups(id), so groups must land first or a fresh
 * database rejects the packages insert. */
function seedTables(): SeedTable[] {
  // sort_order = array position, so the seeded DB renders in the exact same
  // order the current static TS arrays do.
  //
  // status is spelled out on every table: since 0013 the column defaults to
  // 'draft' so that nothing reaches operators without passing the publish gate,
  // and the seed is a direct service-role insert that bypasses it. These arrays
  // are the reviewed content this app shipped with, so they are seeded as
  // published — deliberately, here, instead of by leaning on a column default.
  return [
    {
      table: "content_package_groups",
      rows: packageGroups.map((g, i) => ({ ...packageGroupToRow(g), status: "published", sort_order: i })),
    },
    {
      table: "content_packages",
      rows: packageGroups.flatMap((g) =>
        g.packages.map((p, i) => ({ ...packageToRow(p, g.id), status: "published", sort_order: i }))
      ),
    },
    { table: "content_scripts", rows: scripts.map((s, i) => ({ ...scriptToRow(s), status: "published", sort_order: i })) },
    {
      table: "content_objections",
      rows: objections.map((o, i) => ({ ...objectionToRow(o), status: "published", sort_order: i })),
    },
    { table: "content_faqs", rows: faqs.map((f, i) => ({ ...faqToRow(f), status: "published", sort_order: i })) },
    {
      table: "content_competitors",
      rows: competitors.map((c, i) => ({ ...competitorToRow(c), status: "published", sort_order: i })),
    },
    { table: "content_products", rows: products.map((p, i) => ({ ...productToRow(p), status: "published", sort_order: i })) },
    // The contacts are still placeholders (lib/content/contacts.ts), so they
    // land as drafts — operators see the "no contacts yet" state instead of
    // fake people and numbers until a manager fills them in and publishes.
    // Insert-only means a later run leaves the published ones alone; --force
    // would reset them to draft, which is now a choice someone has to type.
    { table: "content_contacts", rows: contacts.map((c, i) => ({ ...contactToRow(c), status: "draft", sort_order: i })) },
    { table: "content_sops", rows: sops.map((s, i) => ({ ...sopToRow(s), status: "published", sort_order: i })) },
    // The attestation item bank (0023): drafts, like the contacts — an admin
    // reviews each item in /admin/assessments/items and publishes it. Needs
    // 0023 on the target; without it the plan step fails before any write.
    // --force would put a published item back to draft (and the audit
    // records it), so it is a choice someone has to type here too.
    { table: "assessment_items", rows: assessmentSeedRows().map((row) => ({ ...row })) },
  ];
}

async function main() {
  // A usage error is one clean line, not a stack trace — the stack in the
  // top-level catch is for a real failure (a rejected write, a bad key).
  let flags: SeedFlags;
  try {
    flags = parseSeedFlags(process.argv.slice(2));
  } catch (error) {
    console.error(`[seed:content] refused: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }

  const guard = checkSeedTarget({
    SEED_TARGET: process.env.SEED_TARGET,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    PROD_PROJECT_REFS: process.env.PROD_PROJECT_REFS,
  });
  if (!guard.ok) {
    console.error(`[seed:content] refused: ${guard.reason}`);
    process.exit(1);
  }

  // Dynamically imported so lib/env.ts's eager `SUPABASE_SERVICE_ROLE_KEY`
  // validation runs after dotenv has populated process.env above — ES module
  // imports evaluate before this file's own top-level statements regardless
  // of where the import line sits, so a static import here would read an
  // empty environment and throw.
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const admin: SupabaseClient = createAdminClient();

  const target = guard.project.kind === "hosted" ? guard.project.ref : "local";
  console.log(`[seed:content] target: ${target}${flags.dryRun ? " (dry run)" : ""}`);

  const tables = seedTables();

  // The whole plan is read and printed before a single write, so --dry-run and
  // a real run report the same numbers and an operator can compare them.
  const plans: TablePlan[] = [];
  for (const { table, rows } of tables) {
    plans.push(planFor(table, rows, await existingIds(admin, table)));
  }
  console.log(formatPlan(plans, flags));

  if (flags.dryRun) {
    console.log("[seed:content] dry run — nothing was written.");
    return;
  }

  console.log("Writing:");
  for (const seedTable of tables) {
    const written = await writeTable(admin, seedTable, flags);
    console.log(`  ${seedTable.table.padEnd(24)} ${flags.force ? "upserted" : "inserted"} ${written}`);
  }
}

main().catch((err) => {
  console.error("[seed:content] failed:", err);
  process.exit(1);
});
