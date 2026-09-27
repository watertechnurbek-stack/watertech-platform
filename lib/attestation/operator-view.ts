import "server-only";
import { scheduleDays, type ScheduleInput } from "./schedule";
import type { DaySchedule, OperatorAttestationState, OperatorDayState } from "./types";

// THE ONLY producer of data for a candidate's response (docs/ATTESTATION.md
// §7, hard rule). An operator or a sales manager may learn per-day status and
// nothing else: locked (with the date it opens, or the day it waits for),
// available, in progress, submitted — every evaluation state reads as
// "submitted". Objects are built key by key from a schedule that carries no
// score; a row is never spread into a response.
//
// tests/unit/attestation/operator-view.test.ts serialises the result for every
// attempt state and compares its key set with OPERATOR_STATE_KEYS. S05 adds a
// producer here for each further candidate shape (a served item, a customer
// message), each with the same kind of allow-list test.

/** Every key a candidate's state response may contain, at any depth. */
export const OPERATOR_STATE_KEYS = ["days", "day", "status", "opensOn", "afterDay"] as const;

export function toOperatorDayState(schedule: DaySchedule): OperatorDayState {
  switch (schedule.kind) {
    case "open":
      return { day: schedule.day, status: "available" };
    case "locked_after":
      return { day: schedule.day, status: "locked", afterDay: schedule.afterDay };
    case "locked_until":
      return { day: schedule.day, status: "locked", opensOn: schedule.opensOn };
    case "attempt":
      return { day: schedule.day, status: schedule.status === "in_progress" ? "in_progress" : "submitted" };
  }
}

export function buildOperatorAttestationState(input: ScheduleInput): OperatorAttestationState {
  return { days: scheduleDays(input).map(toOperatorDayState) };
}
