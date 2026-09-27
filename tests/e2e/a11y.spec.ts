import AxeBuilder from "@axe-core/playwright";
import { test, expect, type Page } from "@playwright/test";
import { adminCookie, applySession, expectSignedInAt, operatorCookie } from "./session";

/**
 * Automated accessibility scan (axe-core, WCAG 2.1 A/AA) plus a keyboard walk
 * through the chrome every operator route carries.
 *
 * The public routes are scanned on every run, including CI. The operator
 * routes need an operator session and the admin panel the admin's
 * (docs/TESTING.md); each block is skipped without its cookie.
 *
 * Threshold: zero `serious` and zero `critical` violations. `minor`/`moderate`
 * findings are listed in the failure message but do not fail a run on their own.
 *
 * What this cannot see: axe returns `incomplete`, not `violation`, for text on a
 * semi-transparent fill (`bg-status-ok/15` and friends), because it cannot
 * composite the background itself. Those pairs are measured by hand instead —
 * see the contrast table in docs/AUDIT.md.
 */

const THEMES = ["light", "dark"] as const;

const PUBLIC_ROUTES = ["/login", "/offline"];
const OPERATOR_ROUTES = [
  "/",
  "/sales-process/scripts",
  "/products",
  "/faq",
  "/company/about",
  "/company/mission-values",
  "/company/onboarding",
];
/** The admin panel pages R3 added or rebuilt (S03–S04, and the S03 monitoring
 * IA: the overview, knowledge quality, the technical page). The person page is
 * reached through the directory, since its path depends on the allow-list. */
const ADMIN_ROUTES = [
  "/admin",
  "/admin/users",
  "/admin/users?view=table",
  "/admin/knowledge",
  "/admin/knowledge?health=stale",
  "/admin/system",
];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** The theme is chosen by the `watertech-theme` localStorage key, which
 * ThemeScript reads before first paint. Seeded through an init script so it is
 * in place before the very first document, and for every navigation after. */
async function useTheme(page: Page, theme: (typeof THEMES)[number]): Promise<void> {
  await page.addInitScript((value) => {
    try {
      window.localStorage.setItem("watertech-theme", value);
    } catch {
      // private mode — the class below is still applied
    }
  }, theme);
}

/** ThemeScript adds `class="dark"` before first paint when the stored value
 * says so, and defaults to light otherwise. */
async function expectTheme(page: Page, theme: (typeof THEMES)[number]): Promise<void> {
  const isDark = await page.evaluate(() => document.documentElement.classList.contains("dark"));
  expect(isDark, `expected the ${theme} theme`).toBe(theme === "dark");
}

async function scan(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();

  const blocking = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  const describe = (list: typeof results.violations) =>
    list.map((v) => `${v.impact}: ${v.id} (${v.nodes.length}) — ${v.helpUrl}`).join("\n");

  expect(
    blocking,
    `serious/critical violations:\n${describe(blocking)}\n\nother findings:\n${describe(
      results.violations.filter((v) => !blocking.includes(v))
    )}`
  ).toEqual([]);
}

for (const theme of THEMES) {
  test.describe(`a11y — public routes (${theme})`, () => {
    for (const route of PUBLIC_ROUTES) {
      test(`${route} has no serious or critical violations`, async ({ page }) => {
        await useTheme(page, theme);
        await page.goto(route);
        await expectTheme(page, theme);
        await scan(page);
      });
    }
  });

  test.describe(`a11y — operator routes (${theme})`, () => {
    test.skip(!operatorCookie, "TEST_OPERATOR_COOKIE is not set");

    for (const route of OPERATOR_ROUTES) {
      test(`${route} has no serious or critical violations`, async ({ context, page, baseURL }) => {
        await applySession(context, operatorCookie ?? "", baseURL);
        await useTheme(page, theme);
        await page.goto(route);
        await expectSignedInAt(page, new RegExp(`${route === "/" ? "localhost:3000/" : route}(\\?|$)`));
        await expectTheme(page, theme);
        // The shell's client islands (pins, changelog badge, favourites) hydrate
        // from user_state; scanning before that would miss their markup.
        await page.waitForLoadState("networkidle");
        await scan(page);
      });
    }
  });
}

