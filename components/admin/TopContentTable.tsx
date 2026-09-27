import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/routing";
import type { TopContentItem } from "@/lib/admin/people";

export interface TopContentTableProps {
  /** Ranked already (admin_top_content). */
  items: readonly TopContentItem[];
  /** "compact": the overview's half-width top five — the type moves under the
   * title and the people column goes; "full": the knowledge page's list. */
  variant: "compact" | "full";
}

/** The materials operators and sales managers used most — views, copies and
 * (full) how many people — each title linking to its editor where there is
 * one. One table for both pages, so their numbers always read the same way. It
 * scrolls sideways inside its own focusable region on a narrow screen. */
export async function TopContentTable({ items, variant }: TopContentTableProps) {
  const [t, locale] = await Promise.all([getTranslations("pages.admin.overview.topContent"), getLocale()]);
  const num = new Intl.NumberFormat(locale === "ru" ? "ru-RU" : "uz-UZ");
  const full = variant === "full";

  return (
    <div
      role="region"
      aria-label={t("title")}
      tabIndex={0}
      className="relative overflow-x-auto rounded-xl border border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <table className={`w-full text-left text-[13px] ${full ? "min-w-[36rem]" : "min-w-[20rem]"}`}>
        <caption className="sr-only">{t("title")}</caption>
        <thead>
          <tr className="border-b border-border bg-surface-alt text-[12px] text-text-secondary">
            <th scope="col" className="w-10 px-3 py-2.5 font-semibold">
              {t("columns.rank")}
            </th>
            <th scope="col" className="px-3 py-2.5 font-semibold">
              {t("columns.material")}
            </th>
            {full && (
              <th scope="col" className="px-3 py-2.5 font-semibold">
                {t("columns.type")}
              </th>
            )}
            <th scope="col" className="px-3 py-2.5 text-right font-semibold">
              {t("columns.views")}
            </th>
            <th scope="col" className="px-3 py-2.5 text-right font-semibold">
              {t("columns.copies")}
            </th>
            {full && (
              <th scope="col" className="px-3 py-2.5 text-right font-semibold">
                {t("columns.people")}
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => (
            <tr key={`${item.viewType}:${item.entityId ?? item.path}`} className="border-b border-border bg-surface last:border-0">
              <td className="px-3 py-2.5 tabular-nums text-text-secondary">{num.format(index + 1)}</td>
              <td className={`px-3 py-2.5 ${full ? "max-w-[22rem]" : "max-w-[14rem]"}`}>
                {item.adminHref ? (
                  <Link
                    href={item.adminHref}
                    className="block truncate rounded-lg font-medium text-primary-dark hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    {item.label}
                  </Link>
                ) : (
                  <span className="block truncate font-medium text-primary-dark">{item.label}</span>
                )}
                {!full && (
                  <span className="block truncate text-[12px] text-text-secondary">{t(`viewTypes.${item.viewType}`)}</span>
                )}
              </td>
              {full && (
                <td className="whitespace-nowrap px-3 py-2.5 text-text-secondary">{t(`viewTypes.${item.viewType}`)}</td>
              )}
              <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-primary-dark">
                {num.format(item.views)}
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums text-primary-dark">{num.format(item.copies)}</td>
              {full && (
                <td className="px-3 py-2.5 text-right tabular-nums text-primary-dark">{num.format(item.people)}</td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
