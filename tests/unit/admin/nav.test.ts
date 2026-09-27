import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import ru from "@/messages/ru.json";
import uz from "@/messages/uz.json";
import {
  ADMIN_NAV_GROUPS,
  ADMIN_NAV_ITEMS,
  ADMIN_NAV_MESSAGES,
  adminNavGroup,
  isNavItemActive,
  type AdminNavItem,
} from "@/lib/admin/nav";

const ROOT = path.resolve(__dirname, "../../..");

type Messages = { [key: string]: string | Messages };
const LOCALES: [string, Messages][] = [
  ["uz", uz],
  ["ru", ru],
];

/** The route tree the admin panel spans, and where its pages live. Since the S03
 * monitoring IA it is /admin alone — /dashboard only redirects (next.config.js). */
const AREAS = [{ base: "/admin", dir: "app/[locale]/(admin)/admin" }] as const;

/** Routes that are deliberately not a nav entry: a row's version history is
 * opened from that row. */
const NOT_IN_NAV: Record<(typeof AREAS)[number]["base"], string[]> = {
  "/admin": ["versions"],
};

function hasPath(tree: Messages, dotted: string): boolean {
  let node: string | Messages | undefined = tree;
  for (const key of dotted.split(".")) {
    if (typeof node !== "object") return false;
    node = node[key];
  }
  return typeof node === "string" && node.trim() !== "";
}

function areaOf(href: string): (typeof AREAS)[number] {
  const area = AREAS.find(({ base }) => href === base || href.startsWith(`${base}/`));
  if (!area) throw new Error(`${href} is outside the admin panel`);
  return area;
}

/** A route group — "(overview)" — adds no URL segment. */
const isRouteGroup = (name: string): boolean => /^\(.+\)$/.test(name);

/** The page.tsx that serves `item.href`: in its folder, or in a route group
 * there (/admin is admin/(overview)/page.tsx, so it can have its own loading.tsx). */
function pageFile(item: AdminNavItem): string {
  const area = areaOf(item.href);
  const rest = item.href.slice(area.base.length).replace(/^\//, "");
  const dir = path.join(ROOT, area.dir, rest);
  const direct = path.join(dir, "page.tsx");
  if (existsSync(direct) || !existsSync(dir)) return direct;
  const grouped = readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && isRouteGroup(entry.name))
    .map((entry) => path.join(dir, entry.name, "page.tsx"))
    .find((file) => existsSync(file));
  return grouped ?? direct;
}

/** Whether a page.tsx exists in `dir` or anywhere below it — /admin/versions has
 * none of its own, only versions/[table]/[id]/page.tsx. */
function hasPageBelow(dir: string): boolean {
  return readdirSync(dir, { withFileTypes: true }).some((entry) =>
    entry.isDirectory() ? hasPageBelow(path.join(dir, entry.name)) : entry.name === "page.tsx"
  );
}

/** The first URL segments below `dir` that have a page, looking through route groups. */
function routesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => {
      const full = path.join(dir, entry.name);
      if (isRouteGroup(entry.name)) return routesUnder(full);
      return hasPageBelow(full) ? [entry.name] : [];
    });
}

