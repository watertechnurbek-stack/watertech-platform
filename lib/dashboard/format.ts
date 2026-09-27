/** Translator for the two duration shapes — the `dashboard.duration` messages
 * ("15 daq" / "2 soat 15 daq"). Shared by the overview, the people directory
 * and the person page, so a duration reads the same everywhere. */
export type DurationTranslator = (key: "minutes" | "hoursMinutes", values: { hours: number; minutes: number }) => string;

export function formatDuration(ms: number, t: DurationTranslator): string {
  const totalMinutes = Math.round(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours === 0 ? t("minutes", { hours, minutes }) : t("hoursMinutes", { hours, minutes });
}
