import { getLocale, getTranslations } from "next-intl/server";
import { ChevronDown, SearchX } from "lucide-react";
import { Link } from "@/i18n/routing";
import { EmptyState } from "@/components/EmptyState";
import { DashboardWidgetError } from "@/components/dashboard/DashboardWidgetError";
import { ChartCard } from "@/components/admin/charts/ChartCard";
import { formatDate } from "@/lib/admin/format";
import { GAPS_VISIBLE, mergeKnowledgeGaps, type KnowledgeGap } from "@/lib/admin/knowledge";
import { COPILOT_QUESTION_RETENTION_DAYS, faqPrefillHref, type UnansweredQuestion } from "@/lib/dashboard/copilot";
import type { ZeroResultQueryGroup } from "@/lib/dashboard/quality";
import type { WidgetData } from "@/lib/dashboard/telemetry-window";

export interface KnowledgeGapsCardProps {
  /** Zero-result searches of the range (the person filter applies). */
  searches: WidgetData<ZeroResultQueryGroup[]>;
  /** Copilot's unanswered questions of the range (never per person). */
  copilot: WidgetData<UnansweredQuestion[]>;
  /** A person filter is set — Copilot's half still covers everyone. */
  filtered: boolean;
}

/**
 * "Topilmagan savollar" (/admin/knowledge#gaps): the searches that found
 * nothing and the questions Copilot could not answer, as one list
 * (mergeKnowledgeGaps) — each with where it came from, how often, and one
 * action: the FAQ form pre-filled with the question, where its answer belongs.
 * Only one source failing still shows the other, saying which is missing; both
 * failing is this card's error state. Never who asked (CLAUDE.md §9).
 */
export async function KnowledgeGapsCard({ searches, copilot, filtered }: KnowledgeGapsCardProps) {
  const [t, tEmpty, locale] = await Promise.all([
    getTranslations("pages.admin.knowledge.gaps"),
    getTranslations("emptyState.knowledgeNoGaps"),
    getLocale(),
  ]);
  const num = new Intl.NumberFormat(locale === "ru" ? "ru-RU" : "uz-UZ");

  const failed = !searches.ok ? "search" : !copilot.ok ? "copilot" : null;
  const gaps = mergeKnowledgeGaps(searches.ok ? searches.data : [], copilot.ok ? copilot.data : []);
  const visible = gaps.slice(0, GAPS_VISIBLE);
  const rest = gaps.slice(GAPS_VISIBLE);

  const row = (gap: KnowledgeGap) => (
    <li key={gap.key} className="flex flex-wrap items-start gap-x-3 gap-y-2 py-3 first:pt-0 last:pb-0">
      <div className="min-w-0 flex-1 basis-64">
        <p className="line-clamp-2 break-words text-[13.5px] font-medium text-primary-dark">{gap.text}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-text-secondary">
          {gap.searches > 0 && (
            <span className="rounded-full border border-border bg-surface-alt px-2 py-0.5 text-[11px] font-semibold tabular-nums text-primary-dark">
              {t("sources.search", { count: num.format(gap.searches) })}
            </span>
          )}
          {gap.copilot > 0 && (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-primary">
              {t("sources.copilot", { count: num.format(gap.copilot) })}
            </span>
          )}
          {gap.copilotPeople !== null && <span>{t("people", { count: gap.copilotPeople })}</span>}
          <span>{t("lastSeen", { date: formatDate(gap.lastSeenIso, locale) })}</span>
        </div>
      </div>
      <span className="shrink-0 pt-0.5 text-[13px] font-semibold tabular-nums text-primary-dark">
        {t("times", { count: gap.total })}
      </span>
      <Link
        href={faqPrefillHref(gap.text)}
        // One distinct form URL per row (up to GAPS_VISIBLE on screen): prefetching
        // each would start an editor render per question scrolled past.
        prefetch={false}
        className="shrink-0 rounded-lg border border-border bg-surface px-2.5 py-1 text-[12px] font-medium text-primary-dark transition-colors hover:bg-surface-alt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        {t("createFaq")}
      </Link>
    </li>
  );

  return (
    <ChartCard id="gaps" icon={SearchX} title={t("title")} description={t("description")}>
      {!searches.ok && !copilot.ok ? (
        <DashboardWidgetError />
      ) : (
        <div className="space-y-3">
          {failed && (
            <p
              role="status"
              className="rounded-xl border border-status-warning/40 bg-status-warning/10 px-3 py-2 text-[12.5px] text-primary-dark"
            >
              {t(`partial.${failed}`)}
            </p>
          )}
          {filtered && copilot.ok && <p className="text-[12.5px] text-text-secondary">{t("filteredNote")}</p>}

          {gaps.length === 0 ? (
            failed ? null : (
              <EmptyState variant="compact" stateKey="knowledgeNoGaps" title={tEmpty("title")} reason={tEmpty("reason")} />
            )
          ) : (
            <>
              <ul className="divide-y divide-border">{visible.map(row)}</ul>
              {rest.length > 0 && (
                <details className="group border-t border-border pt-2">
                  <summary className="flex w-fit cursor-pointer list-none items-center gap-1 rounded-lg px-1 py-1 text-[12.5px] font-medium text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary [&::-webkit-details-marker]:hidden">
                    <ChevronDown
                      size={14}
                      aria-hidden="true"
                      className="transition-transform group-open:rotate-180 motion-reduce:transition-none"
                    />
                    {t("showAll", { count: gaps.length })}
                  </summary>
                  <ul className="mt-2 divide-y divide-border">{rest.map(row)}</ul>
                </details>
              )}
            </>
          )}

          {copilot.ok && (
            <p className="text-[12px] text-text-secondary">
              {t("retention", { days: COPILOT_QUESTION_RETENTION_DAYS })}
            </p>
          )}
        </div>
      )}
    </ChartCard>
  );
}