for (const theme of THEMES) {
  test.describe(`a11y — admin panel (${theme})`, () => {
    test.skip(!adminCookie, "TEST_SESSION_COOKIE is not set");

    for (const route of ADMIN_ROUTES) {
      test(`${route} has no serious or critical violations`, async ({ context, page, baseURL }) => {
        await applySession(context, adminCookie ?? "", baseURL);
        await useTheme(page, theme);
        await page.goto(route);
        await expectSignedInAt(page, new RegExp(`${escapeRegExp(route)}$`));
        await expectTheme(page, theme);
        await page.waitForLoadState("networkidle");
        await scan(page);
      });
    }

    test("a person page has no serious or critical violations", async ({ context, page, baseURL }) => {
      await applySession(context, adminCookie ?? "", baseURL);
      await useTheme(page, theme);
      await page.goto("/admin/users");
      await expectSignedInAt(page, /\/admin\/users$/);
      const card = page.getByRole("tabpanel").getByRole("link").filter({ hasText: /Operator|Menejer/ }).first();
      test.skip((await card.count()) === 0, "no operator or sales manager on the allow-list yet");
      const href = (await card.getAttribute("href")) ?? "";
      await page.goto(href);
      await expectSignedInAt(page, new RegExp(`${escapeRegExp(href)}$`));
      await expectTheme(page, theme);
      await page.waitForLoadState("networkidle");
      await scan(page);
    });
  });
}

/** A focused element shows a ring (Tailwind's ring is a box-shadow) or an outline. */
async function expectVisibleFocus(page: Page): Promise<void> {
  const indicator = await page.evaluate(() => {
    const el = document.activeElement;
    if (!(el instanceof HTMLElement)) return null;
    const style = getComputedStyle(el);
    return { shadow: style.boxShadow, outline: style.outlineStyle, outlineWidth: style.outlineWidth };
  });
  expect(indicator, "nothing is focused").not.toBeNull();
  const hasRing = indicator !== null && indicator.shadow !== "none";
  const hasOutline = indicator !== null && indicator.outline !== "none" && indicator.outlineWidth !== "0px";
  expect(hasRing || hasOutline, `no focus indicator: ${JSON.stringify(indicator)}`).toBe(true);
}

test.describe("admin keyboard walk", () => {
  test.skip(!adminCookie, "TEST_SESSION_COOKIE is not set");

  test.beforeEach(async ({ context, baseURL }) => {
    await applySession(context, adminCookie ?? "", baseURL);
  });

  test("the AdminShell nav is reachable by Tab, marks the current page and shows focus", async ({ page }) => {
    await page.goto("/admin/users");
    await expectSignedInAt(page, /\/admin\/users$/);
    const nav = page.getByRole("complementary").getByRole("navigation");
    const current = nav.locator('a[aria-current="page"]');
    await expect(current).toHaveCount(1);
    await expect(current).toHaveAttribute("href", /\/admin\/users$/);

    // Tab from the top of the document until focus lands in the side nav.
    await page.locator("body").focus();
    let inNav = false;
    for (let step = 0; step < 15 && !inNav; step += 1) {
      await page.keyboard.press("Tab");
      inNav = await nav.evaluate((el) => el.contains(document.activeElement));
    }
    expect(inNav, "Tab never reached the admin nav").toBe(true);
    await expectVisibleFocus(page);
  });

  test("CompareTable sorts from the keyboard and reaches each row through its link", async ({ page }) => {
    await page.goto("/admin");
    await expectSignedInAt(page, /\/admin$/);
    const table = page.getByRole("region").filter({ has: page.getByRole("table") }).first();
    test.skip((await table.count()) === 0, "no one on the allow-list to compare yet");

    const header = table.getByRole("columnheader").filter({ has: page.getByRole("button") }).first();
    const button = header.getByRole("button");
    const before = await header.getAttribute("aria-sort");
    await button.focus();
    await expectVisibleFocus(page);
    await page.keyboard.press("Enter");
    await expect(header).not.toHaveAttribute("aria-sort", before ?? "none");

    const rowLink = table.getByRole("rowheader").getByRole("link").first();
    test.skip((await rowLink.count()) === 0, "no linked rows");
    await rowLink.focus();
    await expectVisibleFocus(page);
    const href = (await rowLink.getAttribute("href")) ?? "";
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(new RegExp(`${escapeRegExp(href)}$`));
  });

  test("the content-health tabs move with the arrow keys and remember the list in the URL", async ({ page }) => {
    await page.goto("/admin/knowledge");
    await expectSignedInAt(page, /\/admin\/knowledge$/);
    const tablist = page.getByRole("tablist");
    test.skip((await tablist.count()) === 0, "content health could not be read");

    const tabs = tablist.getByRole("tab");
    await expect(tabs).toHaveCount(3);
    await expect(tabs.nth(0)).toHaveAttribute("aria-selected", "true");
    await tabs.nth(0).focus();
    await expectVisibleFocus(page);
    await page.keyboard.press("ArrowRight");
    await expect(tabs.nth(1)).toBeFocused();
    await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "true");
    await expect(page).toHaveURL(/[?&]health=stale/);
    await page.keyboard.press("End");
    await expect(tabs.nth(2)).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("Home");
    await expect(tabs.nth(0)).toHaveAttribute("aria-selected", "true");
  });

  test("a directory card and the person-page access panel are keyboard operable", async ({ page }) => {
    await page.goto("/admin/users");
    await expectSignedInAt(page, /\/admin\/users$/);
    const card = page.getByRole("tabpanel").getByRole("link").filter({ hasText: /Operator|Menejer/ }).first();
    test.skip((await card.count()) === 0, "no operator or sales manager on the allow-list yet");
    await card.focus();
    await expectVisibleFocus(page);
    const href = (await card.getAttribute("href")) ?? "";
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(new RegExp(`${escapeRegExp(href)}$`));

    // The role buttons and the status switch take focus; Escape backs out of the confirm dialog.
    const toggle = page.getByRole("switch");
    await toggle.focus();
    await expectVisibleFocus(page);
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(toggle).toBeFocused();
  });
});

