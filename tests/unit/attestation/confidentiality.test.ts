import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import ru from "@/messages/ru.json";
import uz from "@/messages/uz.json";
import { ROOT_CLIENT_NAMESPACES, pickMessages } from "@/lib/i18n/client-messages";
import { CONTENT_REGISTRY } from "@/lib/admin/registry";

// The structural half of docs/ATTESTATION.md §7: what holds scores, the rubric
// or answer keys cannot end up in a browser bundle, and the candidate-facing
// message payload carries no attestation admin copy. (The runtime half is
// operator-view.test.ts and supabase/tests/attestation-checks.sql.)

const ROOT = path.resolve(__dirname, "../../..");

/** Modules that must never reach a client bundle — the admin's included. */
const CONFIDENTIAL = ["rubrics", "scoring", "config", "repository", "items-draw", "operator-view"].map(
  (name) => `lib/attestation/${name}.ts`
);

function listSources(dir: string): string[] {
  return readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((entry) => {
    const rel = path.posix.join(dir, entry.name);
    if (entry.isDirectory()) return listSources(rel);
    return /\.tsx?$/.test(entry.name) ? [rel] : [];
  });
}

const sources = new Map<string, string>(
  ["app", "components", "hooks", "lib"].flatMap(listSources).map((file) => [file, readFileSync(path.join(ROOT, file), "utf8")])
);

/** A directive prologue: "use client" / "use server" before any code. */
function hasDirective(source: string, directive: "use client" | "use server"): boolean {
  return new RegExp(`^(?:\\s*(?:\\/\\/[^\\n]*|\\/\\*[\\s\\S]*?\\*\\/))*\\s*["']${directive}["']`).test(source);
}

function resolveImport(from: string, specifier: string): string | null {
  let base: string;
  if (specifier.startsWith("@/")) base = specifier.slice(2);
  else if (specifier.startsWith(".")) base = path.posix.join(path.posix.dirname(from), specifier);
  else return null;
  return [`${base}.ts`, `${base}.tsx`].find((candidate) => sources.has(candidate)) ?? null;
}

// Type-only imports are erased; everything else ends up in the bundle.
const VALUE_IMPORT_RE = /(?:import|export)\s+(?!type\s)[^;]*?from\s+["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g;

/** Every module a client bundle can contain. A "use server" module is a
 * boundary: a client component calls its actions by reference, and none of
 * its imports ship. */
function clientReachable(): Set<string> {
  const seen = new Set<string>();
  const queue = [...sources.keys()].filter((file) => hasDirective(sources.get(file) ?? "", "use client"));
  for (let file = queue.pop(); file !== undefined; file = queue.pop()) {
    if (seen.has(file)) continue;
    seen.add(file);
    for (const match of (sources.get(file) ?? "").matchAll(VALUE_IMPORT_RE)) {
      const target = resolveImport(file, match[1] ?? match[2] ?? "");
      if (target && !seen.has(target) && !hasDirective(sources.get(target) ?? "", "use server")) queue.push(target);
    }
  }
  return seen;
}

describe("the attestation's confidential modules", () => {
  it.each(CONFIDENTIAL)("%s imports server-only before anything else", (file) => {
    const source = sources.get(file);
    expect(source, file).toBeDefined();
    expect(source?.trimStart().startsWith('import "server-only";')).toBe(true);
  });

  it("are reachable from no client module", () => {
    const reachable = clientReachable();
    expect(reachable.size).toBeGreaterThan(20);
    expect(CONFIDENTIAL.filter((file) => reachable.has(file))).toEqual([]);
  });

  it("are imported from the client only through a Server Action module", () => {
    const offenders = [...sources.entries()]
      .filter(([, source]) => hasDirective(source, "use client"))
      .filter(([, source]) => /from\s+["']@\/lib\/attestation\/(rubrics|scoring|config|repository|items-draw|operator-view)["']/.test(source))
      .map(([file]) => file);
    expect(offenders).toEqual([]);
  });
});

describe("the candidate-facing message payload", () => {
  it.each([
    ["uz", uz],
    ["ru", ru],
  ] as const)("(%s) carries no attestation admin copy", (_locale, messages) => {
    const picked = JSON.stringify(pickMessages(messages, ROOT_CLIENT_NAMESPACES));
    expect(picked).not.toContain('"assessments"');
    expect(picked).not.toContain('"rubric"');
    const shipped: readonly string[] = ROOT_CLIENT_NAMESPACES;
    expect(shipped.some((namespace) => namespace === "pages.admin" || namespace.startsWith("pages.admin."))).toBe(false);
  });
});

describe("the attestation tables stay out of the content pipeline", () => {
  // Registered, a table would be copied by the stale scan, notifications,
  // content health, the trash, content_versions and the publish gate's bundle
  // — the answer keys with it (docs/ATTESTATION.md §17).
  it("has no entry in the CMS registry", () => {
    expect(Object.keys(CONTENT_REGISTRY).filter((table) => table.startsWith("assessment_"))).toEqual([]);
  });

  it("is queried only by the attestation's own server modules and the retention agent", () => {
    const readers = [...sources.entries()]
      .filter(([, source]) => /\.(?:from|rpc)\(\s*["'](?:assessment_|admin_assessment_|run_assessment_)/.test(source))
      .map(([file]) => file)
      .sort();
    expect(readers).toEqual(["lib/agents/retention.ts", "lib/attestation/config.ts", "lib/attestation/repository.ts"]);
  });
});
