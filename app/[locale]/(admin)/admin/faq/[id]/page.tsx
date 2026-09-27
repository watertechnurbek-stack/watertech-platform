import type { Metadata } from "next";
import { getTranslations, unstable_setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/routing";
import { notFound } from "next/navigation";
import { History } from "lucide-react";
import { getFaqRow } from "@/lib/admin/queries";
import type { FaqFormInput } from "@/lib/admin/schemas";
import type { AdminTranslate, EntityFieldDef } from "@/components/admin/EntityForm";
import { FaqEditorForm } from "@/components/admin/FaqEditorForm";

export async function generateMetadata({ params: { locale } }: { params: { locale: string } }): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: "pages.admin.faq" });
  return { title: t("editTitle") };
}

function buildFields(isNew: boolean, t: AdminTranslate, tShared: AdminTranslate): EntityFieldDef<FaqFormInput>[] {
  return [
    { kind: "text", name: "id", label: tShared("idLabel"), placeholder: t("fields.idPlaceholder"), readOnly: !isNew },
    { kind: "text", name: "category", label: t("fields.category") },
    { kind: "textarea", name: "question", label: t("fields.question"), rows: 2 },
    { kind: "textarea", name: "answer", label: t("fields.answer"), rows: 6 },
    {
      kind: "select",
      name: "status",
      label: tShared("statusLabel"),
      options: [
        { value: "draft", label: tShared("statusDraft") },
        { value: "published", label: tShared("statusPublished") },
      ],
    },
    { kind: "textarea", name: "questionRu", label: t("fields.question"), rows: 2, group: "ru" },
    { kind: "textarea", name: "answerRu", label: t("fields.answer"), rows: 6, group: "ru" },
    { kind: "hidden", name: "version" },
  ];
}

export default async function AdminFaqEditPage({
  params,
  searchParams,
}: {
  params: { locale: string; id: string };
  searchParams: { question?: string; from?: string };
}) {
  const { locale } = params;
  unstable_setRequestLocale(locale);
  const [t, tShared] = await Promise.all([
    getTranslations("pages.admin.faq"),
    getTranslations("pages.admin.shared"),
  ]);

  const isNew = params.id === "new";
  const row = isNew ? null : await getFaqRow(params.id);
  if (!isNew && !row) notFound();
  // /admin/faq/new?from=<id> — the DataTable duplicate action; prefills from
  // that row's own full data, never the list projection.
  const source = isNew && searchParams.from ? await getFaqRow(searchParams.from) : null;

  const defaultValues: FaqFormInput = row
    ? {
        id: row.id,
        category: row.category,
        question: row.question,
        answer: row.answer,
        status: row.status,
        questionRu: row.question_ru ?? "",
        answerRu: row.answer_ru ?? "",
        version: String(row.version),
      }
    : source
      ? {
          id: `${source.id}-nusxa`,
          category: source.category,
          question: source.question,
          answer: source.answer,
          status: "draft",
          questionRu: source.question_ru ?? "",
          answerRu: source.answer_ru ?? "",
        }
      : {
          id: "",
          category: "",
          // Prefilled from the knowledge page's / attention list's "FAQ yaratish" action
          // (/admin/faq/new?question=…) — a zero-result search query the
          // manager is turning straight into a new FAQ entry.
          question: searchParams.question ?? "",
          answer: "",
          status: "draft",
          questionRu: "",
          answerRu: "",
        };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[24px] font-bold text-primary-dark">{isNew ? t("newTitle") : t("editTitle")}</h1>
        {!isNew && row && (
          <Link
            href={`/admin/versions/content_faqs/${row.id}`}
            className="mt-1 inline-flex items-center gap-1.5 text-[13px] text-accent hover:underline"
          >
            <History size={13} />
            {tShared("versions")}
          </Link>
        )}
      </div>
      <FaqEditorForm defaultValues={defaultValues} fields={buildFields(isNew, t, tShared)} />
    </div>
  );
}
