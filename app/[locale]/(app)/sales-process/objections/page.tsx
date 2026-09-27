import { unstable_setRequestLocale, getTranslations } from "next-intl/server";
import { AlertTriangle } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { ObjectionsPlaybook } from "@/components/scripts/ObjectionsPlaybook";
import { getObjections, getScripts } from "@/lib/content/loader";
import { buildObjectionEntries } from "@/lib/content/objection-view";
import type { Locale } from "@/i18n/routing";

export default async function ObjectionsPage({ params: { locale } }: { params: { locale: Locale } }) {
  unstable_setRequestLocale(locale);
  const [tNav, tPage] = await Promise.all([
    getTranslations("nav"),
    getTranslations("pages.salesProcess.objections"),
  ]);

  const [objections, scripts] = await Promise.all([getObjections(locale), getScripts(locale)]);
  const entries = buildObjectionEntries(objections, scripts);

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-6 py-8">
      <PageHeader
        path="/sales-process/objections"
        title={tNav("salesProcess.objections.title")}
        description={tPage("description")}
      />

      <div className="flex items-start gap-3 rounded-2xl border border-status-warning/40 bg-status-warning/10 p-4">
        <AlertTriangle size={18} className="mt-0.5 shrink-0 text-status-warning" />
        <p className="text-[13.5px] text-primary-dark">
          {tPage.rich("important", { strong: (chunks) => <strong>{chunks}</strong> })}
        </p>
      </div>

      <ObjectionsPlaybook entries={entries} />
    </div>
  );
}
