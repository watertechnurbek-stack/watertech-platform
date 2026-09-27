import "server-only";
import { createAdminClient, createDynamicAdminClient } from "@/lib/supabase/admin";
import { adminEditHref, STALE_DAYS } from "@/lib/dashboard/content-health";
import { revalidateNotificationViews } from "@/lib/notifications/revalidate";
import type { NotificationInsert } from "@/lib/notifications/types";
import { missingRuFields, targetTitle } from "@/lib/agents/publish-gate/checks";
import type { GateTable, GateTarget } from "@/lib/agents/publish-gate/types";
import { CONTENT_REGISTRY, gateTargetFor } from "@/lib/admin/registry";
import type { Tables } from "@/lib/supabase/typed";

// Service-role client (CLAUDE.md section 7): this runs from the cron Route
// Handler with no user session at all, and admin_notifications has no insert
// policy for `authenticated` (0007_notifications_and_gate.sql).

const SCAN_ACTOR = "content-scan";
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_TITLE_CHARS = 120;

/** Age column used when a registry entry names none. */
const DEFAULT_STALE_COLUMN = "updated_at";

type AdminClient = ReturnType<typeof createAdminClient>;
type DynamicAdminClient = ReturnType<typeof createDynamicAdminClient>;

/** Every content table, derived from the registry instead of listed here: the
 * hand-written list this replaced covered seven tables, so content_changelog,
 * content_contacts and content_sops were never scanned at all. A new registry
 * entry now joins the daily sweep on its own — see docs/ADDING_A_MODULE.md. */
const SCAN_TABLES: readonly { table: GateTable; staleColumn: string }[] = Object.values(CONTENT_REGISTRY).map(
  (entry) => ({ table: entry.table, staleColumn: entry.staleColumn ?? DEFAULT_STALE_COLUMN })
);

interface PublishedTarget {
  target: GateTarget;
  /** Value of the entry's `staleColumn`: an `updated_at` timestamp for most
   * tables, a `published_on` date for the changelog. */
  staleAt: string;
  /** Which column `staleAt` came from, so the notification says what it means. */
  staleColumn: string;
}

export interface ContentScanResult {
  /** stale_content + missing_ru notifications inserted (the summary row not counted). */
  created: number;
  /** Findings not inserted because an unread notification already covers them. */
  skipped: number;
}

/** The age reading for one row. Falls back to `updated_at` when the named
 * column is missing or not a string: a column a migration renamed must degrade
 * to "measure the edit date", never crash the nightly cron. */
function rowStaleAt(row: Tables<GateTable>, column: string): string {
  const value: unknown = (row as Record<string, unknown>)[column];
  return typeof value === "string" && value !== "" ? value : row.updated_at;
}

/** Reads every registry table through the column-agnostic client: the table
 * name is a runtime value here, and the registry's own key set is the
 * allow-list that makes that safe (the same pattern as the publish gate's row
 * loader). `gateTargetFor` pairs a table with its row, so `targetTitle` and
 * `missingRuFields` stay exhaustive switches over the union. */
async function loadPublishedTargets(admin: DynamicAdminClient): Promise<PublishedTarget[]> {
  const perTable = await Promise.all(
    SCAN_TABLES.map(async ({ table, staleColumn }) => {
      const { data, error } = await admin
        .from(table)
        .select("*")
        .eq("status", "published")
        .overrideTypes<Tables<GateTable>[], { merge: false }>();
      if (error) throw new Error(`${table}: ${error.message}`);
      return (data ?? []).map((row) => ({
        target: gateTargetFor(table, row),
        staleAt: rowStaleAt(row, staleColumn),
        staleColumn,
      }));
    })
  );
  return perTable.flat();
}

