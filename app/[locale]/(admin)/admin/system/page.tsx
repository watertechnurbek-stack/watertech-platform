import type { Metadata } from "next";
import { getTranslations, unstable_setRequestLocale } from "next-intl/server";
import { Gauge } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { DashboardWidgetError } from "@/components/dashboard/DashboardWidgetError";
import { RangePicker } from "@/components/dashboard/RangePicker";
import { ChartCard } from "@/components/admin/charts/ChartCard";
import { requireAdminPage } from "@/lib/auth/server-session";
import { MONITORING_RANGE_DAYS, parseDashboardRange, type DashboardRange } from "@/lib/dashboard/range";
import { fetchWebVitals } from "@/lib/dashboard/telemetry-window";

export async function generateMetadata({ params: { locale } }: { params: { locale: string } }): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: "pages.admin.system" });
  return { title: t("title") };
}

/** "Texnik holat" (/admin/system, S03): how fast the app is for the people
 * using it — the Web Vitals of the operator and sales-manager sessions over a
 * range, p50 and p75 per metric. An engineering number, so it lives in the
 * System group and not on a monitoring page. One read, one widget. */
export default async function SystemPage({
  params: { locale },
  searchParams,
}: {
  params: { locale: string };
  searchParams: Record<string, string | string[] | undefined>;
}) {
  unstable_setRequestLocale(locale);
  await requireAdminPage(locale);

  // Web Vitals are per app, not per person: an ?op= left over from another page is dropped.
  const range: DashboardRange = {
    ...parseDashboardRange(searchParams, { defaultDays: MONITORING_RANGE_DAYS }),
    operatorEmail: null,
  };
  const [t, tEmpty, vitals] = await Promise.all([
    getTranslations("pages.admin.system"),
    getTranslations("pages.admin.overview.empty.noEvents"),
    fetchWebVitals(range),
  ]);
  const number = new Intl.NumberFormat(locale === "ru" ? "ru-RU" : "uz-UZ", { maximumFractionDigits: 2 });

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="space-y-4">
        <div className="min-w-0">
          <h1 className="text-[24px] font-bold text-primary-dark">{t("title")}</h1>
          <p className="mt-1 text-[13px] text-text-secondary">{t("description")}</p>
        </div>
        <RangePicker range={range} basePath="/admin/system" />
      </div>

      <ChartCard id="web-vitals" icon={Gauge} title={t("webVitals.title")} description={t("webVitals.description")}>
        {!vitals.ok ? (
          <DashboardWidgetError />
        ) : vitals.data.length === 0 ? (
          <EmptyState variant="compact" stateKey="dashboardNoEvents" title={tEmpty("title")} reason={tEmpty("reason")} />
        ) : (
          <div
            role="region"
            aria-label={t("webVitals.title")}
            tabIndex={0}
            className="relative overflow-x-auto rounded-xl border border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <table className="w-full min-w-[24rem] text-left text-[13px]">
              <caption className="sr-only">{t("webVitals.title")}</caption>
              <thead>
                <tr className="border-b border-border bg-surface-alt text-[12px] text-text-secondary">
                  <th scope="col" className="px-3 py-2.5 font-semibold">
                    {t("webVitals.columns.metric")}
                  </th>
                  <th scope="col" className="px-3 py-2.5 text-right font-semibold">
                    {t("webVitals.columns.p50")}
                  </th>
                  <th scope="col" className="px-3 py-2.5 text-right font-semibold">
                    {t("webVitals.columns.p75")}
                  </th>
                  <th scope="col" className="px-3 py-2.5 text-right font-semibold">
                    {t("webVitals.columns.samples")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {vitals.data.map((vital) => (
                  <tr key={vital.name} className="border-b border-border bg-surface last:border-0">
                    <th scope="row" className="px-3 py-2.5 font-semibold text-primary-dark">
                      {vital.name}
                    </th>
                    <td className="px-3 py-2.5 text-right tabular-nums text-primary-dark">{number.format(vital.p50)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-primary-dark">{number.format(vital.p75)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-text-secondary">
                      {number.format(vital.samples)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </ChartCard>
    </div>
  );
}
