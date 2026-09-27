import { getLocale, getTranslations } from "next-intl/server";
import { Bot } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { DashboardWidgetError } from "@/components/dashboard/DashboardWidgetError";
import { ChartCard } from "@/components/admin/charts/ChartCard";
import { copilotAnsweredRate, formatLatency, type CopilotStatsSummary } from "@/lib/dashboard/copilot";
import type { WidgetData } from "@/lib/dashboard/telemetry-window";

/** "Copilot" (/admin/knowledge#copilot): four numbers about the range —
 * questions, how many it answered from the knowledge base, how many found
 * nothing, and the median answer time — with the error rate and the slow tail
 * (p95) as one line under them. The copilot log keeps no per-person view, so a
 * person filter does not apply here and the description says so. */
export async function CopilotStatsCard({
  stats,
  filtered,
}: {
  stats: WidgetData<CopilotStatsSummary>;
  filtered: boolean;
}) {
  const [t, tLatency, locale] = await Promise.all([
    getTranslations("pages.admin.knowledge.copilot"),
    getTranslations("dashboard.copilot.latency"),
    getLocale(),
  ]);
  const intl = locale === "ru" ? "ru-RU" : "uz-UZ";
  const num = new Intl.NumberFormat(intl);
  const percentFormat = new Intl.NumberFormat(intl, { style: "percent", maximumFractionDigits: 1 });
  const percent = (rate: number | null): string => (rate === null ? "—" : percentFormat.format(rate));
  const latency = (ms: number | null): string => formatLatency(ms, tLatency);

  const description = filtered ? `${t("description")} ${t("filteredNote")}` : t("description");

  return (
    <ChartCard id="copilot" icon={Bot} title={t("title")} description={description}>
      {!stats.ok ? (
        <DashboardWidgetError />
      ) : stats.data.total === 0 ? (
        <EmptyState variant="compact" stateKey="copilotNoUnanswered" title={t("empty.title")} reason={t("empty.reason")} />
      ) : (
        <div className="space-y-3">
          <dl className="grid grid-cols-2 gap-3">
            {[
              { key: "questions", value: num.format(stats.data.total) },
              { key: "answered", value: percent(copilotAnsweredRate(stats.data)) },
              { key: "noHits", value: percent(stats.data.noHitsRate) },
              { key: "latency", value: latency(stats.data.p50Ms) },
            ].map((stat) => (
              <div key={stat.key} className="min-w-0 rounded-xl border border-border bg-surface-alt px-3 py-2.5">
                <dt className="truncate text-[12px] font-medium text-text-secondary">{t(`stats.${stat.key}`)}</dt>
                <dd className="mt-1 truncate text-[20px] font-bold leading-none tabular-nums text-primary-dark">
                  {stat.value}
                </dd>
              </div>
            ))}
          </dl>
          <p className="text-[12px] text-text-secondary">
            {t("footnote", {
              errors: percent(stats.data.errorRate),
              p95: latency(stats.data.p95Ms),
              limited: num.format(stats.data.rateLimited),
            })}
          </p>
        </div>
      )}
    </ChartCard>
  );
}
