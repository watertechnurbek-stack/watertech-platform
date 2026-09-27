import type { Metadata } from "next";
import { getTranslations, unstable_setRequestLocale } from "next-intl/server";
import { AdminOverview } from "@/components/admin/AdminOverview";
import { requireAdminPage } from "@/lib/auth/server-session";
import { attentionSkippedSources, buildAttentionItems } from "@/lib/admin/attention";
import { gapKpi, sumCounts } from "@/lib/admin/knowledge";
import { fetchContentHealth, fetchContentStatus, fetchUnreadGateBlocked } from "@/lib/admin/monitoring-queries";
import { fetchPeopleOverview, fetchTopContent } from "@/lib/admin/people-queries";
import { fetchCopilotStats } from "@/lib/dashboard/copilot-window";
import { STALE_DAYS } from "@/lib/dashboard/content-health";
import {
  MONITORING_RANGE_DAYS,
  parseDashboardRange,
  previousEqualRange,
  rangeSearchParams,
  type DashboardRange,
} from "@/lib/dashboard/range";
import { fetchKpiTotals, fetchNotHelpful, fetchZeroResultSearches } from "@/lib/dashboard/telemetry-window";
import { todayInTashkent } from "@/lib/telemetry/aggregate";

// In the (overview) route group so the overview has its own loading.tsx: the
// CMS pages keep the generic skeleton of ../loading.tsx. Still /admin.

export async function generateMetadata({ params: { locale } }: { params: { locale: string } }): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: "pages.admin.overview" });
  return { title: t("title") };
}

/** How many overview rows the "most used materials" card shows. */
const TOP_CONTENT_PREVIEW = 5;

/**
 * "Bosh panel" — the admin panel's landing page (S03 monitoring IA). The gate
 * runs here as on every monitoring page, then every read starts at once (one
 * Promise.all, one server round trip): the 0021 people overview for the range
 * and the one before (the StatCards' deltas and the team table), the top
 * materials, the CMS counts, and what the attention list and the gaps number
 * are built from — telemetry totals, zero-result searches, "not helpful" marks
 * and Copilot's unanswered requests for both windows, content health and the
 * gate's unread notices. Each is its own widget: a failure costs that widget,
 * never the page (CLAUDE.md §15).
 */
export default async function AdminOverviewPage({
  params: { locale },
  searchParams,
}: {
  params: { locale: string };
  searchParams: Record<string, string | string[] | undefined>;
}) {
  unstable_setRequestLocale(locale);
  await requireAdminPage(locale);

  // No per-person filter here: an ?op= left over from another page is dropped.
  const range: DashboardRange = {
    ...parseDashboardRange(searchParams, { defaultDays: MONITORING_RANGE_DAYS }),
    operatorEmail: null,
  };
  const previousRange = previousEqualRange(range);

  const [
    current,
    previous,
    topContent,
    contentStatus,
    kpiTotals,
    zeroSearches,
    notHelpful,
    notHelpfulBefore,
    copilot,
    copilotBefore,
    health,
    gateBlocked,
  ] = await Promise.all([
    fetchPeopleOverview(range),
    fetchPeopleOverview(previousRange),
    fetchTopContent(range, TOP_CONTENT_PREVIEW),
    fetchContentStatus(),
    fetchKpiTotals(range),
    // The attention list names the most repeated one only.
    fetchZeroResultSearches(range, 1),
    fetchNotHelpful(range),
    fetchNotHelpful(previousRange),
    fetchCopilotStats(range),
    fetchCopilotStats(previousRange),
    fetchContentHealth(),
    fetchUnreadGateBlocked(),
  ]);

  const gaps = gapKpi(
    {
      searches: kpiTotals.ok ? kpiTotals.data.current.zeroResultSearches : null,
      feedback: notHelpful.ok ? sumCounts(notHelpful.data) : null,
      copilot: copilot.ok ? copilot.data.noHits : null,
    },
    {
      searches: kpiTotals.ok ? kpiTotals.data.previous.zeroResultSearches : null,
      feedback: notHelpfulBefore.ok ? sumCounts(notHelpfulBefore.data) : null,
      copilot: copilotBefore.ok ? copilotBefore.data.noHits : null,
    }
  );

  const attentionInput = {
    today: todayInTashkent(),
    people: current.ok ? current.data : null,
    content: health.ok
      ? { draftsTotal: health.data.draftsTotal, staleTotal: health.data.staleTotal, staleDays: STALE_DAYS }
      : null,
    unreadGateBlocked: gateBlocked.ok ? gateBlocked.data : null,
    zeroResultSearches: zeroSearches.ok ? zeroSearches.data : null,
    copilotUnanswered: copilot.ok ? copilot.data.noHits : null,
    notHelpful: notHelpful.ok ? notHelpful.data : null,
    knowledgeSearch: rangeSearchParams(range, MONITORING_RANGE_DAYS).toString(),
  };

  return (
    <AdminOverview
      locale={locale}
      range={range}
      renderedAt={new Date().toISOString()}
      current={current}
      previous={previous}
      gaps={gaps}
      attention={{ items: buildAttentionItems(attentionInput), skipped: attentionSkippedSources(attentionInput) }}
      topContent={topContent}
      contentStatus={contentStatus}
    />
  );
}
