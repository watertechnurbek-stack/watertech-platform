"use client";

import { useId, useRef, useState, useTransition } from "react";
import { useForm, useWatch, type FieldError } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/routing";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { useActionError } from "@/hooks/useActionError";
import { useOnline } from "@/hooks/useOnline";
import { useToast } from "@/hooks/useToast";
import { useUnsavedChangesGuard } from "@/hooks/useUnsavedChangesGuard";
import { adminErrorMap, validationText } from "@/lib/admin/validation";
import { saveAssessmentConfig } from "@/lib/admin/actions/assessments";
import {
  DAY_SETTING_RANGES,
  EXTRA_FACTS_MAX_CHARS,
  RETENTION_DAYS_RANGE,
  assessmentConfigWriteSchema,
  type AssessmentConfigWrite,
} from "@/lib/attestation/schemas";
import { ASSESSMENT_DAYS, type DaySettings, type PerDay } from "@/lib/attestation/types";
import { ScoreBandBadge } from "./ScoreBandBadge";

// The attestation settings at /admin/assessments/settings (docs/ATTESTATION.md
// §17): Part A / Part B weights per day and the band thresholds (§4), each
// day's limits (§3), the factory facts the AI customer and the evaluator read
// (§9), and how long attempts are kept (§11). One row, one version: the save is guarded on the
// version the page loaded, so a second admin tab's save is a conflict, never
// a silent overwrite. The page remounts the form (key = version) after a save.

const FIELD_CLASS =
  "w-full rounded-lg border border-border bg-surface-alt px-3 py-2 text-[13px] text-primary-dark placeholder:text-text-secondary focus:outline-none focus:ring-2 focus:ring-primary-light";
const NUMBER_CLASS = `${FIELD_CLASS} tabular-nums`;
const CARD_CLASS = "space-y-3 rounded-2xl border border-border bg-surface p-4 shadow-soft";

const DAY_SETTING_FIELDS = ["itemCount", "itemSeconds", "minTurns", "maxTurns", "partBMinutes"] as const satisfies readonly (keyof DaySettings)[];

export interface AssessmentSettingsFormProps {
  defaultValues: AssessmentConfigWrite;
  /** The stored row could not be read: the form shows the built-in defaults
   * and cannot save (the page says why). */
  readOnly: boolean;
  /** Published items per day, for the "bank" line under each day. */
  published: PerDay<number>;
}

