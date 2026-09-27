import type { Metadata } from "next";
import { getTranslations, unstable_setRequestLocale } from "next-intl/server";
import { requireAdminPage } from "@/lib/auth/server-session";
import { adminAttestationRepo, bankReadiness } from "@/lib/attestation/repository";
import { RUBRICS } from "@/lib/attestation/rubrics";
import { ASSESSMENT_DAYS, type PerDay } from "@/lib/attestation/types";
import { AssessmentSettingsForm } from "@/components/admin/assessments/AssessmentSettingsForm";
import { RubricOverview, type RubricOverviewDay } from "@/components/admin/assessments/RubricOverview";

export async function generateMetadata({ params: { locale } }: { params: { locale: string } }): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: "pages.admin.assessments.settings" });
  return { title: t("metaTitle") };
}

/** Attestation settings (docs/ATTESTATION.md §17): the one config row under
 * the admin's own session, and the Part B rubrics read-only below it. When the
 * row cannot be read the form shows the built-in defaults and cannot save. The
 * item list only feeds the "bank" line under each day, so a failed read of it
 * costs that line alone. */
export default async function AssessmentSettingsPage({ params: { locale } }: { params: { locale: string } }) {
  unstable_setRequestLocale(locale);
  await requireAdminPage(locale);

  const repo = adminAttestationRepo();
  const [loaded, items, t, tAll] = await Promise.all([
    repo.getConfig(),
    // Already logged by the repository (readFailed); the bank lines read 0.
    repo.listItems().catch(() => []),
    getTranslations("pages.admin.assessments.settings"),
    getTranslations(),
  ]);
  const { config, source } = loaded;
  const readiness = bankReadiness(items, config);
  const published: PerDay<number> = {
    1: readiness[1].published,
    2: readiness[2].published,
    3: readiness[3].published,
    4: readiness[4].published,
  };

  const rubricDays: RubricOverviewDay[] = ASSESSMENT_DAYS.map((day) => ({
    day,
    label: t("rubrics.day", { day }),
    criteria: RUBRICS[day].criteria.map((criterion) => ({
      id: criterion.id,
      label: tAll(criterion.labelKey),
      weight: criterion.weight,
    })),
  }));

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-[18px] font-semibold text-primary-dark">{t("title")}</h2>
        <p className="mt-1 text-[13px] text-text-secondary">{t("description")}</p>
        {source === "database" && config.updatedBy && (
          <p className="mt-1 text-[12px] text-text-secondary">{t("updatedBy", { who: config.updatedBy })}</p>
        )}
      </div>

      <AssessmentSettingsForm
        key={config.version}
        readOnly={source !== "database"}
        published={published}
        defaultValues={{
          weights: config.weights,
          thresholds: config.thresholds,
          daySettings: config.daySettings,
          extraFacts: config.extraFacts,
          extraFactsRu: config.extraFactsRu,
          retentionDays: config.retentionDays,
          version: config.version,
        }}
      />

      <RubricOverview
        heading={t("rubrics.heading")}
        hint={t("rubrics.hint")}
        criterionLabel={t("rubrics.criterion")}
        weightLabel={t("rubrics.weight")}
        days={rubricDays}
      />
    </div>
  );
}
