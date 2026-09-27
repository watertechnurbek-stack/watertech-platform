import { getTranslations } from "next-intl/server";
import { ThumbsDown } from "lucide-react";
import { Link } from "@/i18n/routing";
import { EmptyState } from "@/components/EmptyState";
import { DashboardWidgetError } from "@/components/dashboard/DashboardWidgetError";
import { ChartCard } from "@/components/admin/charts/ChartCard";
import { resolveContentAdminHref, type NotHelpfulGroup } from "@/lib/dashboard/quality";
import type { WidgetData } from "@/lib/dashboard/telemetry-window";
import { findNode } from "@/lib/site-config";

/** "Foydasiz deb belgilangan" (/admin/knowledge#feedback): the pages operators
 * marked "not helpful" in the range, most marks first, each with a link to the
 * admin section that edits it where one exists (doc pages have no content row
 * to edit). The person filter applies. */
export async function NotHelpfulCard({ rows }: { rows: WidgetData<NotHelpfulGroup[]> }) {
  const [t, tEmpty, tNav, tCommon] = await Promise.all([
    getTranslations("pages.admin.knowledge.feedback"),
    getTranslations("emptyState.dashboardNoFeedback"),
    // site-config nodes carry a "nav" message key as `title` (Breadcrumbs does the same).
    getTranslations("nav"),
    getTranslations("common"),
  ]);

  return (
    <ChartCard id="feedback" icon={ThumbsDown} title={t("title")} description={t("description")}>
      {!rows.ok ? (
        <DashboardWidgetError />
      ) : rows.data.length === 0 ? (
        <EmptyState variant="compact" stateKey="dashboardNoFeedback" title={tEmpty("title")} reason={tEmpty("reason")} />
      ) : (
        <ul className="divide-y divide-border">
          {rows.data.map((row) => {
            const node = findNode(row.path);
            const adminHref = resolveContentAdminHref(row.path);
            return (
              <li key={row.path} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2.5 first:pt-0 last:pb-0">
                <div className="min-w-0 flex-1 basis-40">
                  <p className="truncate text-[13px] font-medium text-primary-dark">{node ? tNav(node.title) : row.path}</p>
                  <p className="truncate text-[12px] text-text-secondary">{row.path}</p>
                </div>
                <span className="shrink-0 text-[12.5px] font-semibold tabular-nums text-primary-dark">
                  {t("marks", { count: row.count })}
                </span>
                {adminHref && (
                  <Link
                    href={adminHref}
                    className="shrink-0 rounded-lg border border-border bg-surface px-2.5 py-1 text-[12px] font-medium text-primary-dark transition-colors hover:bg-surface-alt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    {tCommon("edit")}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </ChartCard>
  );
}
