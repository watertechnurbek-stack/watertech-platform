import { getTranslations } from "next-intl/server";
import { RangePickerLink } from "@/components/dashboard/RangePickerLink";
import { buildRangePresets, type DashboardRange } from "@/lib/dashboard/range";

/** Plain GET links, no client state — each preset (RANGE_PRESET_DAYS) sets
 * from/to while preserving the current person filter and pointing back at
 * whichever admin page it's rendered on. */
export async function RangePicker({ range, basePath }: { range: DashboardRange; basePath: string }) {
  const t = await getTranslations("dashboard.ranges");
  const presets = buildRangePresets();

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {presets.map((preset) => {
        const isActive = preset.from === range.from && preset.to === range.to;
        const params = new URLSearchParams({ from: preset.from, to: preset.to });
        if (range.operatorEmail) params.set("op", range.operatorEmail);
        return (
          <RangePickerLink
            key={preset.key}
            href={`${basePath}?${params.toString()}`}
            label={t(preset.key)}
            active={isActive}
          />
        );
      })}
    </div>
  );
}
