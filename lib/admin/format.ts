/** Translator for the `admin.relativeTime` messages. */
export type RelativeTimeTranslator = (key: "now" | "minutes" | "hours" | "days", values?: { count: number }) => string;

/** Relative-time label for an admin table's "updated_at" column. Callers
 * must only use this after mount (see hooks/useMounted.ts) — it reads
 * Date.now(), which would otherwise produce a server/client hydration
 * mismatch. Beyond 30 days it falls back to a plain date in `locale`.
 *
 * `nowMs` is the clock to measure against — a list of many rows passes one
 * shared reading (useNow) so they all agree and none reads the clock itself. */
export function formatRelative(
  iso: string,
  t: RelativeTimeTranslator,
  locale: string,
  nowMs: number = Date.now()
): string {
  const diffMs = nowMs - new Date(iso).getTime();
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < 1) return t("now");
  if (diffMin < 60) return t("minutes", { count: diffMin });
  const diffHour = Math.round(diffMin / 60);
  if (diffHour < 24) return t("hours", { count: diffHour });
  const diffDay = Math.round(diffHour / 24);
  if (diffDay < 30) return t("days", { count: diffDay });
  // formatDate, not a second toLocaleDateString call: it fixes Asia/Tashkent
  // (every other date in this file does) — a bare toLocaleDateString(locale)
  // here printed the server's or the visitor's local calendar day instead.
  return formatDate(iso, locale);
}

/** Asia/Tashkent is UTC+5 all year (no DST), as lib/telemetry/aggregate.ts relies on. */
const TASHKENT_OFFSET_MS = 5 * 60 * 60 * 1000;

/** "2026-09-24 13:05" in Tashkent — built from the ISO string, not Intl, so the
 * server and the browser print the same characters (Node's ICU and Chrome's
 * locale data format "uz-UZ" differently, which broke hydration). What a
 * client component shows for an instant until it has mounted. */
export function formatStableDateTime(iso: string): string {
  return new Date(Date.parse(iso) + TASHKENT_OFFSET_MS).toISOString().slice(0, 16).replace("T", " ");
}

/** Absolute date and time in the office's time zone (Tashkent, like every
 * other date the manager area shows). Deterministic for a given instant, so —
 * unlike formatRelative — it is safe to call while rendering on the server. */
export function formatDateTime(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "uz-UZ", {
    timeZone: "Asia/Tashkent",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

/** The date part of formatDateTime, in the same time zone — for "added on".
 * Server-rendered only, like formatDateTime. */
export function formatDate(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "uz-UZ", {
    timeZone: "Asia/Tashkent",
    dateStyle: "medium",
  }).format(new Date(iso));
}
