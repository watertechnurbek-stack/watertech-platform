import { expect, test } from "@playwright/test";
import { expectSignedInAt, useAdminSession } from "./session";

/**
 * S03 monitoring IA: the retired /dashboard tabs redirect to the admin pages
 * that took their content (next.config.js `redirects()`), before middleware.
 *
 * Without a session: the redirect itself answers — 307 to an /admin URL and no
 * page — which is what makes answering before the auth gate safe; the gate then
 * refuses on the next request (auth-gate.spec.ts). Runs everywhere, CI included.
 *
 * With the admin's session (TEST_SESSION_COOKIE, skipped without it like every
 * signed-in spec): each old URL ends on its new page and section.
 */

const REDIRECTS: { from: string; to: string; heading: string }[] = [
  { from: "/dashboard", to: "/admin", heading: "Bosh panel" },
  { from: "/dashboard/content", to: "/admin/knowledge#health", heading: "Bilim sifati" },
  { from: "/dashboard/quality", to: "/admin/knowledge#gaps", heading: "Bilim sifati" },
  { from: "/dashboard/copilot", to: "/admin/knowledge#copilot", heading: "Bilim sifati" },
];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

test.describe("retired /dashboard URLs without a session", () => {
  for (const { from, to } of REDIRECTS) {
    test(`${from} answers 307 → ${to}, with no page`, async ({ request }) => {
      const response = await request.get(from, { maxRedirects: 0 });
      expect(response.status()).toBe(307);
      expect(response.headers()["location"]).toBe(to);
      expect(await response.text()).not.toContain("<html");
    });
  }

  test("/ru/dashboard/quality keeps the locale and the person filter", async ({ request }) => {
    const response = await request.get("/ru/dashboard/quality?op=ali%40example.com", { maxRedirects: 0 });
    expect(response.status()).toBe(307);
    expect(response.headers()["location"]).toBe("/ru/admin/knowledge?op=ali%40example.com#gaps");
  });
});

test.describe("retired /dashboard URLs with the admin session", () => {
  useAdminSession();

  for (const { from, to, heading } of REDIRECTS) {
    test(`${from} lands on ${to}`, async ({ page }) => {
      await page.goto(from);
      await expectSignedInAt(page, new RegExp(`${escapeRegExp(to)}$`));
      await expect(page.getByRole("heading", { level: 1, name: heading, exact: true })).toBeVisible();
    });
  }
});
