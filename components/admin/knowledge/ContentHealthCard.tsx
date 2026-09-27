import type { ReactNode } from "react";
import { getLocale, getTranslations } from "next-intl/server";
import { FileStack } from "lucide-react";
import { Link } from "@/i18n/routing";
import { EmptyState } from "@/components/EmptyState";
import { DashboardWidgetError } from "@/components/dashboard/DashboardWidgetError";
import { QuickActionButton } from "@/components/dashboard/QuickActionButton";
import { ChartCard } from "@/components/admin/charts/ChartCard";
import { ContentHealthTabs, type HealthTab } from "@/components/admin/knowledge/ContentHealthTabs";
import { formatDate } from "@/lib/admin/format";
import { HEALTH_TABLE_LABEL, type HealthSegment } from "@/lib/admin/knowledge";
import { publishFromDashboard, touchContent } from "@/lib/dashboard/actions";
import { STALE_DAYS, adminEditHref, type ContentHealth, type ContentHealthRow } from "@/lib/dashboard/content-health";
import type { WidgetData } from "@/lib/dashboard/telemetry-window";
import type { EmptyStateKey } from "@/lib/empty-states";

export interface ContentHealthCardProps {
  health: WidgetData<ContentHealth>;
  /** The list the card opens on (`?health=`). */
  initial: HealthSegment;
}

const ACTION_CLASS =
  "shrink-0 rounded-lg border border-border bg-surface px-2.5 py-1 text-[12px] font-medium text-primary-dark transition-colors hover:bg-surface-alt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";

/**
 * "Kontent salomatligi" (/admin/knowledge#health): drafts waiting to be
 * published, published content not touched for STALE_DAYS days, and content
 * with no Russian text — one card, one segmented control (ContentHealthTabs)
 * over the three lists. Each row links to its editor and has one quick action:
 * publish (through the publish gate), "still accurate" (touches the row), or
 * the editor's RU section. Not about people, so the person filter does not
 * apply; content health is cached for five minutes.
 */
export async function ContentHealthCard({ health, initial }: ContentHealthCardProps) {
  const [t, tNav, tToast, locale] = await Promise.all([
    getTranslations("pages.admin.knowledge.health"),
    getTranslations("admin.nav"),
    getTranslations("toast"),
    getLocale(),
  ]);

  async function list(
    rows: readonly ContentHealthRow[],
    total: number,
    emptyKey: EmptyStateKey,
    action: (row: ContentHealthRow) => ReactNode
  ): Promise<ReactNode> {
    if (rows.length === 0) {
      const tEmpty = await getTranslations(`emptyState.${emptyKey}`);
      return <EmptyState variant="compact" stateKey={emptyKey} title={tEmpty("title")} reason={tEmpty("reason")} />;
    }
    return (
      <>
        <ul className="divide-y divide-border">
          {rows.map((row) => (
            <li
              key={`${row.table}:${row.id}`}
              className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 py-2.5 first:pt-0 last:pb-0"
            >
              <div className="min-w-0 flex-1 basis-48">
                <Link
                  href={adminEditHref(row.table, row.id)}
                  className="block truncate rounded text-[13px] font-medium text-primary-dark hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  {row.title}
                </Link>
                <p className="truncate text-[12px] text-text-secondary">
                  {t("rowMeta", {
                    section: tNav(`items.${HEALTH_TABLE_LABEL[row.table]}`),
                    date: formatDate(row.updatedAt, locale),
                  })}
                  {row.updatedBy ? ` · ${row.updatedBy}` : ""}
                </p>
              </div>
              {action(row)}
            </li>
          ))}
        </ul>
        {total > rows.length && (
          <p className="mt-2 text-[12px] text-text-secondary">{t("more", { count: total - rows.length, shown: rows.length })}</p>
        )}
      </>
    );
  }

  let body: ReactNode;
  if (!health.ok) {
    body = <DashboardWidgetError />;
  } else {
    const { data } = health;
    const tabs: HealthTab[] = [
      {
        id: "drafts",
        label: t("segments.drafts"),
        count: data.draftsTotal,
        panel: await list(data.drafts, data.draftsTotal, "dashboardNoDrafts", (row) => (
          <QuickActionButton
            label={t("publish")}
            pendingLabel={t("publishing")}
            successToast={tToast("published")}
            action={publishFromDashboard}
            table={row.table}
            id={row.id}
            version={row.version}
            editHref={adminEditHref(row.table, row.id)}
          />
        )),
      },
      {
        id: "stale",
        label: t("segments.stale", { days: STALE_DAYS }),
        count: data.staleTotal,
        panel: await list(data.stale, data.staleTotal, "dashboardNoStale", (row) => (
          <QuickActionButton
            label={t("markFresh")}
            pendingLabel={t("marking")}
            successToast={tToast("saved")}
            action={touchContent}
            table={row.table}
            id={row.id}
            version={row.version}
            editHref={adminEditHref(row.table, row.id)}
          />
        )),
      },
      {
        id: "missingRu",
        label: t("segments.missingRu"),
        count: data.missingRuTotal,
        panel: await list(data.missingRu, data.missingRuTotal, "dashboardNoMissingRu", (row) => (
          <Link href={`${adminEditHref(row.table, row.id)}#ru`} className={ACTION_CLASS}>
            {t("translate")}
          </Link>
        )),
      },
    ];
    body = <ContentHealthTabs tabs={tabs} initial={initial} label={t("segmentsLabel")} />;
  }

  return (
    <ChartCard id="health" icon={FileStack} title={t("title")} description={t("description")}>
      {body}
    </ChartCard>
  );
}
