"use client";

import { useEffect, useId, useMemo, useRef, useState, useTransition } from "react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/routing";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { useActionError } from "@/hooks/useActionError";
import { useOnline } from "@/hooks/useOnline";
import { useToast } from "@/hooks/useToast";
import { useUnsavedChangesGuard } from "@/hooks/useUnsavedChangesGuard";
import { adminErrorMap, validationText } from "@/lib/admin/validation";
import { saveAssessmentItem } from "@/lib/admin/actions/assessments";
import {
  ITEM_LIMITS,
  itemFormToPublishInput,
  itemPublishChecks,
  itemWriteSchema,
  type ItemWrite,
} from "@/lib/attestation/schemas";
import {
  ASSESSMENT_DAYS,
  ITEM_DIFFICULTIES,
  ITEM_KINDS,
  ITEM_STATUSES,
  ITEM_TOPIC_SUGGESTIONS,
  isAssessmentDay,
} from "@/lib/attestation/types";
import { ItemPublishChecklist } from "./ItemPublishChecklist";

// The item editor at /admin/assessments/items/[id] (docs/ATTESTATION.md §10,
// §17). Built from the CMS primitives — react-hook-form + zodResolver on the
// schema the Server Action re-parses, SubmitButton, ConfirmDialog, the
// unsaved-changes guard — but not on EntityForm: an item has a list of options
// with correct flags, two languages side by side and a live publish checklist.
// The id is fixed once created; the version the page loaded rides along for
// the optimistic-concurrency check.

const OPTION_IDS = ["a", "b", "c", "d", "e", "f"] as const;

const FIELD_CLASS =
  "w-full rounded-lg border border-border bg-surface-alt px-3 py-2 text-[13px] text-primary-dark placeholder:text-text-secondary focus:outline-none focus:ring-2 focus:ring-primary-light";

/** The first option id not in use — ids stay put when an option is removed,
 * so the answer key never silently points at another option. */
function nextOptionId(used: readonly string[]): string | null {
  return OPTION_IDS.find((id) => !used.includes(id)) ?? null;
}

interface AssessmentItemEditorProps {
  isNew: boolean;
  defaultValues: ItemWrite;
}

