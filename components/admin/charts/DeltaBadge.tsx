import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";

export type DeltaUnit = "%" | "pp" | "abs";

/** Which way is good news: "up" for activity, "down" for a count of problems
 * (the overview's knowledge gaps). */
export type DeltaBetter = "up" | "down";

/** Change against the previous equal-length period. `null` means there is
 * nothing to compare against (the previous period was zero, or could not be
 * read) and shows a dash — never a made-up "+100%". The sign and the arrow say
 * the direction in text and shape; whether that is good news tints the arrow
 * (status-ok good, status-outdated bad — `better` says which direction is
 * good), so colour is never the only signal. The number itself stays
 * text-primary-dark: tinted status text is under 4.5:1 in the light theme
 * (docs/AUDIT.md, finding 9). */
export async function DeltaBadge({
  value,
  unit,
  better = "up",
}: {
  value: number | null;
  unit: DeltaUnit;
  better?: DeltaBetter;
}) {
  const [t, locale] = await Promise.all([getTranslations("admin.charts.delta"), getLocale()]);
  const context = t("vsPrevious");

  if (value === null) {
    return (
      <span title={t("none")} className="text-[12.5px] font-semibold text-text-secondary">
        —<span className="sr-only">{` ${t("none")}`}</span>
      </span>
    );
  }

  const number = new Intl.NumberFormat(locale === "ru" ? "ru-RU" : "uz-UZ", {
    signDisplay: "exceptZero",
    maximumFractionDigits: 0,
  }).format(value);
  const text = unit === "%" ? t("percent", { value: number }) : unit === "pp" ? t("points", { value: number }) : number;
  const good = better === "up" ? value > 0 : value < 0;
  const tone = value === 0 ? "text-text-secondary" : good ? "text-status-ok" : "text-status-outdated";
  const Icon = value > 0 ? ArrowUpRight : value < 0 ? ArrowDownRight : Minus;

  return (
    <span
      title={context}
      className={`inline-flex items-center gap-0.5 text-[12.5px] font-semibold tabular-nums ${
        value === 0 ? "text-text-secondary" : "text-primary-dark"
      }`}
    >
      <Icon size={13} aria-hidden="true" className={tone} />
      {text}
      <span className="sr-only">{` ${context}`}</span>
    </span>
  );
}
