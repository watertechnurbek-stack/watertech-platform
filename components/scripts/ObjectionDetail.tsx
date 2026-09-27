"use client";

import type { ReactNode } from "react";
import { ArrowUpRight, ChevronLeft, ChevronRight, CornerDownRight, Headset, Lightbulb, User, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { CopyButton } from "@/components/CopyButton";
import { ContentFade } from "@/components/motion/ContentFade";
import { Pressable } from "@/components/motion/Pressable";
import { PinButton } from "@/components/ui/PinButton";
import type { ObjectionEntry } from "@/lib/content/objection-view";

/** One numbered beat of the answer flow, joined to the next by a thin rail so
 * the card reads top-down as the conversation happens. */
function Step({ icon: Icon, title, last, children }: { icon: LucideIcon; title: string; last: boolean; children: ReactNode }) {
  return (
    <li className={`relative flex gap-3 ${last ? "" : "pb-5"}`}>
      {!last && <span aria-hidden="true" className="absolute bottom-0 left-4 top-9 hidden w-px bg-border sm:block" />}
      <span className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-surface-alt text-accent sm:flex">
        <Icon size={16} aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1 sm:pt-1">
        <h3 className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-text-secondary">
          <Icon size={13} aria-hidden="true" className="shrink-0 text-accent sm:hidden" />
          {title}
        </h3>
        {children}
      </div>
    </li>
  );
}

interface ObjectionDetailProps {
  entry: ObjectionEntry;
  /** 1-based position among all published objections — the same number the list shows. */
  number: number;
  total: number;
  onPrev?: () => void;
  onNext?: () => void;
}

/** The objections page's answer card: what the client says → what it really
 * means → the reply to read out (copyable) → the next step, then where the
 * objection lives in the scripts and prev/next. Keyed by the parent on the
 * entry id, so switching objections fades the new card in once. */
export function ObjectionDetail({ entry, number, total, onPrev, onNext }: ObjectionDetailProps) {
  const t = useTranslations("pages.salesProcess.objections.playbook");
  const hasFollowUp = Boolean(entry.followUp);

  return (
    <ContentFade>
      <article className="rounded-2xl border border-border bg-surface p-4 shadow-soft sm:p-6">
        <header className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[12px] font-medium tabular-nums text-text-secondary">
              {t("position", { index: number, total })}
            </p>
            <h2 className="mt-0.5 text-[20px] font-bold text-primary-dark sm:text-[24px]">{entry.label}</h2>
          </div>
          <PinButton kind="objection" id={entry.id} />
        </header>

        <ol className="mt-5 max-w-3xl">
          <Step icon={User} title={t("steps.clientSays")} last={false}>
            <blockquote className="rounded-2xl rounded-tl-sm border border-primary/20 bg-primary-light/25 px-4 py-3 text-[15px] leading-relaxed text-primary-dark">
              &ldquo;{entry.clientSays}&rdquo;
            </blockquote>
          </Step>
          <Step icon={Lightbulb} title={t("steps.realMeaning")} last={false}>
            <p className="text-[14px] leading-relaxed text-text-secondary">{entry.realMeaning}</p>
          </Step>
          <Step icon={Headset} title={t("steps.response")} last={!hasFollowUp}>
            <div className="rounded-2xl rounded-tl-sm border border-border border-l-[3px] border-l-primary bg-surface px-4 py-3 shadow-softer">
              <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-primary-dark">{entry.response}</p>
              <div className="mt-3 flex">
                <CopyButton value={entry.response} label={t("copyResponse")} entityType="objection" entityId={entry.id} />
              </div>
            </div>
          </Step>
          {entry.followUp && (
            <Step icon={CornerDownRight} title={t("steps.followUp")} last>
              <p className="whitespace-pre-wrap rounded-xl border border-dashed border-border bg-surface-alt px-4 py-3 text-[14px] leading-relaxed text-primary-dark">
                {entry.followUp}
              </p>
            </Step>
          )}
        </ol>

        <footer className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
          {entry.scripts.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[12px] font-medium text-text-secondary">{t("usedIn")}</span>
              {entry.scripts.map((s) => (
                <Link
                  key={s.id}
                  href={s.href}
                  className="flex items-center gap-1 rounded-full border border-border bg-surface px-3 py-1 text-[12px] font-medium text-primary transition-colors hover:border-primary/40 hover:text-primary-dark"
                >
                  {s.name}
                  <ArrowUpRight size={12} aria-hidden="true" />
                </Link>
              ))}
            </div>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            <Pressable
              type="button"
              onClick={onPrev}
              disabled={!onPrev}
              className="flex items-center gap-1 rounded-lg border border-border bg-surface px-3 py-1.5 text-[13px] font-medium text-primary-dark transition-colors hover:bg-surface-alt disabled:pointer-events-none disabled:opacity-40"
            >
              <ChevronLeft size={14} aria-hidden="true" />
              {t("prev")}
            </Pressable>
            <Pressable
              type="button"
              onClick={onNext}
              disabled={!onNext}
              className="flex items-center gap-1 rounded-lg border border-border bg-surface px-3 py-1.5 text-[13px] font-medium text-primary-dark transition-colors hover:bg-surface-alt disabled:pointer-events-none disabled:opacity-40"
            >
              {t("next")}
              <ChevronRight size={14} aria-hidden="true" />
            </Pressable>
          </div>
        </footer>
      </article>
    </ContentFade>
  );
}
