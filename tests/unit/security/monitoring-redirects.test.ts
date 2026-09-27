import { createRequire } from "node:module";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { routing } from "@/i18n/routing";
import { KNOWLEDGE_SECTIONS } from "@/lib/admin/knowledge";
import { ADMIN_AREAS, isAdminArea } from "@/lib/auth/claims";

// The retired /dashboard tabs (S03 monitoring IA) redirect in next.config.js,
// which runs before middleware — so a redirect answers without a session. What
// keeps that safe is pinned here: every destination is an admin URL (gated by
// middleware and requireAdminPage on the next request), a redirect carries no
// data, and /dashboard itself stays an admin area in case one is removed.
// Loading the real config file, not a copy, is what makes this catch drift.

const ROOT = path.resolve(__dirname, "../../..");
const require = createRequire(import.meta.url);
const nextConfig: unknown = require(path.join(ROOT, "next.config.js"));

interface Redirect {
  source: string;
  destination: string;
  permanent: boolean;
}

function isRedirect(value: unknown): value is Redirect {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof Reflect.get(value, "source") === "string" &&
    typeof Reflect.get(value, "destination") === "string" &&
    typeof Reflect.get(value, "permanent") === "boolean"
  );
}

async function loadRedirects(): Promise<Redirect[]> {
  const read = typeof nextConfig === "object" && nextConfig !== null ? Reflect.get(nextConfig, "redirects") : null;
  if (typeof read !== "function") throw new Error("next.config.js has no redirects()");
  const list: unknown = await read();
  if (!Array.isArray(list) || !list.every(isRedirect)) throw new Error("redirects() returned something else");
  return list;
}

/** The pathname a URL is about once its locale prefix is off, as middleware sees it. */
function localeLess(pathname: string): string {
  for (const locale of routing.locales) {
    if (pathname === `/${locale}`) return "/";
    if (pathname.startsWith(`/${locale}/`)) return pathname.slice(locale.length + 1);
  }
  return pathname;
}

const RETIRED: [string, string][] = [
  ["/dashboard", "/admin"],
  ["/dashboard/content", "/admin/knowledge#health"],
  ["/dashboard/quality", "/admin/knowledge#gaps"],
  ["/dashboard/copilot", "/admin/knowledge#copilot"],
];

describe("retired /dashboard redirects", () => {
  it("covers every retired tab in every form middleware accepts, one hop, temporary", async () => {
    const redirects = await loadRedirects();
    const expected = RETIRED.flatMap(([from, to]) =>
      routing.locales.flatMap((locale) => {
        const target = locale === routing.defaultLocale ? to : `/${locale}${to}`;
        const sources = locale === routing.defaultLocale ? [from, `/${locale}${from}`] : [`/${locale}${from}`];
        return sources.map((source) => ({ source, destination: target, permanent: false }));
      })
    );
    for (const redirect of expected) expect(redirects).toContainEqual(redirect);
    expect(redirects.filter((redirect) => localeLess(redirect.source).startsWith("/dashboard"))).toHaveLength(
      expected.length
    );
  });

  it("only ever points at the admin panel, never back under /dashboard", async () => {
    const redirects = (await loadRedirects()).filter((redirect) => localeLess(redirect.source).startsWith("/dashboard"));
    for (const { destination } of redirects) {
      const pathname = localeLess(destination.split("#")[0] ?? "");
      expect(isAdminArea(pathname), destination).toBe(true);
      expect(pathname.startsWith("/dashboard"), destination).toBe(false);
    }
  });

  it("lands on a section the knowledge page has", async () => {
    const pageSources = [
      readFileSync(path.join(ROOT, "app/[locale]/(admin)/admin/knowledge/page.tsx"), "utf8"),
      ...readdirSync(path.join(ROOT, "components/admin/knowledge")).map((file) =>
        readFileSync(path.join(ROOT, "components/admin/knowledge", file), "utf8")
      ),
    ].join("\n");
    for (const section of KNOWLEDGE_SECTIONS) expect(pageSources, section).toContain(`id="${section}"`);

    const hashes = (await loadRedirects())
      .map((redirect) => redirect.destination.split("#")[1])
      .filter((hash): hash is string => hash !== undefined);
    expect(hashes.length).toBeGreaterThan(0);
    for (const hash of hashes) expect(KNOWLEDGE_SECTIONS, hash).toContain(hash);
  });

  it("keeps /dashboard an admin area — defence in depth if a redirect is ever removed", () => {
    expect(ADMIN_AREAS).toContain("/dashboard");
    expect(isAdminArea("/dashboard/quality")).toBe(true);
  });
});
