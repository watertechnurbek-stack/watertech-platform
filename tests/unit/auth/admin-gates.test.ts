import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// The page-level layer of the auth model (CLAUDE.md §7, layer 4): the admin
// layout and every monitoring and people page refuse a non-admin session on
// their own, whatever middleware did. requireAdminPage's behaviour is covered
// in server-session.test.ts; this pins where it is called.

const ROOT = path.resolve(__dirname, "../../..");
const GATE = /await requireAdminPage\(locale\)/;

function read(file: string): string {
  return readFileSync(path.join(ROOT, file), "utf8");
}

/** The monitoring pages (S03) and the technical page: each reads telemetry or
 * the allow-list, so each refuses a non-admin itself — a layout is not re-run
 * on client navigation between its pages. */
const MONITORING_PAGES = [
  "app/[locale]/(admin)/admin/(overview)/page.tsx",
  "app/[locale]/(admin)/admin/knowledge/page.tsx",
  "app/[locale]/(admin)/admin/system/page.tsx",
];

describe("admin page gates", () => {
  it("the admin layout refuses a non-admin before rendering the shell", () => {
    const source = read("app/[locale]/(admin)/admin/layout.tsx");
    expect(source).toMatch(GATE);
    // The gate runs before anything is rendered or read.
    expect(source.search(GATE)).toBeLessThan(source.indexOf("getMessages()"));
  });

  it("the /dashboard route tree is gone — its old URLs only redirect to gated /admin pages", () => {
    expect(existsSync(path.join(ROOT, "app/[locale]/dashboard"))).toBe(false);
  });

  it.each(MONITORING_PAGES)("%s refuses a non-admin before any read", (file) => {
    const source = read(file);
    expect(source).toMatch(GATE);
    expect(source.search(GATE)).toBeLessThan(source.indexOf("Promise.all("));
  });

  it.each(["app/[locale]/(admin)/admin/users/page.tsx", "app/[locale]/(admin)/admin/users/[email]/page.tsx"])(
    "%s reads the admin session itself",
    (file) => {
      expect(read(file)).toMatch(GATE);
    }
  );
});