export function AssessmentSettingsForm({ defaultValues, readOnly, published }: AssessmentSettingsFormProps) {
  const t = useTranslations("pages.admin.assessments.settings");
  const tBands = useTranslations("pages.admin.assessments.bands");
  const tValidation = useTranslations("admin.validation");
  const tToast = useTranslations("toast");
  const tConfirm = useTranslations("admin.confirm");
  const router = useRouter();
  const online = useOnline();
  const { toast } = useToast();
  const describeError = useActionError();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const inFlightRef = useRef(false);
  const idBase = useId();
  const fieldId = (name: string): string => `${idBase}-${name}`;

  const {
    control,
    register,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm<AssessmentConfigWrite>({
    resolver: zodResolver(assessmentConfigWriteSchema, { errorMap: adminErrorMap }),
    defaultValues,
  });
  const watched = useWatch({ control });

  const { blocked, confirmLeave, cancelLeave } = useUnsavedChangesGuard({
    isDirty,
    onSave: readOnly ? undefined : () => void handleSubmit(submit)(),
  });

  function submit(values: AssessmentConfigWrite) {
    if (readOnly || inFlightRef.current) return;
    if (!online) {
      toast({ kind: "error", title: tToast("offline") });
      return;
    }
    inFlightRef.current = true;
    setError(null);
    startTransition(async () => {
      try {
        const result = await saveAssessmentConfig(values);
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
        router.refresh();
      } finally {
        inFlightRef.current = false;
      }
    });
  }

  const message = (fieldError: FieldError | undefined): string | undefined =>
    typeof fieldError?.message === "string" ? validationText(tValidation, fieldError.message) : undefined;

  const green = watched.thresholds?.green;
  const yellow = watched.thresholds?.yellow;
  const factsLength = (watched.extraFacts ?? "").length;
  const factsRuLength = (watched.extraFactsRu ?? "").length;

  return (
    <form onSubmit={handleSubmit(submit)} className="space-y-5" noValidate>
      {readOnly && (
        <div
          role="status"
          className="flex items-start gap-2 rounded-xl border border-status-warning/40 bg-status-warning/10 px-4 py-2.5 text-[13px] text-primary-dark"
        >
          <AlertTriangle size={15} className="mt-0.5 shrink-0 text-status-warning" aria-hidden="true" />
          {t("defaultsNotice")}
        </div>
      )}
      {error && (
        <div
          role="alert"
          className="rounded-xl border border-status-outdated/40 bg-status-outdated/10 px-4 py-2.5 text-[13px] text-primary-dark"
        >
          {error}
        </div>
      )}

      <fieldset disabled={readOnly} className="space-y-5">
        <section className={CARD_CLASS} aria-labelledby={fieldId("weights")}>
          <div>
            <h3 id={fieldId("weights")} className="text-[15px] font-semibold text-primary-dark">
              {t("weights.heading")}
            </h3>
            <p className="mt-0.5 text-[12px] text-text-secondary">{t("weights.hint")}</p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {ASSESSMENT_DAYS.map((day) => {
              const sumError = message(errors.weights?.[day]?.partB) ?? message(errors.weights?.[day]?.partA);
              return (
                <fieldset key={day} className="space-y-2 rounded-xl border border-border bg-surface-alt/60 p-3">
                  <legend className="px-1 text-[13px] font-semibold text-primary-dark">{t("weights.day", { day })}</legend>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="block text-[12px] text-text-secondary" htmlFor={fieldId(`weights-${day}-a`)}>
                        {t("weights.partA")}
                      </label>
                      <input
                        id={fieldId(`weights-${day}-a`)}
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={100}
                        step={1}
                        {...register(`weights.${day}.partA`, { valueAsNumber: true })}
                        className={NUMBER_CLASS}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="block text-[12px] text-text-secondary" htmlFor={fieldId(`weights-${day}-b`)}>
                        {t("weights.partB")}
                      </label>
                      <input
                        id={fieldId(`weights-${day}-b`)}
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={100}
                        step={1}
                        {...register(`weights.${day}.partB`, { valueAsNumber: true })}
                        className={NUMBER_CLASS}
                      />
                    </div>
                  </div>
                  {sumError && <p className="text-[11px] text-status-outdated">{sumError}</p>}
                </fieldset>
              );
            })}
          </div>
        </section>

        <section className={CARD_CLASS} aria-labelledby={fieldId("thresholds")}>
          <div>
            <h3 id={fieldId("thresholds")} className="text-[15px] font-semibold text-primary-dark">
              {t("thresholds.heading")}
            </h3>
            <p className="mt-0.5 text-[12px] text-text-secondary">{t("thresholds.hint")}</p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="block text-[13px] font-medium text-primary-dark" htmlFor={fieldId("green")}>
                {t("thresholds.green")}
              </label>
              <input
                id={fieldId("green")}
                type="number"
                inputMode="numeric"
                min={2}
                max={100}
                step={1}
                {...register("thresholds.green", { valueAsNumber: true })}
                className={NUMBER_CLASS}
              />
              {message(errors.thresholds?.green) && (
                <p className="text-[11px] text-status-outdated">{message(errors.thresholds?.green)}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <label className="block text-[13px] font-medium text-primary-dark" htmlFor={fieldId("yellow")}>
                {t("thresholds.yellow")}
              </label>
              <input
                id={fieldId("yellow")}
                type="number"
                inputMode="numeric"
                min={1}
                max={99}
                step={1}
                {...register("thresholds.yellow", { valueAsNumber: true })}
                className={NUMBER_CLASS}
              />
              {message(errors.thresholds?.yellow) && (
                <p className="text-[11px] text-status-outdated">{message(errors.thresholds?.yellow)}</p>
              )}
            </div>
          </div>
          {typeof green === "number" && typeof yellow === "number" && Number.isFinite(green) && Number.isFinite(yellow) && (
            <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t("thresholds.preview")}>
              <ScoreBandBadge band="green" percent={`≥ ${green}%`} bandLabel={tBands("green")} />
              <ScoreBandBadge band="yellow" percent={`≥ ${yellow}%`} bandLabel={tBands("yellow")} />
              <ScoreBandBadge band="red" percent={`< ${yellow}%`} bandLabel={tBands("red")} />
            </div>
          )}
        </section>

        <section className={CARD_CLASS} aria-labelledby={fieldId("days")}>
          <div>
            <h3 id={fieldId("days")} className="text-[15px] font-semibold text-primary-dark">
              {t("days.heading")}
            </h3>
            <p className="mt-0.5 text-[12px] text-text-secondary">{t("days.hint")}</p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {ASSESSMENT_DAYS.map((day) => {
              const needed = watched.daySettings?.[day]?.itemCount;
              const short = typeof needed === "number" && Number.isFinite(needed) && published[day] < needed;
              return (
                <fieldset key={day} className="space-y-2 rounded-xl border border-border bg-surface-alt/60 p-3">
                  <legend className="px-1 text-[13px] font-semibold text-primary-dark">{t("weights.day", { day })}</legend>
                  <div className="grid grid-cols-2 gap-2">
                    {DAY_SETTING_FIELDS.map((field) => {
                      const id = fieldId(`day-${day}-${field}`);
                      const fieldMessage = message(errors.daySettings?.[day]?.[field]);
                      return (
                        <div key={field} className="space-y-1">
                          <label className="block text-[12px] text-text-secondary" htmlFor={id}>
                            {t(`days.${field}`)}
                          </label>
                          <input
                            id={id}
                            type="number"
                            inputMode="numeric"
                            min={DAY_SETTING_RANGES[field].min}
                            max={DAY_SETTING_RANGES[field].max}
                            step={1}
                            {...register(`daySettings.${day}.${field}`, { valueAsNumber: true })}
                            className={NUMBER_CLASS}
                          />
                          {fieldMessage && <p className="text-[11px] text-status-outdated">{fieldMessage}</p>}
                        </div>
                      );
                    })}
                  </div>
                  <p className={`flex items-center gap-1.5 text-[12px] ${short ? "text-status-warning" : "text-text-secondary"}`}>
                    {short ? (
                      <AlertTriangle size={12} className="shrink-0" aria-hidden="true" />
                    ) : (
                      <CheckCircle2 size={12} className="shrink-0 text-status-ok" aria-hidden="true" />
                    )}
                    <span className="tabular-nums text-primary-dark">
                      {t("days.bank", {
                        published: published[day],
                        needed: typeof needed === "number" && Number.isFinite(needed) ? needed : "—",
                      })}
                    </span>
                  </p>
                </fieldset>
              );
            })}
          </div>
        </section>

        <section className={CARD_CLASS} aria-labelledby={fieldId("facts")}>
          <div>
            <h3 id={fieldId("facts")} className="text-[15px] font-semibold text-primary-dark">
              {t("facts.heading")}
            </h3>
            <p className="mt-0.5 text-[12px] text-text-secondary">{t("facts.hint")}</p>
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {(
              [
                { name: "extraFacts", label: t("facts.uz"), length: factsLength, lang: "uz" },
                { name: "extraFactsRu", label: t("facts.ru"), length: factsRuLength, lang: "ru" },
              ] as const
            ).map((facts) => {
              const id = fieldId(facts.name);
              const over = facts.length > EXTRA_FACTS_MAX_CHARS;
              const fieldMessage = message(errors[facts.name]);
              return (
                <div key={facts.name} className="space-y-1.5">
                  <label className="block text-[13px] font-medium text-primary-dark" htmlFor={id}>
                    {facts.label}
                  </label>
                  <textarea
                    id={id}
                    rows={10}
                    lang={facts.lang}
                    aria-describedby={`${id}-counter`}
                    {...register(facts.name)}
                    className={FIELD_CLASS}
                  />
                  <div className="flex items-center justify-between gap-2 text-[11px]">
                    <span className="text-status-outdated">{fieldMessage}</span>
                    <span
                      id={`${id}-counter`}
                      aria-live="polite"
                      className={`tabular-nums ${over ? "text-status-outdated" : "text-text-secondary"}`}
                    >
                      {t("facts.counter", { count: facts.length, max: EXTRA_FACTS_MAX_CHARS })}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className={CARD_CLASS} aria-labelledby={fieldId("retention")}>
          <h3 id={fieldId("retention")} className="text-[15px] font-semibold text-primary-dark">
            {t("retention.heading")}
          </h3>
          <div className="max-w-xs space-y-1.5">
            <label className="block text-[13px] font-medium text-primary-dark" htmlFor={fieldId("retentionDays")}>
              {t("retention.label")}
            </label>
            <input
              id={fieldId("retentionDays")}
              type="number"
              inputMode="numeric"
              min={RETENTION_DAYS_RANGE.min}
              max={RETENTION_DAYS_RANGE.max}
              step={1}
              {...register("retentionDays", { valueAsNumber: true })}
              className={NUMBER_CLASS}
            />
            {message(errors.retentionDays) ? (
              <p className="text-[11px] text-status-outdated">{message(errors.retentionDays)}</p>
            ) : (
              <p className="text-[11px] text-text-secondary">{t("retention.hint")}</p>
            )}
          </div>
        </section>
      </fieldset>

      <SubmitButton pending={pending} disabled={readOnly} offlineBlocked={!online} pendingLabel={t("saving")}>
        {t("save")}
      </SubmitButton>

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
