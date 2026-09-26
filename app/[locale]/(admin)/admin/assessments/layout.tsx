import { getTranslations, unstable_setRequestLocale } from "next-intl/server";
import { AssessmentsSubNav } from "@/components/admin/assessments/AssessmentsSubNav";

/** The attestation section (docs/ATTESTATION.md §17): its heading and the
 * sub-nav over results, the item bank and the settings. The admin layout above
 * has already refused anyone but the admin, and every page below does so again
 * itself (requireAdminPage). */
export default async function AssessmentsLayout({
  children,
  params: { locale },
}: {
  children: React.ReactNode;
  params: { locale: string };
}) {
  unstable_setRequestLocale(locale);
  const t = await getTranslations("pages.admin.assessments");

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div>
        <h1 className="text-[24px] font-bold text-primary-dark">{t("title")}</h1>
        <p className="mt-1 text-[13px] text-text-secondary">{t("description")}</p>
      </div>
      <AssessmentsSubNav />
      {children}
    </div>
  );
}
