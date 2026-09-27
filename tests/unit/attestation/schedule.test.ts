import { describe, expect, it } from "vitest";
import { nextDate, scheduleDay, scheduleDays, type ScheduleAttempt } from "@/lib/attestation/schedule";
import { tashkentDateOf } from "@/lib/telemetry/aggregate";

// Tashkent is UTC+5 all year: 19:00 UTC is the start of the next Tashkent day.

function attempt(day: ScheduleAttempt["day"], status: ScheduleAttempt["status"], submittedAt: string | null = null): ScheduleAttempt {
  return { day, status, submittedAt };
}

describe("tashkentDateOf and nextDate", () => {
  it("move to the next Tashkent day at 19:00 UTC", () => {
    expect(tashkentDateOf("2026-09-26T18:59:59.999Z")).toBe("2026-09-26");
    expect(tashkentDateOf("2026-09-26T19:00:00.000Z")).toBe("2026-09-27");
    expect(tashkentDateOf(Date.parse("2026-12-31T19:00:00.000Z"))).toBe("2027-01-01");
  });

  it("have no DST edge: the European switch weekends read like any other", () => {
    expect(tashkentDateOf("2026-03-29T18:59:59.000Z")).toBe("2026-03-29");
    expect(tashkentDateOf("2026-03-29T19:00:00.000Z")).toBe("2026-03-30");
    expect(tashkentDateOf("2026-10-25T18:59:59.000Z")).toBe("2026-10-25");
    expect(tashkentDateOf("2026-10-25T19:00:00.000Z")).toBe("2026-10-26");
  });

  it("step across month and year ends and leap days", () => {
    expect(nextDate("2026-09-30")).toBe("2026-10-01");
    expect(nextDate("2026-12-31")).toBe("2027-01-01");
    expect(nextDate("2028-02-28")).toBe("2028-02-29");
    expect(() => nextDate("26-09-2026")).toThrow(RangeError);
  });
});

describe("scheduleDays", () => {
  it("opens day 1 on the first visit and locks the rest behind it", () => {
    expect(scheduleDays({ attempts: [], unlockedDays: [], today: "2026-09-26" })).toEqual([
      { day: 1, kind: "open" },
      { day: 2, kind: "locked_after", afterDay: 1 },
      { day: 3, kind: "locked_after", afterDay: 2 },
      { day: 4, kind: "locked_after", afterDay: 3 },
    ]);
  });

  it("shows a day's own attempt with its real status", () => {
    const days = scheduleDays({
      attempts: [attempt(1, "evaluated", "2026-09-24T10:00:00Z"), attempt(2, "in_progress")],
      unlockedDays: [],
      today: "2026-09-26",
    });
    expect(days[0]).toEqual({ day: 1, kind: "attempt", status: "evaluated" });
    expect(days[1]).toEqual({ day: 2, kind: "attempt", status: "in_progress" });
    expect(days[2]).toEqual({ day: 3, kind: "locked_after", afterDay: 2 });
  });

  it("opens day N on the Tashkent day after day N−1 was submitted, not before", () => {
    // Submitted at 23:59:59 in Tashkent on the 26th.
    const lateEvening = [attempt(1, "submitted", "2026-09-26T18:59:59.000Z")];
    expect(scheduleDay({ attempts: lateEvening, unlockedDays: [], today: "2026-09-26" }, 2)).toEqual({
      day: 2,
      kind: "locked_until",
      opensOn: "2026-09-27",
    });
    expect(scheduleDay({ attempts: lateEvening, unlockedDays: [], today: "2026-09-27" }, 2)).toEqual({ day: 2, kind: "open" });

    // Submitted at 00:00 in Tashkent on the 27th: it waits for the 28th.
    const pastMidnight = [attempt(1, "submitted", "2026-09-26T19:00:00.000Z")];
    expect(scheduleDay({ attempts: pastMidnight, unlockedDays: [], today: "2026-09-27" }, 2)).toEqual({
      day: 2,
      kind: "locked_until",
      opensOn: "2026-09-28",
    });
  });

  it.each(["submitted", "evaluating", "evaluated", "eval_failed"] as const)(
    "counts a %s day as submitted for the pace",
    (status) => {
      expect(
        scheduleDay({ attempts: [attempt(1, status, "2026-09-20T08:00:00Z")], unlockedDays: [], today: "2026-09-26" }, 2)
      ).toEqual({ day: 2, kind: "open" });
    }
  );

  it("keeps day N locked while day N−1 is still being taken", () => {
    expect(scheduleDay({ attempts: [attempt(1, "in_progress")], unlockedDays: [], today: "2026-09-26" }, 2)).toEqual({
      day: 2,
      kind: "locked_after",
      afterDay: 1,
    });
  });

  it("lets an unlock waive the waiting day — never the order", () => {
    const submittedToday = [attempt(1, "submitted", "2026-09-26T05:00:00Z")];
    expect(scheduleDay({ attempts: submittedToday, unlockedDays: [2], today: "2026-09-26" }, 2)).toEqual({ day: 2, kind: "open" });
    // Day 3 is unlocked, but day 2 has not been taken.
    expect(scheduleDay({ attempts: submittedToday, unlockedDays: [2, 3], today: "2026-09-26" }, 3)).toEqual({
      day: 3,
      kind: "locked_after",
      afterDay: 2,
    });
  });

  it("ignores archived attempts: a reset day is open again, and a reset previous day re-locks the next", () => {
    const days = scheduleDays({
      attempts: [attempt(1, "archived", "2026-09-20T05:00:00Z"), attempt(2, "archived", "2026-09-21T05:00:00Z")],
      unlockedDays: [],
      today: "2026-09-26",
    });
    expect(days[0]).toEqual({ day: 1, kind: "open" });
    expect(days[1]).toEqual({ day: 2, kind: "locked_after", afterDay: 1 });

    const retaken = scheduleDays({
      attempts: [attempt(1, "archived", "2026-09-20T05:00:00Z"), attempt(1, "evaluated", "2026-09-22T05:00:00Z")],
      unlockedDays: [],
      today: "2026-09-26",
    });
    expect(retaken[0]).toEqual({ day: 1, kind: "attempt", status: "evaluated" });
    expect(retaken[1]).toEqual({ day: 2, kind: "open" });
  });

  it("refuses a malformed today", () => {
    expect(() => scheduleDays({ attempts: [], unlockedDays: [], today: "26.09.2026" })).toThrow(RangeError);
  });
});
