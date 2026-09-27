import { getTranslations } from "next-intl/server";
import { TRACKED_ROLES } from "@/lib/auth/claims";
import { localeOrDefault, localizedPath } from "@/lib/i18n/localized-path";
import type { PersonRecord } from "@/lib/admin/people";
import type { DashboardRange } from "@/lib/dashboard/range";

export interface OperatorFilterProps {
  range: DashboardRange;
  /** Locale-less path of the page the form submits to. */
  basePath: string;
  locale: string;
  /** The allow-list (fetchPeopleLookup), read in the page's own Promise.all;
   * null when that read failed — the filter then offers "everyone" only. */
  people: readonly PersonRecord[] | null;
}

/** The person filter of a monitoring page: operators and sales managers, the
 * two roles telemetry records (CLAUDE.md §9) — the admin records nothing, so is
 * never an option. A plain GET form that carries from/to as hidden fields, so
 * picking a person never resets the range, and needs no client code. The
 * people arrive as a prop instead of being read here, so the page's reads stay
 * one round of queries. */
export async function OperatorFilter({ range, basePath, locale, people }: OperatorFilterProps) {
  const [t, tRoles] = await Promise.all([
    getTranslations("dashboard.operatorFilter"),
    getTranslations("pages.admin.users.roles"),
  ]);
  const tracked = (people ?? []).filter((person) => TRACKED_ROLES.some((role) => role === person.role));
  // A filter the list does not name (a removed person, a hand-edited URL, a
  // failed lookup) is still the filter the page applied — shown as it is,
  // never as "everyone".
  const unlisted =
    range.operatorEmail !== null && !tracked.some((person) => person.email === range.operatorEmail)
      ? range.operatorEmail
      : null;

  return (
    <form method="get" action={localizedPath(basePath, localeOrDefault(locale))} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="from" value={range.from} />
      <input type="hidden" name="to" value={range.to} />
      <select
        name="op"
        aria-label={t("label")}
        defaultValue={range.operatorEmail ?? ""}
        className="max-w-[16rem] rounded-lg border border-border bg-surface-alt px-3 py-1.5 text-[12.5px] text-primary-dark focus:outline-none focus:ring-2 focus:ring-primary-light"
      >
        <option value="">{t("all")}</option>
        {unlisted && <option value={unlisted}>{unlisted}</option>}
        {tracked.map((person) => (
          <option key={person.email} value={person.email}>
            {`${person.fullName?.trim() || person.email} · ${tRoles(person.role)}`}
          </option>
        ))}
      </select>
      <button
        type="submit"
        className="rounded-lg border border-border bg-surface px-3 py-1.5 text-[12.5px] font-medium text-primary-dark transition-colors hover:bg-surface-alt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        {t("apply")}
      </button>
    </form>
  );
}
