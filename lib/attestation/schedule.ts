import { tashkentDateOf } from "@/lib/telemetry/aggregate";
import {
  ASSESSMENT_DAYS,
  isSubmittedStatus,
  type AssessmentDay,
  type AttemptStatus,
  type DaySchedule,
} from "./types";

// The pace rule (docs/ATTESTATION.md §5), pure: which of the four days a person
// may open now, from their attempts, the admin's unlocks and today's Tashkent
// date. Day 1 is open on the first visit. Day N > 1 opens once day N−1 has been
// submitted AND today (Asia/Tashkent) is later than the Tashkent date of that
// submission; an unlock waives only the waiting day — never the order.
// Uzbekistan keeps UTC+5 all year, so a Tashkent date is the instant + 5 h
// (lib/telemetry/aggregate.ts), with no DST edge anywhere in the year.

/** An attempt as the schedule needs it — no score, no answer. */
export interface ScheduleAttempt {
  day: AssessmentDay;
  status: AttemptStatus;
  submittedAt: string | null;
}

export interface ScheduleInput {
  attempts: readonly ScheduleAttempt[];
  /** Days 2–4 the admin opened for this person (assessment_unlocks). */
  unlockedDays: readonly AssessmentDay[];
  /** Today in Tashkent, YYYY-MM-DD (todayInTashkent() at the call site). */
  today: string;
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** The calendar date after `date` (YYYY-MM-DD). */
export function nextDate(date: string): string {
  if (!DATE_PATTERN.test(date)) throw new RangeError(`nextDate: expected YYYY-MM-DD, got "${date}"`);
  const next = new Date(`${date}T00:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
}

/** The attempt that still counts for a day: its one non-archived attempt (the
 * database allows at most one). */
function openAttempt(attempts: readonly ScheduleAttempt[], day: AssessmentDay): ScheduleAttempt | undefined {
  return attempts.find((attempt) => attempt.day === day && attempt.status !== "archived");
}

function previousDay(day: AssessmentDay): AssessmentDay | null {
  switch (day) {
    case 1:
      return null;
    case 2:
      return 1;
    case 3:
      return 2;
    case 4:
      return 3;
  }
}

export function scheduleDay(input: ScheduleInput, day: AssessmentDay): DaySchedule {
  if (!DATE_PATTERN.test(input.today)) throw new RangeError(`scheduleDay: today must be YYYY-MM-DD, got "${input.today}"`);

  const own = openAttempt(input.attempts, day);
  if (own && own.status !== "archived") return { day, kind: "attempt", status: own.status };

  const before = previousDay(day);
  if (before === null) return { day, kind: "open" };

  const previous = openAttempt(input.attempts, before);
  if (!previous || !isSubmittedStatus(previous.status) || previous.submittedAt === null) {
    return { day, kind: "locked_after", afterDay: before };
  }

  if (input.unlockedDays.includes(day)) return { day, kind: "open" };

  const opensOn = nextDate(tashkentDateOf(previous.submittedAt));
  return input.today >= opensOn ? { day, kind: "open" } : { day, kind: "locked_until", opensOn };
}

/** All four days, in order. */
export function scheduleDays(input: ScheduleInput): DaySchedule[] {
  return ASSESSMENT_DAYS.map((day) => scheduleDay(input, day));
}
