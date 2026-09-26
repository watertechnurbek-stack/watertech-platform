import "server-only";
import { adminNavGroup, type AdminNavItem } from "@/lib/admin/nav";
import { countRowsByStatus, type OverviewTable, type StatusCounts } from "@/lib/admin/queries";
import { getContentHealth, type ContentHealth } from "@/lib/dashboard/content-health";
import { settleWidget, type WidgetData } from "@/lib/dashboard/telemetry-window";
import { countUnreadOfKind } from "@/lib/notifications/queries";

// The monitoring pages' reads that are not telemetry (S03): content counts,
// content health and the publish gate's unread notices, each as a widget —
// the helpers underneath throw on a failed query, settleWidget turns that into
// { ok: false } so the page renders that widget's error state and nothing else
// (CLAUDE.md §15).

/** One CMS section of the overview's content-status card: its nav entry and its counts. */
export interface ContentSectionStatus {
  item: AdminNavItem;
  counts: StatusCounts;
}

/** The content table behind each section of the nav's content group. */
const TABLE_BY_HREF: Readonly<Record<string, OverviewTable>> = {
  "/admin/scripts": "content_scripts",
  "/admin/objections": "content_objections",
  "/admin/faq": "content_faqs",
  "/admin/competitors": "content_competitors",
  "/admin/packages": "content_packages",
  "/admin/products": "content_products",
  "/admin/changelog": "content_changelog",
  "/admin/contacts": "content_contacts",
  "/admin/sops": "content_sops",
};

/** Row and draft counts per CMS section, in nav order — counts only (head:
 * true), never rows; scripts carry large JSONB. One widget: any failed count
 * fails it. */
export function fetchContentStatus(): Promise<WidgetData<ContentSectionStatus[]>> {
  const sections = adminNavGroup("content").items.flatMap((item) => {
    const table = TABLE_BY_HREF[item.href];
    return table ? [{ item, table }] : [];
  });
  return settleWidget("content status counts", async () => {
    const counts = await Promise.all(sections.map(({ table }) => countRowsByStatus(table)));
    return sections.map(({ item }, index) => ({ item, counts: counts[index] ?? { total: 0, draft: 0 } }));
  });
}

/** Drafts, stale and untranslated rows (cached five minutes, tag "content"). */
export function fetchContentHealth(): Promise<WidgetData<ContentHealth>> {
  return settleWidget("content health", getContentHealth);
}

/** Unread "publish blocked" notices of the publish gate. */
export function fetchUnreadGateBlocked(): Promise<WidgetData<number>> {
  return settleWidget("admin_notifications gate_blocked count", () => countUnreadOfKind("gate_blocked"));
}