export function AssessmentItemEditor({ isNew, defaultValues }: AssessmentItemEditorProps) {
  const t = useTranslations("pages.admin.assessments.editor");
  const tItems = useTranslations("pages.admin.assessments.items");
  const tValidation = useTranslations("admin.validation");
  const tToast = useTranslations("toast");
  const tConfirm = useTranslations("admin.confirm");
  const router = useRouter();
  const online = useOnline();
  const { toast } = useToast();
  const describeError = useActionError();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // A second submit before React re-renders the button disabled.
  const inFlightRef = useRef(false);
  const idBase = useId();
  const fieldId = (name: string): string => `${idBase}-${name}`;

  const {
    control,
    register,
    handleSubmit,
    setValue,
    getValues,
    formState: { errors, isDirty },
  } = useForm<ItemWrite>({
    resolver: zodResolver(itemWriteSchema, { errorMap: adminErrorMap }),
    defaultValues,
  });
  const { fields, append, remove } = useFieldArray({ control, name: "options" });

  const watched = useWatch({ control });
  const kind = watched.kind ?? defaultValues.kind;
  const day = isAssessmentDay(watched.day) ? watched.day : defaultValues.day;
  const options = useMemo(() => watched.options ?? [], [watched.options]);

  const checks = useMemo(
    () =>
      itemPublishChecks(
        itemFormToPublishInput({
          kind,
          prompt: watched.prompt ?? "",
          promptRu: watched.promptRu ?? "",
          explanation: watched.explanation ?? "",
          explanationRu: watched.explanationRu ?? "",
          options: options.map((option) => ({
            id: option?.id ?? "",
            text: option?.text ?? "",
            textRu: option?.textRu ?? "",
            correct: option?.correct ?? false,
          })),
        })
      ),
    [kind, watched.prompt, watched.promptRu, watched.explanation, watched.explanationRu, options]
  );

  // A single-choice item keeps one correct option: switching a multi-choice
  // item to single keeps the first of its correct options. Only a switch the
  // admin makes — a stored draft opens as it was saved.
  const loadedKind = useRef(kind);
  useEffect(() => {
    if (kind === loadedKind.current) return;
    loadedKind.current = kind;
    if (kind !== "single") return;
    const current = getValues("options");
    const firstCorrect = current.findIndex((option) => option.correct);
    current.forEach((option, index) => {
      if (option.correct && index !== firstCorrect) {
        setValue(`options.${index}.correct`, false, { shouldDirty: true });
      }
    });
  }, [kind, getValues, setValue]);

  function markCorrect(index: number, checked: boolean) {
    if (kind === "single") {
      getValues("options").forEach((_option, other) => {
        setValue(`options.${other}.correct`, other === index, { shouldDirty: true });
      });
      return;
    }
    setValue(`options.${index}.correct`, checked, { shouldDirty: true });
  }

  function addOption() {
    const id = nextOptionId(getValues("options").map((option) => option.id));
    if (id) append({ id, text: "", textRu: "", correct: false });
  }

  const { blocked, confirmLeave, cancelLeave } = useUnsavedChangesGuard({
    isDirty,
    onSave: () => void handleSubmit(submit)(),
  });

  function submit(values: ItemWrite) {
    if (inFlightRef.current) return;
    if (!online) {
      toast({ kind: "error", title: tToast("offline") });
      return;
    }
    inFlightRef.current = true;
    setError(null);
    startTransition(async () => {
      try {
        const result = await saveAssessmentItem(values);
        if (!result.ok) {
          const { title, details, isConflict } = describeError(result);
          setError(details.length > 0 ? `${title}: ${details.join(", ")}` : title);
          toast({
            kind: "error",
            title: isConflict ? tToast("conflict") : title,
            action: isConflict ? { label: tToast("refresh"), onClick: () => router.refresh() } : undefined,
          });
          return;
        }
        toast({ kind: "success", title: t("saved") });
        router.push("/admin/assessments/items");
        router.refresh();
      } finally {
        inFlightRef.current = false;
      }
    });
  }

  const message = (raw: string | undefined): string | undefined =>
    raw === undefined ? undefined : validationText(tValidation, raw);

  const promptLength = (watched.prompt ?? "").trim().length;
  // An option is labelled by its own id (A–F), which stays put when another
  // option is removed — the answer key and past attempts refer to it.
  const letter = (index: number): string => (options[index]?.id ?? "").toUpperCase();
  const optionsError = message(errors.options?.message ?? errors.options?.root?.message);

  return (
    <form onSubmit={handleSubmit(submit)} className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_16rem]" noValidate>
      <div className="min-w-0 space-y-5">
        {error && (
          <div
            role="alert"
            className="rounded-xl border border-status-outdated/40 bg-status-outdated/10 px-4 py-2.5 text-[13px] text-primary-dark"
          >
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 rounded-2xl border border-border bg-surface p-4 shadow-soft sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <label className="block text-[13px] font-medium text-primary-dark" htmlFor={fieldId("id")}>
              {t("fields.id")}
            </label>
            <input
              id={fieldId("id")}
              type="text"
              readOnly={!isNew}
              autoComplete="off"
              spellCheck={false}
              {...register("id")}
              className={`${FIELD_CLASS} ${isNew ? "" : "bg-border/30 text-text-secondary"}`}
            />
            {message(errors.id?.message) ? (
              <p className="text-[11px] text-status-outdated">{message(errors.id?.message)}</p>
            ) : (
              <p className="text-[11px] text-text-secondary">{t("fields.idHint")}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="block text-[13px] font-medium text-primary-dark" htmlFor={fieldId("day")}>
              {t("fields.day")}
            </label>
            <select id={fieldId("day")} {...register("day", { valueAsNumber: true })} className={FIELD_CLASS}>
              {ASSESSMENT_DAYS.map((value) => (
                <option key={value} value={value}>
                  {tItems("readiness.day", { day: value })}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="block text-[13px] font-medium text-primary-dark" htmlFor={fieldId("topic")}>
              {t("fields.topic")}
            </label>
            <input
              id={fieldId("topic")}
              type="text"
              list={fieldId("topics")}
              autoComplete="off"
              spellCheck={false}
              {...register("topic")}
              className={FIELD_CLASS}
            />
            <datalist id={fieldId("topics")}>
              {ITEM_TOPIC_SUGGESTIONS[day].map((topic) => (
                <option key={topic} value={topic} />
              ))}
            </datalist>
            {message(errors.topic?.message) ? (
              <p className="text-[11px] text-status-outdated">{message(errors.topic?.message)}</p>
            ) : (
              <p className="text-[11px] text-text-secondary">{t("fields.topicHint")}</p>
            )}
          </div>

          <fieldset className="space-y-1.5">
            <legend className="text-[13px] font-medium text-primary-dark">{t("fields.kind")}</legend>
            <div className="flex flex-wrap gap-3 pt-1">
              {ITEM_KINDS.map((value) => (
                <label key={value} className="flex items-center gap-2 text-[13px] text-primary-dark">
                  <input
                    type="radio"
                    value={value}
                    {...register("kind")}
                    className="h-4 w-4 border-border text-accent focus:outline-none focus:ring-2 focus:ring-primary-light"
                  />
                  {tItems(`kind.${value}`)}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="space-y-1.5">
            <label className="block text-[13px] font-medium text-primary-dark" htmlFor={fieldId("difficulty")}>
              {t("fields.difficulty")}
            </label>
            <select id={fieldId("difficulty")} {...register("difficulty", { valueAsNumber: true })} className={FIELD_CLASS}>
              {ITEM_DIFFICULTIES.map((value) => (
                <option key={value} value={value}>
                  {tItems(`difficulty.${value}`)} ({value})
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <label className="block text-[13px] font-medium text-primary-dark" htmlFor={fieldId("status")}>
              {t("fields.status")}
            </label>
            <select id={fieldId("status")} {...register("status")} className={FIELD_CLASS}>
              {ITEM_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {tItems(`status.${value}`)}
                </option>
              ))}
            </select>
            {message(errors.status?.message) && (
              <p className="text-[11px] text-status-outdated">{message(errors.status?.message)}</p>
            )}
          </div>
        </div>

        <div className="space-y-4 rounded-2xl border border-border bg-surface p-4 shadow-soft">
          <div className="space-y-1.5">
            <label className="block text-[13px] font-medium text-primary-dark" htmlFor={fieldId("prompt")}>
              {t("fields.prompt")}
            </label>
            <textarea id={fieldId("prompt")} rows={3} {...register("prompt")} className={FIELD_CLASS} />
            <div className="flex items-center justify-between gap-2 text-[11px]">
              <span className="text-status-outdated">{message(errors.prompt?.message)}</span>
              <span className={`tabular-nums ${promptLength > ITEM_LIMITS.promptPublish ? "text-status-outdated" : "text-text-secondary"}`}>
                {promptLength} / {ITEM_LIMITS.promptPublish}
              </span>
            </div>
          </div>

          <fieldset className="space-y-2.5">
            <legend className="text-[13px] font-medium text-primary-dark">{t("options.heading")}</legend>
            <p className="text-[11px] text-text-secondary">{t("options.hint")}</p>
            {optionsError && <p className="text-[11px] text-status-outdated">{optionsError}</p>}
            <ul className="space-y-2">
              {fields.map((field, index) => {
                const optionLetter = letter(index);
                const textError = message(errors.options?.[index]?.text?.message);
                return (
                  <li key={field.id} className="flex items-start gap-2.5">
                    <label className="mt-2 flex shrink-0 items-center gap-1.5 text-[13px] font-semibold text-primary-dark">
                      <input
                        type={kind === "single" ? "radio" : "checkbox"}
                        name={kind === "single" ? fieldId("correct") : undefined}
                        checked={options[index]?.correct ?? false}
                        onChange={(event) => markCorrect(index, event.target.checked)}
                        aria-label={t("options.correct", { letter: optionLetter })}
                        className="h-4 w-4 border-border text-accent focus:outline-none focus:ring-2 focus:ring-primary-light"
                      />
                      <span aria-hidden="true">{optionLetter}</span>
                    </label>
                    <div className="min-w-0 flex-1 space-y-1">
                      <input
                        type="text"
                        aria-label={t("options.text", { letter: optionLetter })}
                        {...register(`options.${index}.text`)}
                        className={FIELD_CLASS}
                      />
                      {textError && <p className="text-[11px] text-status-outdated">{textError}</p>}
                    </div>
                    <button
                      type="button"
                      onClick={() => remove(index)}
                      disabled={fields.length <= ITEM_LIMITS.minOptions}
                      aria-label={t("options.remove", { letter: optionLetter })}
                      className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border text-text-secondary transition-colors hover:bg-status-outdated/10 hover:text-status-outdated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-30"
                    >
                      <Trash2 size={13} aria-hidden="true" />
                    </button>
                  </li>
                );
              })}
            </ul>
            <button
              type="button"
              onClick={addOption}
              disabled={fields.length >= ITEM_LIMITS.maxOptions}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-[12.5px] font-medium text-primary-dark transition-colors hover:bg-surface-alt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-40"
            >
              <Plus size={13} aria-hidden="true" />
              {t("options.add")}
            </button>
          </fieldset>

          <div className="space-y-1.5">
            <label className="block text-[13px] font-medium text-primary-dark" htmlFor={fieldId("explanation")}>
              {t("fields.explanation")}
            </label>
            <textarea id={fieldId("explanation")} rows={2} {...register("explanation")} className={FIELD_CLASS} />
            {message(errors.explanation?.message) && (
              <p className="text-[11px] text-status-outdated">{message(errors.explanation?.message)}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="block text-[13px] font-medium text-primary-dark" htmlFor={fieldId("sourceRef")}>
              {t("fields.sourceRef")}
            </label>
            <input
              id={fieldId("sourceRef")}
              type="text"
              autoComplete="off"
              spellCheck={false}
              {...register("sourceRef")}
              className={FIELD_CLASS}
            />
            {message(errors.sourceRef?.message) ? (
              <p className="text-[11px] text-status-outdated">{message(errors.sourceRef?.message)}</p>
            ) : (
              <p className="text-[11px] text-text-secondary">{t("fields.sourceRefHint")}</p>
            )}
          </div>
        </div>

        <section className="space-y-4 rounded-2xl border border-border bg-surface-alt/60 p-4" aria-labelledby={fieldId("ru")}>
          <div>
            <h3 id={fieldId("ru")} className="text-[13.5px] font-semibold text-primary-dark">
              {t("ruSection")}
            </h3>
            <p className="mt-0.5 text-[11px] text-text-secondary">{t("ruHint")}</p>
          </div>
          <div className="space-y-1.5">
            <label className="block text-[13px] font-medium text-primary-dark" htmlFor={fieldId("promptRu")}>
              {t("fields.prompt")}
            </label>
            <textarea id={fieldId("promptRu")} rows={3} lang="ru" {...register("promptRu")} className={FIELD_CLASS} />
            {message(errors.promptRu?.message) && (
              <p className="text-[11px] text-status-outdated">{message(errors.promptRu?.message)}</p>
            )}
          </div>
          <ul className="space-y-2">
            {fields.map((field, index) => (
              <li key={field.id} className="flex items-center gap-2.5">
                <span className="w-5 shrink-0 text-center text-[13px] font-semibold text-primary-dark" aria-hidden="true">
                  {letter(index)}
                </span>
                <input
                  type="text"
                  lang="ru"
                  aria-label={t("options.textRu", { letter: letter(index) })}
                  {...register(`options.${index}.textRu`)}
                  className={FIELD_CLASS}
                />
              </li>
            ))}
          </ul>
          <div className="space-y-1.5">
            <label className="block text-[13px] font-medium text-primary-dark" htmlFor={fieldId("explanationRu")}>
              {t("fields.explanation")}
            </label>
            <textarea id={fieldId("explanationRu")} rows={2} lang="ru" {...register("explanationRu")} className={FIELD_CLASS} />
          </div>
        </section>

        <div className="flex flex-wrap items-center gap-2">
          <SubmitButton pending={pending} offlineBlocked={!online} pendingLabel={t("saving")}>
            <CheckCircle2 size={14} aria-hidden="true" />
            {t("save")}
          </SubmitButton>
          <Link
            href="/admin/assessments/items"
            className="rounded-lg border border-border px-4 py-2 text-[13px] font-medium text-primary-dark transition-colors hover:bg-surface-alt"
          >
            {t("cancel")}
          </Link>
        </div>
      </div>

      <aside className="min-w-0">
        <ItemPublishChecklist checks={checks} />
      </aside>

      <ConfirmDialog
        open={blocked}
        title={tConfirm("leaveUnsavedTitle")}
        description={tConfirm("leaveUnsavedDescription")}
        confirmLabel={tConfirm("leaveAnyway")}
        tone="primary"
        onConfirm={confirmLeave}
        onCancel={cancelLeave}
      />
    </form>
  );
}
