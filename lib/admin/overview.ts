import { checklistPercent } from "@/lib/telemetry/aggregate";
import { displayName, percentChange, type PersonOverview, type PersonTotals } from "@/lib/admin/people";

// The name a person is shown under lives in lib/admin/people.ts (client islands
// use it too); re-exported so the overview's callers keep one import.
export { displayName };

// The admin overview's arithmetic (/admin, R3/S03, rebuilt in the S03
// monitoring IA): who the page is about, the headline totals of a window and
// their change against the window before. Pure, so
// tests/unit/admin/overview.test.ts pins it; the page only formats.

/** The people the overview reports on: operators and sales managers. The
 * admin is never one of them — telemetry does not record that role (CLAUDE.md
 * §9), so its zeros would read as idleness. A deactivated person stays in the
 * report only for a window in which they were still active. */
export function overviewPeople(people: readonly PersonOverview[]): PersonOverview[] {
  return people.filter((person) => person.role !== "admin" && (person.isActive || person.activeDays > 0));
}

/** Onboarding progress of one window, in % of the checklist: the items the
 * person ticked in the window (private.dashboard_checklist_completed, the
 * number the dashboard's operator cards show), capped at 100 — a renamed item
 * could otherwise count twice. null when there is no checklist. */
export function onboardingPercent(person: Pick<PersonTotals, "checklistCompleted">, checklistTotal: number): number | null {
  const percent = checklistPercent(person.checklistCompleted, checklistTotal);
  return percent === null ? null : Math.min(100, percent);
}

export interface OverviewTotals {
  /** People in the report (overviewPeople). */
  people: number;
  /** Of those, the ones with any event in the window. */
  activePeople: number;
  activeMs: number;
  contentViews: number;
  copies: number;
}

export function overviewTotals(people: readonly PersonOverview[]): OverviewTotals {
  const reported = overviewPeople(people);
  return {
    people: reported.length,
    activePeople: reported.filter((person) => person.activeDays > 0).length,
    activeMs: sum(reported, (person) => person.activeMs),
    contentViews: sum(reported, (person) => person.contentViews),
    copies: sum(reported, (person) => person.copies),
  };
}

export interface OverviewDeltas {
  /** People, absolute. */
  activePeople: number | null;
  /** Percent change. */
  activeMs: number | null;
  contentViews: number | null;
}

/** Change from `previous` (the equal-length window before) to `current`.
 * With no previous window — its read failed — every delta is null, never a
 * change against an imagined zero. */
export function overviewDeltas(current: OverviewTotals, previous: OverviewTotals | null): OverviewDeltas {
  if (!previous) return { activePeople: null, activeMs: null, contentViews: null };
  return {
    activePeople: current.activePeople - previous.activePeople,
    activeMs: percentChange(current.activeMs, previous.activeMs),
    contentViews: percentChange(current.contentViews, previous.contentViews),
  };
}

/** `total / count`, rounded; null when there is nobody to divide by. */
export function averagePer(total: number, count: number): number | null {
  return count > 0 ? Math.round(total / count) : null;
}

/** Whether anyone in the report did anything in the window — the team table
 * says so above its rows instead of leaving a wall of zeros to explain itself. */
export function hasActivity(people: readonly PersonOverview[]): boolean {
  return people.some((person) => person.activeDays > 0);
}

/** Whole minutes, the unit of the daily series. */
export function toMinutes(ms: number): number {
  return Math.round(ms / 60_000);
}

function sum(people: readonly PersonOverview[], pick: (person: PersonOverview) => number): number {
  return people.reduce((total, person) => total + pick(person), 0);
}
