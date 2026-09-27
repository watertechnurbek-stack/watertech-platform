import { describe, expect, it } from "vitest";
import { NAV_ICONS, type NavIconName } from "@/lib/nav-icons";
import { flattenTree } from "@/lib/site-config";

// Every operator page shows its own icon in the sidebar and on its section's
// landing page (lib/nav-icons.ts): one per page, none shared — so the collapsed
// rail stays readable by icon alone — and none unused, because every entry of
// NAV_ICONS ships in the operator layout's bundle.

const nodes = flattenTree();

describe("siteTree page icons", () => {
  it("gives every page an icon that NAV_ICONS renders", () => {
    for (const node of nodes) {
      expect(NAV_ICONS[node.icon], `${node.title} (${node.path})`).toBeDefined();
    }
  });

  it("never gives two pages the same icon", () => {
    const byIcon = new Map<NavIconName, string[]>();
    for (const node of nodes) byIcon.set(node.icon, [...(byIcon.get(node.icon) ?? []), node.title]);
    const shared = [...byIcon].filter(([, titles]) => titles.length > 1);
    expect(shared).toEqual([]);
  });

  it("holds no icon that no page uses", () => {
    const used = new Set(nodes.map((node) => node.icon));
    expect(Object.keys(NAV_ICONS).filter((name) => !used.has(name as NavIconName))).toEqual([]);
  });

  it("covers the whole tree, grandchildren included", () => {
    expect(nodes.length).toBe(Object.keys(NAV_ICONS).length);
    expect(nodes.find((node) => node.path === "/tools/amocrm/reports")?.icon).toBe("ChartColumn");
  });
});
