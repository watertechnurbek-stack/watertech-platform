import type { Metadata } from "next";
import { getTranslations, unstable_setRequestLocale } from "next-intl/server";
import { requireAdminPage } from "@/lib/auth/server-session";
import { adminAttestationRepo } from "@/lib/attestation/repository";
import { bandFor, effectiveDayScore } from "@/lib/attestation/scoring";
import { isSubmittedStatus } from "@/lib/attestation/types";
import { formatDateTime, formatScorePercent } from "@/lib/admin/format";
import { personPath } from "@/lib/admin/people";
import { AssessmentsEmpty } from "@/components/admin/assessments/AssessmentsEmpty";
import { AssessmentResultsTable, type AssessmentResultRow } from "@/components/admin/assessments/AssessmentResultsTable";

export async function generateMetadata({ params: { locale } }: { params: { locale: string } }): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: "pages.admin.assessments.results" });
  return { title: t("metaTitle") };
}

/** Natijalar (docs/ATTESTATION.md §17). While nobody has submitted, the empty
 * state points at the item bank — nothing can be taken before the bank is
 * ready. Once someone has, a plain list of the submitted attempts with the
 * effective day score and its band; S07 turns this page into the results
 * matrix. Both reads are the admin's own session (RLS: admin only). */
export default async function AssessmentResultsPage({ params: { locale } }: { params: { locale: string } }) {
  unstable_setRequestLocale(locale);
  await requireAdminPage(locale);

  const repo = adminAttestationRepo();
  const [attempts, loaded, t] = await Promise.all([
    repo.listAttemptSummaries(),
    repo.getConfig(),
    getTranslations("pages.admin.assessments"),
  ]);

  const submitted = attempts.filter((attempt) => isSubmittedStatus(attempt.status));
  const inProgress = attempts.filter((attempt) => attempt.status === "in_progress").length;
  const thresholds = loaded.config.thresholds;

  const rows: AssessmentResultRow[] = submitted.map((attempt) => {
    const score = effectiveDayScore(attempt);
    const band = score === null ? null : bandFor(score, thresholds);
    return {
      id: attempt.id,
      email: attempt.email,
      personHref: personPath(attempt.email),
      dayLabel: t("results.dayLabel", { day: attempt.day }),
      attemptLabel: t("results.attemptLabel", { number: attempt.attemptNo }),
      statusLabel: isSubmittedStatus(attempt.status) ? t(`results.status.${attempt.status}`) : "",
      submittedLabel: attempt.submittedAt ? formatDateTime(attempt.submittedAt, locale) : "",
      score:
        score === null || band === null
          ? null
          : {
              percent: formatScorePercent(score, locale),
              band,
              bandLabel: t(`bands.${band}`),
              overridden: attempt.overrideScore !== null,
            },
      needsReview: attempt.needsReview,
    };
  });

  return (
    <section className="space-y-4" aria-labelledby="assessment-results-title">
      <div>
        <h2 id="assessment-results-title" className="text-[18px] font-semibold text-primary-dark">
          {t("results.title")}
        </h2>
        <p className="mt-1 text-[13px] text-text-secondary">{t("results.description")}</p>
      </div>

      {inProgress > 0 && <p className="text-[13px] text-text-secondary">{t("results.inProgress", { count: inProgress })}</p>}

      {rows.length === 0 ? (
        <AssessmentsEmpty
          title={t("results.empty.title")}
          reason={t("results.empty.reason")}
          action={{ label: t("results.empty.cta"), href: "/admin/assessments/items" }}
        />
      ) : (
        <AssessmentResultsTable
          rows={rows}
          labels={{
            table: t("results.tableLabel"),
            person: t("results.columns.person"),
            day: t("results.columns.day"),
            attempt: t("results.columns.attempt"),
            status: t("results.columns.status"),
            submitted: t("results.columns.submitted"),
            score: t("results.columns.score"),
            review: t("results.columns.review"),
            overridden: t("results.overridden"),
            needsReview: t("results.needsReview"),
            noScore: t("results.noScore"),
          }}
        />
      )}
    </section>
  );
}
