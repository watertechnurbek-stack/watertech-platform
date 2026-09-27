"use client";

import { memo, useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { AlertTriangle, Languages, ListChecks, Pencil, Search, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/routing";
import { EmptyState } from "@/components/EmptyState";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { RelativeTime } from "@/components/admin/RelativeTime";
import { useActionError } from "@/hooks/useActionError";
import { useOnline } from "@/hooks/useOnline";
import { useToast } from "@/hooks/useToast";
import { deleteAssessmentItem, setAssessmentItemStatus } from "@/lib/admin/actions/assessments";
import {
  EMPTY_ITEM_BANK_STATE,
  ITEM_BANK_QUERY_MAX_LENGTH,
  bankTopics,
  filterItemBank,
  isFiltered,
  itemEditorPath,
  serializeItemBankState,
  type ItemBankRow,
  type ItemBankState,
} from "@/lib/attestation/item-bank";
import {
  ASSESSMENT_DAYS,
  ITEM_DIFFICULTIES,
  ITEM_STATUSES,
  isAssessmentDay,
  isItemDifficulty,
  type ItemStatus,
} from "@/lib/attestation/types";

// The item bank at /admin/assessments/items (docs/ATTESTATION.md §17): every
// item of the four days, filtered and searched on the client over the full
// list, with the state in the URL — read on the server for the first paint,
// written back with history.replaceState (CLAUDE.md §4). Rows carry no answer
// key (lib/attestation/item-bank.ts). Publishing re-checks the stored row on
// the server; a refusal names the failing rules.

/** How long the URL waits after the last change before it is rewritten. */
const URL_WRITE_DELAY_MS = 250;

const CONTROL_CLASS =
  "rounded-lg border border-border bg-surface-alt px-3 py-2 text-[13px] text-primary-dark focus:outline-none focus:ring-2 focus:ring-primary-light";

const ICON_BUTTON_CLASS =
  "flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-surface text-text-secondary transition-colors hover:bg-surface-alt hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50";

function isItemStatus(value: string): value is ItemStatus {
  return (ITEM_STATUSES as readonly string[]).includes(value);
}

interface RowProps {
  row: ItemBankRow;
  busy: boolean;
  disabled: boolean;
  onToggleStatus: (row: ItemBankRow) => void;
  onDelete: (row: ItemBankRow) => void;
}

const ItemRow = memo(function ItemRow({ row, busy, disabled, onToggleStatus, onDelete }: RowProps) {
  const t = useTranslations("pages.admin.assessments.items");
  const tChecks = useTranslations("pages.admin.assessments.editor.checks");
  const statusAction = row.status === "published" ? t("actions.unpublish") : t("actions.publish");
  const notReadyTitle = row.issues.map((rule) => tChecks(rule)).join(" · ");

  return (
    <tr className="border-b border-border last:border-0 hover:bg-primary/5">
      <td className="max-w-[28rem] px-4 py-2.5">
        <Link
          href={itemEditorPath(row.id)}
          className="line-clamp-2 font-medium text-primary-dark hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          {row.prompt}
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-text-secondary">
          <code className="rounded bg-surface-alt px-1 py-0.5">{row.id}</code>
          <span>{t(`kind.${row.kind}`)}</span>
          <span>{t("options", { count: row.optionCount })}</span>
          {row.promptRu === null && (
            <span className="inline-flex items-center gap-1">
              <Languages size={11} aria-hidden="true" />
              {t("noRu")}
            </span>
          )}
          {row.issues.length > 0 && (
            <span className="inline-flex items-center gap-1 font-medium text-primary-dark" title={notReadyTitle}>
              <AlertTriangle size={11} className="text-status-warning" aria-hidden="true" />
              {t("notReady")}
            </span>
          )}
        </div>
      </td>
      <td className="px-4 py-2.5 text-primary-dark">{row.day}</td>
      <td className="px-4 py-2.5 text-text-secondary">{row.topic}</td>
      <td className="px-4 py-2.5 text-text-secondary">{t(`difficulty.${row.difficulty}`)}</td>
      <td className="px-4 py-2.5">
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${
            row.status === "published" ? "bg-status-ok/15 text-status-ok" : "bg-status-warning/15 text-status-warning"
          }`}
        >
          {t(`status.${row.status}`)}
        </span>
      </td>
      <td className="px-4 py-2.5 text-text-secondary">
        <RelativeTime iso={row.updatedAt} />
      </td>
      <td className="px-4 py-2.5">
        <div className="flex items-center gap-1.5">
          <Link
            href={itemEditorPath(row.id)}
            aria-label={t("actions.rowLabel", { action: t("actions.edit"), id: row.id })}
            className={ICON_BUTTON_CLASS}
          >
            <Pencil size={13} aria-hidden="true" />
          </Link>
          <button
            type="button"
            onClick={() => onToggleStatus(row)}
            disabled={busy || disabled}
            aria-busy={busy}
            aria-label={t("actions.rowLabel", { action: statusAction, id: row.id })}
            className="whitespace-nowrap rounded-lg border border-border bg-surface px-2 py-1 text-[11px] font-medium text-text-secondary transition-colors hover:bg-surface-alt hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
          >
            {statusAction}
          </button>
          <button
            type="button"
            onClick={() => onDelete(row)}
            disabled={busy || disabled}
            aria-label={t("actions.rowLabel", { action: t("actions.delete"), id: row.id })}
            className={`${ICON_BUTTON_CLASS} hover:bg-status-outdated/10 hover:text-status-outdated`}
          >
            <Trash2 size={13} aria-hidden="true" />
          </button>
        </div>
      </td>
    </tr>
  );
});

export function AssessmentItemsBank({ rows, initialState }: { rows: ItemBankRow[]; initialState: ItemBankState }) {
  const t = useTranslations("pages.admin.assessments.items");
  const tToast = useTranslations("toast");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const online = useOnline();
  const { toast } = useToast();
  const describeError = useActionError();
  const [state, setState] = useState<ItemBankState>(initialState);
  const [pending, startTransition] = useTransition();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [confirmRow, setConfirmRow] = useState<ItemBankRow | null>(null);
  const [error, setError] = useState<{ title: string; details: string[] } | null>(null);

  // The URL follows the filters, one history write per pause (CLAUDE.md §4:
  // same-route params never go through router.push).
  useEffect(() => {
    const timer = window.setTimeout(() => {
      window.history.replaceState(null, "", `${window.location.pathname}${serializeItemBankState(state)}`);
    }, URL_WRITE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [state]);

  const topics = useMemo(() => bankTopics(rows), [rows]);
  const visible = useMemo(() => filterItemBank(rows, state), [rows, state]);
  const patch = useCallback((change: Partial<ItemBankState>) => setState((current) => ({ ...current, ...change })), []);

  const onToggleStatus = useCallback(
    (row: ItemBankRow) => {
      const next: ItemStatus = row.status === "published" ? "draft" : "published";
      setError(null);
      setPendingId(row.id);
      startTransition(async () => {
        const result = await setAssessmentItemStatus(row.id, next, row.version);
        setPendingId(null);
        if (!result.ok) {
          const { title, details, isConflict } = describeError(result);
          setError({ title, details });
          toast({
            kind: "error",
            title: isConflict ? tToast("conflict") : title,
            action: isConflict ? { label: tToast("refresh"), onClick: () => router.refresh() } : undefined,
          });
          return;
        }
        toast({ kind: "success", title: next === "published" ? t("toast.published") : t("toast.unpublished") });
        router.refresh();
      });
    },
    [describeError, router, t, tToast, toast]
  );

  const onDelete = useCallback((row: ItemBankRow) => setConfirmRow(row), []);

  function confirmDelete() {
    const row = confirmRow;
    if (!row) return;
    setError(null);
    setPendingId(row.id);
    startTransition(async () => {
      const result = await deleteAssessmentItem(row.id, row.version);
      setPendingId(null);
      setConfirmRow(null);
      if (!result.ok) {
        const { title, details, isConflict } = describeError(result);
        setError({ title, details });
        toast({
          kind: "error",
          title: isConflict ? tToast("conflict") : title,
          action: isConflict ? { label: tToast("refresh"), onClick: () => router.refresh() } : undefined,
        });
        return;
      }
      toast({ kind: "success", title: t("toast.deleted") });
      router.refresh();
    });
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={ListChecks}
        title={t("empty.title")}
        reason={t("empty.reason")}
        action={{ label: t("empty.cta"), href: itemEditorPath("new") }}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search
            size={14}
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary"
          />
          <input
            type="search"
            value={state.query}
            onChange={(event) => patch({ query: event.target.value })}
            maxLength={ITEM_BANK_QUERY_MAX_LENGTH}
            placeholder={t("filters.searchPlaceholder")}
            aria-label={t("filters.search")}
            autoComplete="off"
            spellCheck={false}
            className={`w-full py-2 pl-8 pr-3 placeholder:text-text-secondary ${CONTROL_CLASS}`}
          />
        </div>
        <select
          value={state.day ?? ""}
          onChange={(event) => {
            const day = Number(event.target.value);
            patch({ day: isAssessmentDay(day) ? day : null });
          }}
          aria-label={t("filters.day")}
          className={CONTROL_CLASS}
        >
          <option value="">{t("filters.anyDay")}</option>
          {ASSESSMENT_DAYS.map((day) => (
            <option key={day} value={day}>
              {t("readiness.day", { day })}
            </option>
          ))}
        </select>
        <select
          value={state.topic ?? ""}
          onChange={(event) => patch({ topic: event.target.value === "" ? null : event.target.value })}
          aria-label={t("filters.topic")}
          className={CONTROL_CLASS}
        >
          <option value="">{t("filters.anyTopic")}</option>
          {topics.map((topic) => (
            <option key={topic} value={topic}>
              {topic}
            </option>
          ))}
        </select>
        <select
          value={state.status ?? ""}
          onChange={(event) => {
            const value = event.target.value;
            patch({ status: isItemStatus(value) ? value : null });
          }}
          aria-label={t("filters.status")}
          className={CONTROL_CLASS}
        >
          <option value="">{t("filters.anyStatus")}</option>
          {ITEM_STATUSES.map((status) => (
            <option key={status} value={status}>
              {t(`status.${status}`)}
            </option>
          ))}
        </select>
        <select
          value={state.difficulty ?? ""}
          onChange={(event) => {
            const difficulty = Number(event.target.value);
            patch({ difficulty: isItemDifficulty(difficulty) ? difficulty : null });
          }}
          aria-label={t("filters.difficulty")}
          className={CONTROL_CLASS}
        >
          <option value="">{t("filters.anyDifficulty")}</option>
          {ITEM_DIFFICULTIES.map((difficulty) => (
            <option key={difficulty} value={difficulty}>
              {t(`difficulty.${difficulty}`)}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p role="status" className="text-[12.5px] text-text-secondary">
          {t("resultCount", { count: visible.length })}
        </p>
        {isFiltered(state) && (
          <button
            type="button"
            onClick={() => setState(EMPTY_ITEM_BANK_STATE)}
            className="text-[12.5px] font-medium text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {t("filters.reset")}
          </button>
        )}
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-status-outdated/40 bg-status-outdated/10 px-4 py-2.5 text-[13px] text-primary-dark"
        >
          <p className="font-medium">{error.title}</p>
          {error.details.length > 0 && (
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[12.5px]">
              {error.details.map((detail) => (
                <li key={detail}>{detail}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {visible.length === 0 ? (
        <EmptyState
          variant="compact"
          icon={Search}
          title={t("noMatch.title")}
          reason={t("noMatch.reason")}
          action={{ label: t("filters.reset"), onClick: () => setState(EMPTY_ITEM_BANK_STATE) }}
        />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-surface shadow-soft">
          <table className="w-full min-w-[880px] text-left text-[13px]">
            <caption className="sr-only">{t("tableLabel")}</caption>
            <thead>
              <tr className="border-b border-border bg-surface-alt/60">
                <th scope="col" className="px-4 py-2.5 font-semibold text-primary-dark">{t("columns.prompt")}</th>
                <th scope="col" className="px-4 py-2.5 font-semibold text-primary-dark">{t("columns.day")}</th>
                <th scope="col" className="px-4 py-2.5 font-semibold text-primary-dark">{t("columns.topic")}</th>
                <th scope="col" className="px-4 py-2.5 font-semibold text-primary-dark">{t("columns.difficulty")}</th>
                <th scope="col" className="px-4 py-2.5 font-semibold text-primary-dark">{t("columns.status")}</th>
                <th scope="col" className="px-4 py-2.5 font-semibold text-primary-dark">{t("columns.updated")}</th>
                <th scope="col" className="w-40 px-4 py-2.5 font-semibold text-primary-dark">{t("columns.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <ItemRow
                  key={row.id}
                  row={row}
                  busy={pending && pendingId === row.id}
                  disabled={!online}
                  onToggleStatus={onToggleStatus}
                  onDelete={onDelete}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!online && <p className="text-[12px] text-text-secondary">{tCommon("offline")}</p>}

      <ConfirmDialog
        open={confirmRow !== null}
        title={t("confirmDelete.title")}
        description={t("confirmDelete.description", { id: confirmRow?.id ?? "" })}
        confirmLabel={t("confirmDelete.confirm")}
        pending={pending}
        onConfirm={confirmDelete}
        onCancel={() => setConfirmRow(null)}
      />
    </div>
  );
}
