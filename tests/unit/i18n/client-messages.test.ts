import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import ru from "@/messages/ru.json";
import uz from "@/messages/uz.json";
import { ADMIN_CLIENT_NAMESPACES, ROOT_CLIENT_NAMESPACES, pickMessages } from "@/lib/i18n/client-messages";

type Messages = { [key: string]: string | Messages };
type Area = "operator" | "admin";

const ROOT = path.resolve(__dirname, "../../..");
const SOURCE_DIRS = ["components", "hooks", "lib", "app"];

/** Files whose path does not say which provider mounts them. useActionError is the admin
 * CMS's error copy, shared with the knowledge page's QuickActionButton — no operator page
 * mounts it. */
const AREA_BY_FILE = new Map<string, Area>([["hooks/useActionError.ts", "admin"]]);

function listSources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listSources(full);
    return /\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

const rel = (file: string): string => path.relative(ROOT, file).split(path.sep).join("/");

const sources = new Map<string, string>(
  SOURCE_DIRS.flatMap((dir) => listSources(path.join(ROOT, dir))).map((file) => [
    rel(file),
    readFileSync(file, "utf8"),
  ]),
);

/** Directive prologue only — a "use client" further down is not a directive. */
function isClientFile(source: string): boolean {
  return /^(?:\s*(?:\/\/[^\n]*|\/\*[\s\S]*?\*\/))*\s*["']use client["']/.test(source);
}

function areaOf(file: string): Area {
  const pinned = AREA_BY_FILE.get(file);
  if (pinned) return pinned;
  // components/dashboard/ holds the monitoring pages' shared controls (RangePicker,
  // QuickActionButton…); since the S03 monitoring IA only the admin layout mounts them.
  if (file.startsWith("components/admin/") || file.startsWith("components/dashboard/") || file.includes("(admin)")) {
    return "admin";
  }
  return "operator";
}

function resolveImport(from: string, specifier: string): string | null {
  let base: string;
  if (specifier.startsWith("@/")) base = specifier.slice(2);
  else if (specifier.startsWith(".")) base = path.posix.join(path.posix.dirname(from), specifier);
  else return null;
  return [`${base}.ts`, `${base}.tsx`, `${base}/index.ts`].find((c) => sources.has(c)) ?? null;
}

const IMPORT_RE = /(?:import|export)\s[^;]*?from\s+["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g;

/** Every file that ends up in a client bundle when the area's "use client" files are used. */
function clientReachable(area: Area): Set<string> {
  const seen = new Set<string>();
  const queue = [...sources.keys()].filter((file) => areaOf(file) === area && isClientFile(sources.get(file) ?? ""));
  for (let file = queue.pop(); file !== undefined; file = queue.pop()) {
    if (seen.has(file)) continue;
    seen.add(file);
    for (const match of (sources.get(file) ?? "").matchAll(IMPORT_RE)) {
      const target = resolveImport(file, match[1] ?? match[2] ?? "");
      if (target && !seen.has(target)) queue.push(target);
    }
  }
  return seen;
}

/** `useTranslations("a.b")` → "a.b"; anything that is not a string literal → null. */
function namespacesUsedIn(source: string): (string | null)[] {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/[^\n]*/g, "$1");
  return [...code.matchAll(/useTranslations\(([^)]*)\)/g)].map((match) => {
    const literal = /^\s*["']([^"']+)["']\s*$/.exec(match[1] ?? "");
    return literal?.[1] ?? null;
  });
}

const covers = (allowed: readonly string[], used: string): boolean =>
  allowed.some((entry) => used === entry || used.startsWith(`${entry}.`));

function uncovered(area: Area, allowed: readonly string[]): string[] {
  const problems: string[] = [];
  for (const file of clientReachable(area)) {
    for (const namespace of namespacesUsedIn(sources.get(file) ?? "")) {
      if (namespace === null) {
        problems.push(`${file}: useTranslations() needs a string-literal namespace`);
      } else if (!covers(allowed, namespace)) {
        problems.push(`${file}: "${namespace}"`);
      }
    }
  }
  return problems;
}

function hasPath(tree: Messages, dotted: string): boolean {
  let node: string | Messages | undefined = tree;
  for (const key of dotted.split(".")) {
    if (typeof node !== "object") return false;
    node = node[key];
  }
  return node !== undefined;
}

describe("client message allow-lists", () => {
  it("finds the source tree (guards against a silently empty scan)", () => {
    expect(existsSync(path.join(ROOT, "components"))).toBe(true);
    expect(clientReachable("operator").size).toBeGreaterThan(20);
  });

  it("root list covers every namespace read by operator client components", () => {
    expect(uncovered("operator", ROOT_CLIENT_NAMESPACES)).toEqual([]);
  });

  it("admin list covers every namespace read by admin client components", () => {
    expect(uncovered("admin", [...ROOT_CLIENT_NAMESPACES, ...ADMIN_CLIENT_NAMESPACES])).toEqual([]);
  });

  it("the admin layout is the only other provider — the /dashboard layout is gone", () => {
    expect(existsSync(path.join(ROOT, "app/[locale]/dashboard"))).toBe(false);
  });

  it("every listed path exists in both locales", () => {
    const locales: Record<string, Messages> = { uz, ru };
    const listed = [...ROOT_CLIENT_NAMESPACES, ...ADMIN_CLIENT_NAMESPACES];
    const missing = Object.entries(locales).flatMap(([locale, tree]) =>
      listed.filter((dotted) => !hasPath(tree, dotted)).map((dotted) => `${locale}: ${dotted}`),
    );
    expect(missing).toEqual([]);
  });

  it("keeps long-form page copy out of the root payload", () => {
    const picked = pickMessages(uz, ROOT_CLIENT_NAMESPACES);
    expect(picked).not.toHaveProperty("admin");
    expect(picked).not.toHaveProperty("dashboard");
    expect(picked.pages).not.toHaveProperty("company.about");
    expect(picked.pages).not.toHaveProperty("standards");
    expect(picked).toHaveProperty("pages.home");
  });

  it("pickMessages keeps nesting and skips unknown paths", () => {
    const tree = { a: { b: { c: "1", d: "2" }, e: "3" }, f: "4" };
    expect(pickMessages(tree, ["a.b.c", "a.e", "nope.x"])).toEqual({ a: { b: { c: "1" }, e: "3" } });
  });
});