describe("ADMIN_NAV_GROUPS completeness", () => {
  it("has the monitoring, content and system groups, in that order, none empty", () => {
    expect(ADMIN_NAV_GROUPS.map((group) => group.id)).toEqual(["monitoring", "content", "system"]);
    for (const group of ADMIN_NAV_GROUPS) expect(group.items.length).toBeGreaterThan(0);
    expect(adminNavGroup("content").items.map((item) => item.href)).toContain("/admin/scripts");
  });

  it("lists every href once, and ADMIN_NAV_ITEMS is the groups flattened", () => {
    const hrefs = ADMIN_NAV_GROUPS.flatMap((group) => group.items.map((item) => item.href));
    expect(new Set(hrefs).size).toBe(hrefs.length);
    expect(ADMIN_NAV_ITEMS.map((item) => item.href)).toEqual(hrefs);
  });

  it("opens with the overview, and marks the landing page exact", () => {
    expect(ADMIN_NAV_ITEMS[0]?.href).toBe("/admin");
    for (const { base } of AREAS) {
      expect(ADMIN_NAV_ITEMS.find((item) => item.href === base)?.exact, base).toBe(true);
    }
  });

  it("has one page per monitoring question, and the technical page under System (S03, R4/S04)", () => {
    // Bosh panel, Xodimlar, Attestatsiya, Bilim sifati — in that order.
    expect(adminNavGroup("monitoring").items.map((item) => item.href)).toEqual([
      "/admin",
      "/admin/users",
      "/admin/assessments",
      "/admin/knowledge",
    ]);
    expect(adminNavGroup("system").items.map((item) => item.href)).toEqual([
      "/admin/activity",
      "/admin/notifications",
      "/admin/trash",
      "/admin/system",
    ]);
    // The retired tabs are redirects now, never a nav entry.
    expect(ADMIN_NAV_ITEMS.filter((item) => item.href.startsWith("/dashboard"))).toEqual([]);
  });

  it.each(ADMIN_NAV_ITEMS.map((item) => [item.href, item] as const))("%s has a page on disk", (_href, item) => {
    expect(existsSync(pageFile(item)), pageFile(item)).toBe(true);
  });

  it.each(AREAS.map((area) => [area.base, area] as const))(
    "every page under %s is in the nav or explicitly exempt",
    (_base, area) => {
      const routes = routesUnder(path.join(ROOT, area.dir));
      const inNav = new Set(
        ADMIN_NAV_ITEMS.filter((item) => item.href.startsWith(`${area.base}/`)).map(
          (item) => item.href.slice(area.base.length).split("/")[1]
        )
      );
      const missing = routes.filter((route) => !inNav.has(route) && !NOT_IN_NAV[area.base].includes(route));
      expect(missing).toEqual([]);
      // ...and the exemptions are real routes, so the list cannot rot.
      for (const route of NOT_IN_NAV[area.base]) expect(routes).toContain(route);
    }
  );

  describe.each(LOCALES)("messages/%s.json", (_locale, messages) => {
    it("has a heading for every group and a label for every item", () => {
      for (const group of ADMIN_NAV_GROUPS) {
        const heading = `${ADMIN_NAV_MESSAGES}.groups.${group.id}`;
        expect(hasPath(messages, heading), heading).toBe(true);
      }
      for (const item of ADMIN_NAV_ITEMS) {
        const key = `${ADMIN_NAV_MESSAGES}.items.${item.label}`;
        expect(hasPath(messages, key), key).toBe(true);
      }
    });

    it("has the shell's own copy", () => {
      for (const key of ["title", "signOut", "sections", "operatorView", "signedInAs"]) {
        expect(hasPath(messages, `admin.shell.${key}`), key).toBe(true);
      }
    });
  });

  it("is what the shell is built from, and the admin layout mounts that one shell", () => {
    const read = (file: string): string => readFileSync(path.join(ROOT, file), "utf8");
    const shell = read("components/admin/AdminShell.tsx");
    expect(shell).toContain('from "@/lib/admin/nav"');
    expect(shell).toContain(`useTranslations("${ADMIN_NAV_MESSAGES}")`);
    expect(read("app/[locale]/(admin)/admin/layout.tsx")).toContain("<AdminShell");
    // The retired second header, its tabs, the area switch and the /dashboard
    // route tree (S03) stay gone.
    for (const file of [
      "components/ManagerMonitoringHeader.tsx",
      "components/dashboard/DashboardTabs.tsx",
      "components/admin/ManagerAreaSwitch.tsx",
      "app/[locale]/dashboard",
    ]) {
      expect(existsSync(path.join(ROOT, file)), file).toBe(false);
    }
  });
});

describe("isNavItemActive", () => {
  const item = (href: string): AdminNavItem => {
    const found = ADMIN_NAV_ITEMS.find((entry) => entry.href === href);
    if (!found) throw new Error(`nav fixture ${href} missing`);
    return found;
  };

  it("lights a landing page only on itself", () => {
    expect(isNavItemActive(item("/admin"), "/admin")).toBe(true);
    expect(isNavItemActive(item("/admin"), "/admin/faq")).toBe(false);
    expect(isNavItemActive(item("/admin"), "/admin/knowledge")).toBe(false);
  });

  it("lights a section on its own pages, including nested ones", () => {
    expect(isNavItemActive(item("/admin/packages"), "/admin/packages")).toBe(true);
    expect(isNavItemActive(item("/admin/packages"), "/admin/packages/groups")).toBe(true);
    expect(isNavItemActive(item("/admin/packages"), "/admin/packages/pkg-1")).toBe(true);
    expect(isNavItemActive(item("/admin/users"), "/admin/users/ali%40example.com")).toBe(true);
    expect(isNavItemActive(item("/admin/knowledge"), "/admin/knowledge")).toBe(true);
    expect(isNavItemActive(item("/admin/system"), "/admin/system")).toBe(true);
  });

  it("matches whole segments only", () => {
    expect(isNavItemActive(item("/admin/packages"), "/admin/packagesx")).toBe(false);
    expect(isNavItemActive(item("/admin/packages"), "/admin/products")).toBe(false);
  });

  it("lights exactly one item on every nav page", () => {
    for (const current of ADMIN_NAV_ITEMS) {
      const lit = ADMIN_NAV_ITEMS.filter((other) => isNavItemActive(other, current.href)).map((other) => other.href);
      expect(lit).toEqual([current.href]);
    }
  });
});