test.describe("company scenes — keyboard", () => {
  test.skip(!operatorCookie, "TEST_OPERATOR_COOKIE is not set");

  test.beforeEach(async ({ context, baseURL }) => {
    await applySession(context, operatorCookie ?? "", baseURL);
  });

  test("the onboarding day header shows focus on its accent fill and toggles its panel", async ({ page }) => {
    await page.goto("/company/onboarding");
    await expectSignedInAt(page, /\/company\/onboarding$/);
    const header = page.locator("button[aria-expanded][aria-controls]").first();
    await header.focus();
    await expectVisibleFocus(page);
    const expanded = await header.getAttribute("aria-expanded");
    await page.keyboard.press("Enter");
    await expect(header).not.toHaveAttribute("aria-expanded", expanded ?? "");
  });
});

/** WCAG relative luminance contrast of two opaque sRGB colours. */
function contrastRatio(a: readonly number[], b: readonly number[]): number {
  const lum = ([r, g, bl]: readonly number[]) => {
    const [lr, lg, lb] = [r, g, bl].map((c) => {
      const s = c / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Parses `rgb(...)` / `rgba(...)` as the browser reports computed colours. */
function parseColor(value: string): [number, number, number, number] {
  const nums = value.match(/[\d.]+/g)?.map(Number) ?? [];
  return [nums[0] ?? 0, nums[1] ?? 0, nums[2] ?? 0, nums[3] ?? 1];
}

for (const theme of THEMES) {
  test.describe(`a11y — nav badge contrast (${theme})`, () => {
    test.skip(!operatorCookie, "TEST_OPERATOR_COOKIE is not set");

    test("sidebar count badges and the whole page pass axe colour-contrast", async ({ context, page, baseURL }) => {
      await applySession(context, operatorCookie ?? "", baseURL);
      await useTheme(page, theme);
      await page.goto("/");
      await expectSignedInAt(page, /localhost:3000\/(\?|$)/);
      await expectTheme(page, theme);
      await page.waitForLoadState("networkidle");

      const results = await new AxeBuilder({ page }).withRules(["color-contrast"]).analyze();
      expect(
        results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`),
        "colour-contrast violations"
      ).toEqual([]);

      // axe reports text on a semi-transparent fill as `incomplete` (it cannot
      // composite the tint), so the badge is measured directly: its 15% status
      // fill is composited over the sidebar surface and compared with the text.
      const badge = page.locator('nav[aria-label] span[class*="bg-status-"]').first();
      test.skip((await badge.count()) === 0, "no sidebar count badge on this account today");

      const measured = await badge.evaluate((el) => {
        const own = getComputedStyle(el);
        let surface = el.parentElement;
        while (surface && /rgba\(.*,\s*0\)$/.test(getComputedStyle(surface).backgroundColor)) {
          surface = surface.parentElement;
        }
        return {
          text: own.color,
          fill: own.backgroundColor,
          surface: surface ? getComputedStyle(surface).backgroundColor : "rgb(255, 255, 255)",
        };
      });

      const [sr, sg, sb] = parseColor(measured.surface);
      const [fr, fg, fb, fa] = parseColor(measured.fill);
      const backdrop = [fr * fa + sr * (1 - fa), fg * fa + sg * (1 - fa), fb * fa + sb * (1 - fa)];
      const [tr, tg, tb] = parseColor(measured.text);
      expect(contrastRatio([tr, tg, tb], backdrop), "badge text vs tinted fill").toBeGreaterThanOrEqual(4.5);
    });
  });
}

test.describe("command palette semantics", () => {
  test.skip(!operatorCookie, "TEST_OPERATOR_COOKIE is not set");

  test("the input is a combobox whose active descendant follows the highlight", async ({ context, page, baseURL }) => {
    await applySession(context, operatorCookie ?? "", baseURL);
    await page.goto("/faq");
    await expectSignedInAt(page, /\/faq$/);

    await page.keyboard.press("Control+k");
    const dialog = page.getByRole("dialog");
    const combobox = dialog.getByRole("combobox");
    await expect(combobox).toBeFocused();

    // "kompaniya" is a top-level page title, so results exist without the search index.
    await combobox.fill("kompaniya");
    const listbox = dialog.getByRole("listbox");
    await expect(listbox).toBeVisible();
    await expect(combobox).toHaveAttribute("aria-expanded", "true");
    await expect(combobox).toHaveAttribute("aria-controls", (await listbox.getAttribute("id")) ?? "");

    const options = listbox.getByRole("option");
    expect(await options.count()).toBeGreaterThan(0);
    await expect(options.first()).toHaveAttribute("aria-selected", "true");
    await expect(combobox).toHaveAttribute("aria-activedescendant", (await options.first().getAttribute("id")) ?? "");

    if ((await options.count()) > 1) {
      await page.keyboard.press("ArrowDown");
      await expect(options.nth(1)).toHaveAttribute("aria-selected", "true");
      await expect(options.first()).toHaveAttribute("aria-selected", "false");
      await expect(combobox).toHaveAttribute("aria-activedescendant", (await options.nth(1).getAttribute("id")) ?? "");
    }

    // No matches: nothing to control, so the combobox reports itself collapsed.
    await combobox.fill("zzzzzzzzqq");
    await expect(combobox).toHaveAttribute("aria-expanded", "false");
    await expect(combobox).not.toHaveAttribute("aria-activedescendant", /.+/);
  });
});

test.describe("keyboard walk", () => {
  test.skip(!operatorCookie, "TEST_OPERATOR_COOKIE is not set");

  test.beforeEach(async ({ context, baseURL }) => {
    await applySession(context, operatorCookie ?? "", baseURL);
  });

  test("the first Tab reaches a skip link that moves focus into <main>", async ({ page }) => {
    await page.goto("/faq");
    await expectSignedInAt(page, /\/faq$/);

    await page.keyboard.press("Tab");
    const skipLink = page.locator(":focus");
    await expect(skipLink).toHaveAttribute("href", "#main-content");
    // sr-only until focused — it must become visible, not stay hidden.
    await expect(skipLink).toBeVisible();

    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/#main-content$/);
    await expect(page.locator(":focus")).toHaveAttribute("id", "main-content");
  });

  test("tabbing on from the skip link reaches the sidebar navigation", async ({ page }) => {
    await page.goto("/faq");
    await expectSignedInAt(page, /\/faq$/);

    await page.keyboard.press("Tab"); // skip link
    // Not the very next stop: the sidebar's collapse toggle sits outside <nav>.
    let reached = false;
    for (let i = 0; i < 6 && !reached; i += 1) {
      await page.keyboard.press("Tab");
      reached = (await page.locator("nav[aria-label] :focus").count()) === 1;
    }
    expect(reached, "no labelled <nav> reached within six tabs").toBe(true);
  });

  test("Ctrl+K opens the command palette, which traps focus and restores it", async ({ page }) => {
    await page.goto("/faq");
    await expectSignedInAt(page, /\/faq$/);

    const searchButton = page.getByRole("button", { name: /Bilimlar bazasidan qidirish/ });
    await searchButton.focus();

    await page.keyboard.press("Control+k");
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    // The trap focuses the first focusable element in the panel: the query input.
    await expect(dialog.locator(":focus")).toHaveCount(1);

    // Tab cannot leave the dialog.
    for (let i = 0; i < 12; i += 1) await page.keyboard.press("Tab");
    await expect(dialog.locator(":focus")).toHaveCount(1);

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(searchButton).toBeFocused();
  });

  test("Ctrl+J opens the copilot panel, which traps focus and restores it", async ({ page }) => {
    await page.goto("/faq");
    await expectSignedInAt(page, /\/faq$/);

    const copilotButton = page.getByRole("button", { name: "Copilot'ni ochish (Ctrl+J)" });
    await copilotButton.focus();

    await page.keyboard.press("Control+j");
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.locator(":focus")).toHaveCount(1);

    for (let i = 0; i < 10; i += 1) await page.keyboard.press("Tab");
    await expect(dialog.locator(":focus")).toHaveCount(1);

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(copilotButton).toBeFocused();
  });

  test("the mobile nav drawer is a modal: focus is trapped and Escape closes it", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/faq");
    await expectSignedInAt(page, /\/faq$/);

    const menuButton = page.getByRole("button", { name: "Navigatsiyani ochish/yopish" });
    await menuButton.focus();
    await menuButton.press("Enter");

    const drawer = page.getByRole("dialog", { name: "Navigatsiya" });
    await expect(drawer).toBeVisible();
    await expect(drawer.locator(":focus")).toHaveCount(1);

    for (let i = 0; i < 8; i += 1) await page.keyboard.press("Tab");
    await expect(drawer.locator(":focus")).toHaveCount(1);

    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();
    await expect(menuButton).toBeFocused();
  });
});
