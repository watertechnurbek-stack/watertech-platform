"use client";

import { memo, useMemo } from "react";
import { GraduationCap, Lock } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { ColumnBars, type ColumnPoint } from "@/components/admin/charts/ColumnBars";
import { PersonAvatar } from "@/components/admin/people/PersonAvatar";
import { PersonCardMenu } from "@/components/admin/people/PersonCardMenu";
import { RoleBadge } from "@/components/admin/people/RoleBadge";
import { dayAt, type DirectoryPerson } from "@/lib/admin/directory";
import { formatRelative, formatStableDateTime } from "@/lib/admin/format";
import { emailLocalPart, personPath } from "@/lib/admin/people";
import { formatDuration } from "@/lib/dashboard/format";

export interface PersonCardProps {
  person: DirectoryPerson;
  /** The Tashkent day (YYYY-MM-DD) of the first sparkline column — the same
   * for every card (`stats.dailyMs` carries no dates). */
  windowStart: string;
  /** The clock the "last active" line is measured against — one reading shared
   * by every card (PeopleDirectory's useNow, floored to the minute so memoized
   * cards re-render once a minute, not on every tick). null until mount: the
   * server and the first client paint show an absolute time instead. */
  nowMs: number | null;
  /** The admin may change this row: not an admin's, not their own. Only then
   * does the card get its ⋯ menu. */
  manageable: boolean;
  /** Stable callbacks from PeopleDirectory, which owns the one confirm dialog
   * and the one remove dialog every card opens. */
  onToggleActive: (person: DirectoryPerson) => void;
  onRemove: (person: DirectoryPerson) => void;
}

/** One person of the directory: who they are, whether they can sign in, how
 * far through onboarding they are, when they were last seen and how the last
 * 14 days looked. The whole card is one
 * link to their page; for an operator or a sales manager a ⋯ menu sits in its
 * corner, next to the link rather than inside it (a button inside an <a> is
 * not valid HTML). Memoized — the directory holds ~200 of them and a
 * keystroke in the search box must not re-render the ones that stay, so the
 * callbacks it receives are stable. Nothing here fetches: every number arrived
 * in `person`. */
export const PersonCard = memo(function PersonCard({
  person,
  windowStart,
  nowMs,
  manageable,
  onToggleActive,
  onRemove,
}: PersonCardProps) {
  const locale = useLocale();
  const t = useTranslations("pages.admin.people.card");
  const tUsers = useTranslations("pages.admin.users");
  const tRel = useTranslations("admin.relativeTime");
  const tDuration = useTranslations("dashboard.duration");

  const name = person.fullName?.trim() || emailLocalPart(person.email);
  const muted = !person.isActive;
  const isAdmin = person.role === "admin";
  const { stats } = person;

  // Per-day active minutes. The tooltip names the day the way the database
  // does (YYYY-MM-DD): Intl's "uz-UZ" prints differently in Node and in the
  // browser, and this markup is rendered by both (CLAUDE.md §15).
  const points = useMemo<ColumnPoint[]>(
    () =>
      (stats?.dailyMs ?? []).map((activeMs, index) => {
        const day = dayAt(windowStart, index);
        const minutes = Math.round(activeMs / 60_000);
        return {
          key: day,
          label: day.slice(8),
          value: minutes,
          display: String(minutes),
          title: t("dayTitle", { day, minutes }),
        };
      }),
    [stats, windowStart, t]
  );

  const lastActive = person.lastActivityAt;
  const lastActiveText =
    lastActive === null
      ? t("neverActive")
      : nowMs === null
        ? formatStableDateTime(lastActive)
        : formatRelative(lastActive, tRel, locale, nowMs);

  return (
    <div className="relative h-full">
      <Link
        href={personPath(person.email)}
        // ~200 cards: prefetching each one would start a server render per card
        // scrolled past, for pages that are session-scoped and never cached.
        prefetch={false}
        className="group block h-full rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <div
          className={`flex h-full flex-col gap-3 rounded-2xl border p-4 shadow-softer transition-colors ${
            muted
              ? "border-dashed border-border bg-surface-alt"
              : "border-border bg-surface group-hover:bg-primary/5"
          }`}
        >
          <div className={`flex items-center gap-3 ${manageable ? "pr-9" : ""}`}>
            <PersonAvatar fullName={person.fullName} email={person.email} muted={muted} />
            <div className="min-w-0">
              <p
                className={`truncate text-[14px] font-semibold ${muted ? "text-text-secondary" : "text-primary-dark"}`}
              >
                {name}
              </p>
              <p title={person.email} className="truncate text-[12.5px] text-text-secondary">
                {person.email}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <RoleBadge role={person.role} label={tUsers(`roles.${person.role}`)} />
            <span className="inline-flex items-center gap-1.5 text-[12.5px] text-text-secondary">
              <span
                aria-hidden="true"
                className={`h-2 w-2 shrink-0 rounded-full ${person.isActive ? "bg-status-ok" : "bg-status-outdated"}`}
              />
              {person.isActive ? tUsers("status.active") : tUsers("status.inactive")}
            </span>
            {person.onboarding && (
              <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px] font-semibold tabular-nums text-primary-dark">
                <GraduationCap size={12} aria-hidden="true" className="shrink-0 text-text-secondary" />
                {person.onboarding.completed >= person.onboarding.total
                  ? t("onboardingDone")
                  : t("onboarding", { completed: person.onboarding.completed, total: person.onboarding.total })}
              </span>
            )}
          </div>

          {isAdmin ? (
            <p className="mt-auto flex items-center gap-1.5 text-[12.5px] text-text-secondary">
              <Lock size={12} aria-hidden="true" className="shrink-0" />
              {t("noTelemetry")}
            </p>
          ) : (
            <>
              <p className="text-[12.5px] text-text-secondary">
                {t.rich("lastActive", {
                  when: lastActiveText,
                  time: (chunks) =>
                    lastActive === null ? (
                      <span className="font-medium text-primary-dark">{chunks}</span>
                    ) : (
                      <time
                        dateTime={lastActive}
                        title={nowMs === null ? undefined : formatStableDateTime(lastActive)}
                        className="font-medium text-primary-dark"
                      >
                        {chunks}
                      </time>
                    ),
                })}
              </p>

              {stats ? (
                <div className={`mt-auto space-y-1.5 ${muted ? "opacity-60" : ""}`}>
                  <ColumnBars
                    compact
                    size="sm"
                    tone="green"
                    points={points}
                    label={t("seriesLabel", { name, days: points.length })}
                  />
                  <p className="text-[12.5px] text-text-secondary">
                    {t("windowActive", { days: points.length, time: formatDuration(stats.activeMs, tDuration) })}
                  </p>
                </div>
              ) : (
                <p className="mt-auto text-[12.5px] text-text-secondary">{t("statsUnavailable")}</p>
              )}
            </>
          )}
        </div>
      </Link>
      {manageable && (
        <div className="absolute right-2 top-2">
          <PersonCardMenu person={person} name={name} onToggleActive={onToggleActive} onRemove={onRemove} />
        </div>
      )}
    </div>
  );
});
