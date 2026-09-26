import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// The page-level layer of the auth model (CLAUDE.md §7, layer 4): both admin
// layouts and every /dashboard page refuse a non-admin session on their own,
// whatever middleware did. requireAdminPage's behaviour is covered in
// server-session.test.ts; this pins where it is called.

const ROOT = path.resolve(__dirname, "../../..");
const GATE = /await requireAdminPage\(locale\)/;

function read(file: string): string {
  return readFileSync(path.join(ROOT, file), "utf8");
}

function pages(dir: string): string[] {
  return readdirSync(path.join(ROOT, dir)).flatMap((name) => {
    const rel = path.join(dir, name);
    if (statSync(path.join(ROOT, rel)).isDirectory()) return pages(rel);
    return name === "page.tsx" ? [rel] : [];
  });
}

describe("admin page gates", () => {
  it.each(["app/[locale]/(admin)/admin/layout.tsx", "app/[locale]/dashboard/layout.tsx"])(
    "%s refuses a non-admin before rendering the shell",
    (file) => {
      const source = read(file);
      expect(source).toMatch(GATE);
      // The gate runs before anything is rendered or read.
      expect(source.search(GATE)).toBeLessThan(source.indexOf("getMessages()"));
    }
  );

  const dashboardPages = pages("app/[locale]/dashboard");

  it("finds the dashboard pages", () => {
    expect(dashboardPages.length).toBeGreaterThanOrEqual(4);
  });

  it.each(dashboardPages)("%s calls requireAdminPage itself", (file) => {
    expect(read(file)).toMatch(GATE);
  });

  it.each(["app/[locale]/(admin)/admin/users/page.tsx", "app/[locale]/(admin)/admin/users/[email]/page.tsx"])(
    "%s reads the admin session itself",
    (file) => {
      expect(read(file)).toMatch(/await requireAdminPage\(locale\)/);
    }
  );

  // The attestation (docs/ATTESTATION.md §7): results, the item bank with its
  // answer keys, the rubrics — every page refuses a non-admin itself, before
  // it reads anything.
  const assessmentPages = pages("app/[locale]/(admin)/admin/assessments");

  it("finds the attestation pages", () => {
    expect(assessmentPages.map((file) => file.split(path.sep).join("/")).sort()).toEqual([
      "app/[locale]/(admin)/admin/assessments/items/[id]/page.tsx",
      "app/[locale]/(admin)/admin/assessments/items/page.tsx",
      "app/[locale]/(admin)/admin/assessments/page.tsx",
      "app/[locale]/(admin)/admin/assessments/settings/page.tsx",
    ]);
  });

  it.each(assessmentPages)("%s calls requireAdminPage before any read", (file) => {
    const source = read(file);
    expect(source).toMatch(GATE);
    expect(source.search(GATE)).toBeLessThan(source.indexOf("adminAttestationRepo()"));
  });
});
