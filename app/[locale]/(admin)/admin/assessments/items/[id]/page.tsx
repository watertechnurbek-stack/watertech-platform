import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, unstable_setRequestLocale } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { Link } from "@/i18n/routing";
import { requireAdminPage } from "@/lib/auth/server-session";
import { adminAttestationRepo } from "@/lib/attestation/repository";
import { blankItemFormValues, itemToFormValues, parseItemParam } from "@/lib/attestation/item-bank";
import { NEW_ITEM_ID } from "@/lib/attestation/schemas";
import { AssessmentItemEditor } from "@/components/admin/assessments/AssessmentItemEditor";

interface ItemEditorPageProps {
  params: { locale: string; id: string };
}

export async function generateMetadata({ params: { locale, id } }: ItemEditorPageProps): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: "pages.admin.assessments.editor" });
  return { title: id === NEW_ITEM_ID ? t("newTitle") : t("editTitle") };
}

/** One item of the bank (docs/ATTESTATION.md §10, §17): NEW_ITEM_ID opens an
 * empty draft, anything else must be an item id the admin's own session can
 * read — otherwise a 404. The whole row goes to the editor, answer key and
 * explanation included: this page is the admin's, and the admin layout plus
 * requireAdminPage below keep everyone else out. */
export default async function AssessmentItemEditorPage({ params: { locale, id: rawId } }: ItemEditorPageProps) {
  unstable_setRequestLocale(locale);
  await requireAdminPage(locale);

  const isNew = rawId === NEW_ITEM_ID;
  const id = isNew ? null : parseItemParam(rawId);
  if (!isNew && id === null) notFound();
  const item = id === null ? null : await adminAttestationRepo().getItem(id);
  if (!isNew && item === null) notFound();

  const t = await getTranslations("pages.admin.assessments.editor");

  return (
    <section className="space-y-4" aria-labelledby="assessment-item-editor-title">
      <div className="min-w-0">
        <Link
          href="/admin/assessments/items"
          className="inline-flex items-center gap-1.5 text-[13px] text-accent hover:underline"
        >
          <ArrowLeft size={13} aria-hidden="true" />
          {t("back")}
        </Link>
        <h2 id="assessment-item-editor-title" className="mt-2 text-[18px] font-semibold text-primary-dark">
          {isNew ? t("newTitle") : t("editTitle")}
        </h2>
        {item && <p className="mt-0.5 font-mono text-[12px] text-text-secondary">{item.id}</p>}
      </div>
      <AssessmentItemEditor isNew={isNew} defaultValues={item ? itemToFormValues(item) : blankItemFormValues()} />
    </section>
  );
}
