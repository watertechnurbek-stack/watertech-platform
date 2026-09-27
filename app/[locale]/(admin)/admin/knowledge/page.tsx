import type { Metadata } from "next";
import { getTranslations, unstable_setRequestLocale } from "next-intl/server";
import { Trophy } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { DashboardWidgetError } from "@/components/dashboard/DashboardWidgetError";
import { OperatorFilter } from "@/components/dashboard/OperatorFilter";
import { RangePicker } from "@/components/dashboard/RangePicker";
import { TopContentTable } from "@/components/admin/TopContentTable";
import { ChartCard } from "@/components/admin/charts/ChartCard";
import { ContentHealthCard } from "@/components/admin/knowledge/ContentHealthCard";
import { CopilotStatsCard } from "@/components/admin/knowledge/CopilotStatsCard";
import { KnowledgeGapsCard } from "@/components/admin/knowledge/KnowledgeGapsCard";
import { NotHelpfulCard } from "@/components/admin/knowledge/NotHelpfulCard";
import { requireAdminPage } from "@/lib/auth/server-session";
import { KNOWLEDGE_PATH, USAGE_LIMIT, parseHealthSegment } from "@/lib/admin/knowledge";
import { fetchContentHealth } from "@/lib/admin/monitoring-queries";
import { fetchPeopleLookup, fetchTopContent } from "@/lib/admin/people-queries";
import { fetchCopilotStats, fetchCopilotUnanswered } from "@/lib/dashboard/copilot-window";
import { MONITORING_RANGE_DAYS, parseDashboardRange, type DashboardRange } from "@/lib/dashboard/range";
import { fetchNotHelpful, fetchZeroResultSearches } from "@/lib/dashboard/telemetry-window";

export async function generateMetadata({ params: { locale } }: { params: { locale: string } }): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: "pages.admin.knowledge" });
  return { title: t("title") };
}

/**
 * "Bilim sifati" (/admin/knowledge, S03 monitoring IA) — one question: is the
 * knowledge base answering the operators' questions? What they could not find
 * (zero-result searches and Copilot's unanswered questions, merged), what they
 * marked "not helpful", the content's own health, what they use most, and how
 * Copilot does. One range (?from&to, two weeks by default) and an optional
 * person (?op): the telemetry lists follow the person, and the cards whose
 * source has no per-person view say they cover everyone.
 *
 * The admin gate runs here as on every monitoring page, then every read starts
 * at once — the people for the filter included — each its own widget
 * (CLAUDE.md §15). The retired /dashboard/content, /quality and /copilot
 * redirect to this page's #health, #gaps and #copilot (next.config.js).
 */
export default async function KnowledgePage({
  params: { locale },
  searchParams,
}: {
  params: { locale: string };
  searchParams: Record<string, string | string[] | undefined>;
}) {
  unstable_setRequestLocale(locale);
  await requireAdminPage(locale);

  const range = parseDashboardRange(searchParams, { defaultDays: MONITORING_RANGE_DAYS });
  // Copilot's log and the top-content function have no per-person view.
  const everyone: DashboardRange = { ...range, operatorEmail: null };
  const filtered = range.operatorEmail !== null;

  const [t, tEmpty, people, searches, unanswered, notHelpful, health, topContent, copilot] = await Promise.all([
    getTranslations("pages.admin.knowledge"),
    getTranslations("pages.admin.overview.empty.noEvents"),
    fetchPeopleLookup(),
    fetchZeroResultSearches(range),
    fetchCopilotUnanswered(everyone),
    fetchNotHelpful(range),
    fetchContentHealth(),
    fetchTopContent(everyone, USAGE_LIMIT),
    fetchCopilotStats(everyone),
  ]);

  const filteredPerson = people.ok ? people.data.find((person) => person.email === range.operatorEmail) : undefined;
  const filterName = filteredPerson?.fullName?.trim() || range.operatorEmail;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="space-y-4">
        <div className="min-w-0">
          <h1 className="text-[24px] font-bold text-primary-dark">{t("title")}</h1>
          <p className="mt-1 text-[13px] text-text-secondary">{t("description")}</p>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <RangePicker range={range} basePath={KNOWLEDGE_PATH} />
          <OperatorFilter
            range={range}
            basePath={KNOWLEDGE_PATH}
            locale={locale}
            people={people.ok ? people.data : null}
          />
        </div>
        {filterName && (
          <p role="status" className="text-[12.5px] text-text-secondary">
            {t("filterNote", { name: filterName })}
          </p>
        )}
      </div>

      <KnowledgeGapsCard searches={searches} copilot={unanswered} filtered={filtered} />

      <div className="grid gap-4 lg:grid-cols-2">
        <NotHelpfulCard rows={notHelpful} />
        <CopilotStatsCard stats={copilot} filtered={filtered} />
      </div>

      <ContentHealthCard health={health} initial={parseHealthSegment(searchParams.health)} />

      <ChartCard
        id="usage"
        icon={Trophy}
        title={t("usage.title")}
        description={filtered ? `${t("usage.description")} ${t("usage.filteredNote")}` : t("usage.description")}
      >
        {!topContent.ok ? (
          <DashboardWidgetError />
        ) : topContent.data.length === 0 ? (
          <EmptyState variant="compact" stateKey="dashboardNoEvents" title={tEmpty("title")} reason={tEmpty("reason")} />
        ) : (
          <TopContentTable items={topContent.data} variant="full" />
        )}
      </ChartCard>
    </div>
  );
}