function dedupKey(kind: string, table: string | null, rowId: string | null): string {
  return `${kind}:${table ?? ""}:${rowId ?? ""}`;
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** How a stale finding reads, given the column its age was measured on. */
function staleBody(column: string, days: number, iso: string): string {
  const date = new Date(iso).toLocaleDateString("uz-UZ");
  return column === DEFAULT_STALE_COLUMN
    ? `${days} kundan beri yangilanmagan (oxirgi yangilanish: ${date}).`
    : `${days} kun oldin e'lon qilingan (e'lon sanasi: ${date}).`;
}

/** Daily sweep over every published row of every registry table: one
 * `stale_content` (warning) per row whose age column is older than STALE_DAYS,
 * one `missing_ru` (info) per row with an empty *_ru column — each skipped
 * while an unread notification for the same kind and row is still in the inbox
 * — then a single `scan_summary` (info). */
export async function runContentScan(): Promise<ContentScanResult> {
  const admin: AdminClient = createAdminClient();

  const [targets, unreadRes] = await Promise.all([
    loadPublishedTargets(createDynamicAdminClient()),
    admin
      .from("admin_notifications")
      .select("kind, table_name, row_id")
      .is("read_at", null)
      .in("kind", ["stale_content", "missing_ru"]),
  ]);
  if (unreadRes.error) throw new Error(`admin_notifications: ${unreadRes.error.message}`);
  const unread = new Set((unreadRes.data ?? []).map((n) => dedupKey(n.kind, n.table_name, n.row_id)));

  const now = Date.now();
  const staleBefore = now - STALE_DAYS * DAY_MS;
  const inserts: NotificationInsert[] = [];
  let staleFound = 0;
  let missingRuFound = 0;
  let skipped = 0;

  for (const { target, staleAt, staleColumn } of targets) {
    const { table } = target;
    const id = target.row.id;
    const title = targetTitle(target) || id;
    const href = adminEditHref(table, id);
    const staleMs = new Date(staleAt).getTime();

    // An unparseable date yields NaN, which compares false against every
    // bound, so a malformed column reports nothing instead of flooding the
    // inbox with "0 kundan beri" findings.
    if (staleMs < staleBefore) {
      staleFound += 1;
      if (unread.has(dedupKey("stale_content", table, id))) {
        skipped += 1;
      } else {
        const days = Math.floor((now - staleMs) / DAY_MS);
        inserts.push({
          kind: "stale_content",
          severity: "warning",
          title: truncate(`Eskirgan kontent: ${title}`, MAX_TITLE_CHARS),
          body: staleBody(staleColumn, days, staleAt),
          table_name: table,
          row_id: id,
          href,
          actor: SCAN_ACTOR,
        });
      }
    }

    // Exhaustive over the ten tables, and already empty for the two with
    // nothing to translate — content_competitors (battle-cards stay
    // Uzbek-only) and content_products (name_ru is its required primary
    // name). No second "is this table localized" flag to drift from it.
    const missingRu = missingRuFields(target);
    if (missingRu.length > 0) {
      missingRuFound += 1;
      if (unread.has(dedupKey("missing_ru", table, id))) {
        skipped += 1;
      } else {
        inserts.push({
          kind: "missing_ru",
          severity: "info",
          title: truncate(`Ruscha tarjima yo'q: ${title}`, MAX_TITLE_CHARS),
          body: `To'ldirilmagan maydonlar: ${missingRu.join(", ")}`,
          table_name: table,
          row_id: id,
          href: `${href}#ru`,
          actor: SCAN_ACTOR,
        });
      }
    }
  }

  if (inserts.length > 0) {
    const { error } = await admin.from("admin_notifications").insert(inserts);
    if (error) throw new Error(`admin_notifications: ${error.message}`);
  }

  const summary: NotificationInsert = {
    kind: "scan_summary",
    severity: "info",
    title: `Kunlik kontent tekshiruvi: ${inserts.length} ta yangi bildirishnoma`,
    body:
      `Tekshirilgan nashr etilgan yozuvlar: ${targets.length}. ` +
      `Eskirgan (${STALE_DAYS}+ kun): ${staleFound}. Ruscha tarjimasi to'liq emas: ${missingRuFound}. ` +
      `O'qilmagan eslatma allaqachon bor, qayta yuborilmadi: ${skipped}.`,
    href: "/admin/knowledge#health",
    actor: SCAN_ACTOR,
  };
  const { error: summaryError } = await admin.from("admin_notifications").insert(summary);
  if (summaryError) throw new Error(`admin_notifications: ${summaryError.message}`);

  revalidateNotificationViews();
  return { created: inserts.length, skipped };
}
