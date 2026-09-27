import { test, expect, type Page } from "@playwright/test";
import { useSalesManagerSession } from "./session";

// Unauthenticated: middleware must send every gated route to the login page of
// the same locale, with no error query (that one is for signed-in users who
// aren't on the allow-list).

const LOGIN_BUTTON = { uz: "Google bilan kirish", ru: "Войти через Google" } as const;

const GATED_ROUTES: { path: string; login: RegExp; locale: keyof typeof LOGIN_BUTTON }[] = [
  { path: "/", login: /\/login$/, locale: "uz" },
  { path: "/admin", login: /\/login$/, locale: "uz" },
  { path: "/admin/users", login: /\/login$/, locale: "uz" },
  { path: "/ru/admin/users", login: /\/ru\/login$/, locale: "ru" },
  { path: "/admin/users/ali%40example.com", login: /\/login$/, locale: "uz" },
  { path: "/ru/admin/users/ali%40example.com", login: /\/ru\/login$/, locale: "ru" },
  { path: "/admin/knowledge", login: /\/login$/, locale: "uz" },
  { path: "/ru/admin/system", login: /\/ru\/login$/, locale: "ru" },
  { path: "/ru/", login: /\/ru\/login$/, locale: "ru" },
  // Regression for the matcher bug where a bare `products/` exclusion
  // shadowed these routes for the default locale — no next-intl rewrite and
  // no auth gate, so they 404'd instead of redirecting to /login.
  { path: "/products/comparisons", login: /\/login$/, locale: "uz" },
  { path: "/products/roadmap", login: /\/login$/, locale: "uz" },
  { path: "/products/technical-docs", login: /\/login$/, locale: "uz" },
  { path: "/ru/products/comparisons", login: /\/ru\/login$/, locale: "ru" },
  { path: "/ru/products/roadmap", login: /\/ru\/login$/, locale: "ru" },
  { path: "/ru/products/technical-docs", login: /\/ru\/login$/, locale: "ru" },
  // Regression for the matcher's unscoped file-extension exclusion: a trailing
  // `.json`/`.webp`/`.map` skipped middleware on any path, so these rendered
  // the operator shell (in its not-found state) to an anonymous visitor and
  // wrote a fresh ISR cache entry per URL.
  { path: "/sales-process/scripts/lead-orqali-tushgan.json", login: /\/login$/, locale: "uz" },
  { path: "/ru/sales-process/battle-cards/alfa-therm.webp", login: /\/ru\/login$/, locale: "ru" },
  { path: "/tools/amocrm/lead-creation.map", login: /\/login$/, locale: "uz" },
  { path: "/admin/faq/x.png", login: /\/login$/, locale: "uz" },
  { path: "/x.json", login: /\/login$/, locale: "uz" },
];

// The other half of the matcher: what it still excludes must keep being served
// to a browser with no session — the service worker, the PWA manifest and the
// three public/ asset folders. A redirect here would break installation and
// every catalog image.
const PUBLIC_ASSETS: { path: string; type: RegExp }[] = [
  { path: "/sw.js", type: /javascript/ },
  { path: "/manifest.webmanifest", type: /manifest\+json|json/ },
  { path: "/icons/icon-192.png", type: /image\/png/ },
  { path: "/certificates/sertifikat-atl-asosiy.png", type: /image\/png/ },
  { path: "/products/truba-ppr.jpg", type: /image\/jpeg/ },
];

test.describe("auth gate without a session", () => {
  for (const { path, login, locale } of GATED_ROUTES) {
    test(`${path} redirects to the ${locale} login page`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(login);
      await expect(page.getByText(LOGIN_BUTTON[locale])).toBeVisible();
    });
  }

  for (const { path, type } of PUBLIC_ASSETS) {
    test(`${path} is served without a session`, async ({ request }) => {
      const response = await request.get(path, { maxRedirects: 0 });
      expect(response.status()).toBe(200);
      expect(response.headers()["content-type"] ?? "").toMatch(type);
    });
  }
});

// Optional: the admin's session cookie captured locally (see docs/TESTING.md).
// Never set in CI — there is no automated Google sign-in.
const sessionCookie = process.env.TEST_SESSION_COOKIE;

function parseCookieHeader(header: string): { name: string; value: string }[] {
  return header
    .split(";")
    .map((pair) => pair.trim())
    .filter((pair) => pair.includes("="))
    .map((pair) => {
      const separator = pair.indexOf("=");
      return { name: pair.slice(0, separator), value: pair.slice(separator + 1) };
    });
}

async function expectStillOn(page: Page, path: RegExp): Promise<void> {
  await expect(page, "redirected away — TEST_SESSION_COOKIE is expired or not the admin's").toHaveURL(path);
}

