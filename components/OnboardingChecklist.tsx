"use client";

import { RouteMap, type RouteDay } from "@/components/onboarding/RouteMap";
import { useTrack } from "@/hooks/useTrack";
import { useUserState } from "@/hooks/useUserState";
import { onboardingKeyDef } from "@/lib/user-state/keys";
import { onboardingSummaryChecklist, type LocalizedOnboardingDay, type LocalizedOnboardingItem } from "@/lib/content/onboarding";

/** Module level so the definition — and with it the setter and the hydration
 * effect inside useUserState — stays identical across renders. The item ids
 * are only needed to import the oldest storage format, which was keyed by
 * each item's index in this same array (see lib/user-state/legacy.ts). Only
 * the ids are read from the raw array; every visible string comes in through
 * the localized props below. */
const ONBOARDING_STATE = onboardingKeyDef(onboardingSummaryChecklist.map((item) => item.id));

/** The only checkable items are the summary checklist, one per day (`summary-d<day>`). */
const summaryIdForDay = (day: number): string => `summary-d${day}`;

interface OnboardingChecklistProps {
  /** Localized day-by-day program (getOnboardingDays). */
  days: LocalizedOnboardingDay[];
  /** Localized quick-summary checklist (getOnboardingSummaryChecklist). */
  summary: LocalizedOnboardingItem[];
}

/**
 * Owns the onboarding progress: its per-user state, its telemetry and which
 * item a day's checkbox ticks. RouteMap only draws it (R3/S07).
 */
export function OnboardingChecklist({ days, summary }: OnboardingChecklistProps) {
  // Synced per user, not per browser: progress follows the operator to another
  // device, and the admin sees it in the people directory (/admin/users). The old
  // `onboarding_checklist_v2` localStorage value is imported once on first run.
  const [checkedItems, setCheckedItems, status] = useUserState(
    ONBOARDING_STATE.key,
    ONBOARDING_STATE.schema,
    ONBOARDING_STATE.defaultValue,
    ONBOARDING_STATE
  );

  const track = useTrack();
  const toggleCheck = (id: string) => {
    const checked = !checkedItems[id];
    setCheckedItems({ ...checkedItems, [id]: checked });
    track("checklist_toggle", { entityType: "onboarding_item", entityId: id, meta: { checked } });
  };

  // Each day carries its own line of the summary checklist as its checkbox.
  const summaryText = new Map(summary.map((item) => [item.id, item.text]));
  const routeDays: RouteDay[] = days.map((day) => ({ ...day, summary: summaryText.get(summaryIdForDay(day.day)) ?? null }));

  // Counted over the current days and their summary items only, so stale keys
  // in storage (legacy or renamed ids) cannot push the count past the total.
  const completedDays = routeDays
    .filter((day) => day.summary !== null && checkedItems[summaryIdForDay(day.day)])
    .map((day) => day.day);

  const toggleDay = (day: number) => {
    const id = summaryIdForDay(day);
    if (summaryText.has(id)) toggleCheck(id);
  };

  return (
    <RouteMap days={routeDays} completedDays={completedDays} onToggleDay={toggleDay} ready={status !== "loading"} />
  );
}
