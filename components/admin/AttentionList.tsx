import { getLocale, getTranslations } from "next-intl/server";
import { ArrowRight, BellRing, ChevronDown } from "lucide-react";
import { Link } from "@/i18n/routing";
import { EmptyState } from "@/components/EmptyState";
import { ChartCard } from "@/components/admin/charts/ChartCard";
import {
  ATTENTION_VISIBLE_ITEMS,
  type AttentionItem,
  type AttentionSeverity,
  type AttentionSource,
} from "@/lib/admin/attention";

/** The dot of each severity. The word next to it (`attention.severity.*`)
 * says the same thing — colour never carries it alone (CLAUDE.md §6). */
const DOT: Readonly<Record<AttentionSeverity, string>> = {
  high: "bg-status-outdated",
  medium: "bg-status-warning",
  low: "bg-status-ok",
};

export interface AttentionListProps {
  /** Ranked already (lib/admin/attention.ts buildAttentionItems). */
  items: readonly AttentionItem[];
  /** Sources whose read failed (attentionSkippedSources): the list says it is
   * incomplete instead of claiming all is well. */
  skipped: readonly AttentionSource[];
}

/**
 * "Diqqat talab qiladi" — the overview's list of what needs the admin now
 * (S03). A Server Component with no knowledge of any kind: each item is its
 * severity (a dot and a word), the sentence `attention.items.<kind>.text` with
 * the item's values, and its one action `attention.items.<kind>.action`. So a
 * kind added in lib/admin/attention.ts needs only its two messages here.
 *
 * The first ATTENTION_VISIBLE_ITEMS show; the rest sit in a native
 * <details> ("Hammasi"), which needs no client code and works without JS.
 * Nothing to show is good news — a positive EmptyState — unless a source could
 * not be read, which is said instead.
 */
export async function AttentionList({ items, skipped }: AttentionListProps) {
  const [t, tEmpty, locale] = await Promise.all([
    getTranslations("pages.admin.overview.attention"),
    getTranslations("emptyState.attentionClear"),
    getLocale(),
  ]);

  const visible = items.slice(0, ATTENTION_VISIBLE_ITEMS);
  const rest = items.slice(ATTENTION_VISIBLE_ITEMS);
  const skippedText =
    skipped.length === 0
      ? null
      : new Intl.ListFormat(locale === "ru" ? "ru-RU" : "uz-UZ", { type: "conjunction" }).format(
          skipped.map((source) => t(`sources.${source}`))
        );

  const row = (item: AttentionItem) => (
    <li key={item.key} className="flex flex-wrap items-start gap-x-3 gap-y-1.5 py-3 first:pt-0 last:pb-0">
      <span className="flex w-[6.5rem] shrink-0 items-center gap-1.5 pt-0.5 text-[12px] font-semibold text-text-secondary">
        <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${DOT[item.severity]}`} />
        {t(`severity.${item.severity}`)}
      </span>
      <p className="min-w-0 flex-1 basis-56 text-[13.5px] text-primary-dark">{t(`items.${item.kind}.text`, item.values)}</p>
      <Link
        href={item.href}
        className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-lg px-1 text-[12.5px] font-medium text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        {t(`items.${item.kind}.action`)}
        <ArrowRight size={13} aria-hidden="true" />
      </Link>
    </li>
  );

  return (
    <ChartCard id="attention" icon={BellRing} title={t("title")} description={t("description")}>
      {skippedText && (
        <p
          role="status"
          className="mb-3 rounded-xl border border-status-warning/40 bg-status-warning/10 px-3 py-2 text-[12.5px] text-primary-dark"
        >
          {t("incomplete", { sources: skippedText })}
        </p>
      )}

      {items.length === 0 ? (
        skippedText ? null : (
          <EmptyState variant="compact" stateKey="attentionClear" title={tEmpty("title")} reason={tEmpty("reason")} />
        )
      ) : (
        <>
          <ul className="divide-y divide-border">{visible.map(row)}</ul>
          {rest.length > 0 && (
            <details className="group mt-1 border-t border-border pt-2">
              <summary className="flex w-fit cursor-pointer list-none items-center gap-1 rounded-lg px-1 py-1 text-[12.5px] font-medium text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary [&::-webkit-details-marker]:hidden">
                <ChevronDown size={14} aria-hidden="true" className="transition-transform group-open:rotate-180 motion-reduce:transition-none" />
                {t("showAll", { count: items.length })}
              </summary>
              <ul className="mt-2 divide-y divide-border">{rest.map(row)}</ul>
            </details>
          )}
        </>
      )}
    </ChartCard>
  );
}