test.describe("admin session (TEST_SESSION_COOKIE)", () => {
  test.skip(!sessionCookie, "TEST_SESSION_COOKIE is not set");

  test.beforeEach(async ({ context, baseURL }) => {
    const url = baseURL ?? "http://localhost:3000";
    await context.addCookies(parseCookieHeader(sessionCookie ?? "").map((cookie) => ({ ...cookie, url })));
  });

  // S03 monitoring IA: one question per page. Each widget renders its data or
  // its own empty/error state, so the headings are there either way.
  test("/admin renders its headline numbers, the attention list, the team and the content state", async ({ page }) => {
    await page.goto("/admin");
    await expectStillOn(page, /\/admin$/);
    await expect(page.getByRole("heading", { level: 1, name: "Bosh panel", exact: true })).toBeVisible();
    for (const heading of ["Diqqat talab qiladi", "Jamoa", "Eng ko'p ishlatilgan materiallar", "Kontent holati"]) {
      await expect(page.getByRole("heading", { level: 2, name: heading, exact: true })).toBeVisible();
    }
    // One row per CMS section of the nav's content group.
    await expect(page.getByText(/^\d+ nashr$/)).toHaveCount(9);
  });

  test("/admin/knowledge renders its five sections", async ({ page }) => {
    await page.goto("/admin/knowledge");
    await expectStillOn(page, /\/admin\/knowledge$/);
    await expect(page.getByRole("heading", { level: 1, name: "Bilim sifati", exact: true })).toBeVisible();
    for (const heading of [
      "Topilmagan savollar",
      "Foydasiz deb belgilangan",
      "Copilot",
      "Kontent salomatligi",
      "Eng ko'p ishlatilgan materiallar",
    ]) {
      await expect(page.getByRole("heading", { level: 2, name: heading, exact: true })).toBeVisible();
    }
  });

  test("/admin/system renders the Web Vitals card", async ({ page }) => {
    await page.goto("/admin/system");
    await expectStillOn(page, /\/admin\/system$/);
    await expect(page.getByRole("heading", { level: 2, name: "Web Vitals", exact: true })).toBeVisible();
  });

  // Read-only: nothing here writes the allow-list. The directory (R3/S04) opens
  // on cards; ?view=table is the management table this test is about — the
  // directory itself is tests/e2e/people.spec.ts.
  test("/admin/users lists the allow-list and locks the admin's own row", async ({ page }) => {
    await page.goto("/admin/users?view=table");
    await expectStillOn(page, /\/admin\/users\?view=table$/);
    await expect(page.getByRole("heading", { level: 1, name: "Xodimlar", exact: true })).toBeVisible();
    const ownRow = page.getByRole("row").filter({ hasText: "Siz" });
    await expect(ownRow).toHaveCount(1);
    // An admin row: badge, disabled controls, and the note they point at (0020).
    // The badge sits next to the email; the select's own "Admin" option does not count.
    await expect(ownRow.getByRole("cell").first().getByText("Admin", { exact: true })).toBeVisible();
    await expect(ownRow.getByRole("combobox")).toBeDisabled();
    await expect(ownRow.getByRole("button", { name: "To'xtatish" })).toBeDisabled();
    await expect(page.getByText("Admin faqat SQL Editor orqali boshqariladi")).toBeVisible();
  });

  test("the add dialog offers Operator and Menejer, never Admin", async ({ page }) => {
    await page.goto("/admin/users");
    await expectStillOn(page, /\/admin\/users$/);
    await page.getByRole("button", { name: "+ Xodim qo'shish" }).click();
    const role = page.getByRole("dialog").getByLabel("Rol", { exact: true });
    await expect(role.getByRole("option")).toHaveText(["Operator", "Menejer"]);
  });

  // Preview: the admin may open the operator app, and the avatar menu leads back.
  test("/ renders the operator app, and the avatar menu opens the admin panel", async ({ page }) => {
    await page.goto("/");
    await expectStillOn(page, /localhost:\d+\/$/);
    await page.getByRole("button", { name: "Foydalanuvchi menyusi" }).click();
    await page.getByRole("menuitem", { name: "Admin panel" }).click();
    await expectStillOn(page, /\/admin$/);
  });
});

// Optional: a sales manager's session (TEST_MANAGER_COOKIE, tests/e2e/session.ts).
// Role model v2: the operator app, and nothing of the admin panel.
test.describe("sales manager session (TEST_MANAGER_COOKIE)", () => {
  useSalesManagerSession();

  test("/ renders the operator app, with no admin panel entry", async ({ page }) => {
    await page.goto("/");
    await expect(page, "redirected away — TEST_MANAGER_COOKIE is expired").toHaveURL(/localhost:\d+\/$/);
    await page.getByRole("button", { name: "Foydalanuvchi menyusi" }).click();
    await expect(page.getByRole("menuitem", { name: "Admin panel" })).toHaveCount(0);
  });

  // The retired /dashboard URLs redirect to /admin first (next.config.js); the
  // admin gate then sends a sales manager home — keeping the section's #hash,
  // which a browser carries over a redirect that names none.
  for (const path of ["/admin", "/admin/users", "/admin/knowledge", "/admin/system", "/dashboard", "/dashboard/quality"]) {
    test(`${path} sends a sales manager home`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/localhost:\d+\/(#[a-z]+)?$/);
    });
  }

  test("/ru/admin/users sends a sales manager to the ru home", async ({ page }) => {
    await page.goto("/ru/admin/users");
    await expect(page).toHaveURL(/\/ru$/);
  });
});
