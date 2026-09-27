import type { Metadata } from "next";
import { getTranslations, unstable_setRequestLocale } from "next-intl/server";
import { Plus } from "lucide-react";
import { Link } from "@/i18n/routing";
import { requireAdminPage } from "@/lib/auth/server-session";
import { adminAttestationRepo, bankReadiness } from "@/lib/attestation/repository";
import { itemEditorPath, parseItemBankState, toItemBankRow } from "@/lib/attestation/item-bank";
import { NEW_ITEM_ID } from "@/lib/attestation/schemas";
import { ASSESSMENT_DAYS } from "@/lib/attestation/types";
import { AssessmentItemsBank } from "@/components/admin/assessments/AssessmentItemsBank";
import { BankReadiness, type BankReadinessDay } from "@/components/admin/assessments/BankReadiness";

export async function generateMetadata({ params: { locale } }: { params: { locale: string } }): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: "pages.admin.assessments.items" });
  return { title: t("metaTitle") };
}

/** Savollar banki (docs/ATTESTATION.md §10, §17): the readiness of each day's
 * bank, then every item with its publish readiness. One read of the items and
 * one of the settings, both the admin's own session; the list goes to the
 * client without answer keys or explanations (toItemBankRow). */
export default async function AssessmentItemsPage({
  params: { locale },
  searchParams,
}: {
  params: { locale: string };
  searchParams: Record<string, string | string[] | undefined>;
}) {
  unstable_setRequestLocale(locale);
  await requireAdminPage(locale);

  const repo = adminAttestationRepo();
  const [items, loaded, t] = await Promise.all([
    repo.listItems(),
    repo.getConfig(),
    getTranslations("pages.admin.assessments.items"),
  ]);

  const readiness = bankReadiness(items, loaded.config);
  const days: BankReadinessDay[] = ASSESSMENT_DAYS.map((day) => {
    const { published, needed } = readiness[day];
    return {
      day,
      label: t("readiness.day", { day }),
      value: t("readiness.value", { published, needed }),
      ready: published >= needed,
      note: published >= needed ? t("readiness.ready") : t("readiness.short", { count: needed - published }),
    };
  });

  return (
    <section className="space-y-4" aria-labelledby="assessment-items-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="assessment-items-title" className="text-[18px] font-semibold text-primary-dark">
            {t("title")}
          </h2>
          <p className="mt-1 text-[13px] text-text-secondary">{t("description")}</p>
        </div>
        <Link
          href={itemEditorPath(NEW_ITEM_ID)}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-[13px] font-medium text-on-accent transition-colors hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-light"
        >
          <Plus size={14} aria-hidden="true" />
          {t("new")}
        </Link>
      </div>

      <BankReadiness days={days} label={t("readinessLabel")} />

      <AssessmentItemsBank rows={items.map(toItemBankRow)} initialState={parseItemBankState(searchParams)} />
    </section>
  );
}
