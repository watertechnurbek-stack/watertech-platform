import { describe, expect, it } from "vitest";
import {
  DEFAULT_DIRECTORY_STATE,
  DIRECTORY_QUERY_MAX_LENGTH,
  RECENT_ACTIVITY_DAYS,
  buildDirectory,
  buildSearchKeys,
  dayAt,
  directorySearch,
  directorySummary,
  filterPeople,
  parseDirectoryState,
  roleCounts,
  searchTerms,
  sortPeople,
  type DirectoryPerson,
  type DirectoryState,
} from "@/lib/admin/directory";
import type { PersonDayPoint, PersonOverview } from "@/lib/admin/people";
import type { AdminUser } from "@/lib/admin/users";

// The directory's whole client-side brain: the join with the overview, the
// summary strip, the URL state, search, and the four sort orders. Pure, so it
// is pinned here without rendering PeopleDirectory.

const DAYS = Array.from({ length: 14 }, (_, i) => `2026-09-${String(11 + i).padStart(2, "0")}`);

function daily(active: Record<string, number> = {}): PersonDayPoint[] {
  return DAYS.map((day) => ({ day, activeMs: active[day] ?? 0, events: active[day] ? 5 : 0 }));
}

function user(email: string, over: Partial<AdminUser> = {}): AdminUser {
  return {
    email,
    fullName: null,
    role: "operator",
    isActive: true,
    lastActivityAt: null,
    addedAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    updatedBy: null,
    ...over,
  };
}

function overview(email: string, over: Partial<PersonOverview> = {}): PersonOverview {
  return {
    email,
    fullName: null,
    role: "operator",
    isActive: true,
    addedAt: "2026-08-01T00:00:00.000Z",
    firstSeenAt: null,
    lastSeenAt: null,
    activeMs: 0,
    activeDays: 0,
    sessions: 0,
    contentViews: 0,
    copies: 0,
    searches: 0,
    zeroResultSearches: 0,
    copilotAsks: 0,
    callsLogged: 0,
    checklistCompleted: 0,
    daily: daily(),
    ...over,
  };
}

function person(email: string, over: Partial<DirectoryPerson> = {}): DirectoryPerson {
  return { ...user(email), stats: null, activeRecently: null, onboarding: null, ...over };
}

describe("buildDirectory", () => {
  it("joins the overview onto the allow-list by email and keeps the allow-list's rows", () => {
    const people = buildDirectory(
      [user("ali@gmail.com", { fullName: "Ali Valiyev" }), user("new@gmail.com")],
      [overview("ali@gmail.com", { activeMs: 90_000, activeDays: 2, daily: daily({ "2026-09-24": 60_000 }) })],
      null
    );

    expect(people.map((p) => p.email)).toEqual(["ali@gmail.com", "new@gmail.com"]);
    expect(people[0]?.stats).toEqual({
      activeMs: 90_000,
      activeDays: 2,
      dailyMs: DAYS.map((day) => (day === "2026-09-24" ? 60_000 : 0)),
    });
    // Just added: a row before a single event, with no numbers to show.
    expect(people[1]).toMatchObject({ email: "new@gmail.com", stats: null, activeRecently: null });
  });

  it("sends one number per day — no dates, no event counts — and the days are recoverable", () => {
    const [ali] = buildDirectory(
      [user("ali@gmail.com")],
      [overview("ali@gmail.com", { daily: daily({ "2026-09-24": 1 }) })],
      null
    );
    expect(ali?.stats?.dailyMs).toHaveLength(14);
    expect(ali?.stats?.dailyMs.every((ms) => typeof ms === "number")).toBe(true);
    expect(DAYS.map((_, index) => dayAt("2026-09-11", index))).toEqual(DAYS);
  });

  it("counts days from the window start across month and year boundaries", () => {
    expect(dayAt("2026-09-27", 0)).toBe("2026-09-27");
    expect(dayAt("2026-09-27", 4)).toBe("2026-10-01");
    expect(dayAt("2026-12-30", 3)).toBe("2027-01-02");
  });

  it("prefers the overview's newest event over the allow-list's own", () => {
    const [ali] = buildDirectory(
      [user("ali@gmail.com", { lastActivityAt: "2026-09-01T00:00:00.000Z" })],
      [overview("ali@gmail.com", { lastSeenAt: "2026-09-24T08:00:00.000Z" })],
      null
    );
    expect(ali?.lastActivityAt).toBe("2026-09-24T08:00:00.000Z");

    const [never] = buildDirectory(
      [user("b@gmail.com", { lastActivityAt: "2026-09-01T00:00:00.000Z" })],
      [overview("b@gmail.com", { lastSeenAt: null })],
      null
    );
    expect(never?.lastActivityAt).toBe("2026-09-01T00:00:00.000Z");
  });

  it("marks a person active only for events in the newest RECENT_ACTIVITY_DAYS days", () => {
    expect(RECENT_ACTIVITY_DAYS).toBe(7);
    const [old, recent] = buildDirectory(
      [user("old@gmail.com"), user("recent@gmail.com")],
      [
        // 2026-09-17 is the 7th day from the end of the 14-day window (the 8th newest).
        overview("old@gmail.com", { daily: daily({ "2026-09-17": 60_000 }) }),
        overview("recent@gmail.com", { daily: daily({ "2026-09-18": 60_000 }) }),
      ],
      null
    );
    expect(old?.activeRecently).toBe(false);
    expect(recent?.activeRecently).toBe(true);
  });

  it("never gives the admin numbers — telemetry is not recorded for that role", () => {
    const [admin] = buildDirectory(
      [user("owner@gmail.com", { role: "admin" })],
      [overview("owner@gmail.com", { role: "admin", activeMs: 5_000, activeDays: 1 })],
      null
    );
    expect(admin).toMatchObject({ stats: null, activeRecently: null });
  });

  it("joins onboarding progress by email — never for the admin, never made up", () => {
    const people = buildDirectory(
      [user("ali@gmail.com"), user("new@gmail.com"), user("owner@gmail.com", { role: "admin" })],
      [overview("ali@gmail.com")],
      [
        { email: "ali@gmail.com", completed: 7, total: 20, updatedAtIso: "2026-09-20T08:00:00.000Z" },
        { email: "owner@gmail.com", completed: 20, total: 20, updatedAtIso: null },
      ]
    );
    expect(people.map((p) => p.onboarding)).toEqual([{ completed: 7, total: 20 }, null, null]);
  });

  it("keeps onboarding progress when the overview failed, and drops it when its own read failed", () => {
    const progress = [{ email: "a@gmail.com", completed: 3, total: 20, updatedAtIso: null }];
    expect(buildDirectory([user("a@gmail.com")], null, progress)[0]).toMatchObject({
      stats: null,
      onboarding: { completed: 3, total: 20 },
    });
    expect(buildDirectory([user("a@gmail.com")], [overview("a@gmail.com")], null)[0]?.onboarding).toBeNull();
  });

  it("degrades to no numbers at all when the overview could not be read", () => {
    const people = buildDirectory([user("a@gmail.com"), user("b@gmail.com")], null, null);
    expect(people.every((p) => p.stats === null && p.activeRecently === null)).toBe(true);
  });
});

describe("directorySummary", () => {
  it("counts operators and managers, and splits them by recent activity", () => {
    const summary = directorySummary([
      person("o1@gmail.com", { stats: { activeMs: 1, activeDays: 1, dailyMs: [] }, activeRecently: true }),
      person("o2@gmail.com", { stats: { activeMs: 0, activeDays: 0, dailyMs: [] }, activeRecently: false }),
      person("m1@gmail.com", { role: "manager", stats: { activeMs: 1, activeDays: 1, dailyMs: [] }, activeRecently: true }),
      person("owner@gmail.com", { role: "admin" }),
    ]);
    // The admin is on the list, not in the count.
    expect(summary).toEqual({ total: 3, operators: 2, managers: 1, active: 2, inactive: 1 });
  });

  it("does not guess when someone's stats are unavailable", () => {
    const summary = directorySummary([
      person("o1@gmail.com", { stats: { activeMs: 1, activeDays: 1, dailyMs: [] }, activeRecently: true }),
      person("o2@gmail.com"),
    ]);
    expect(summary).toMatchObject({ total: 2, active: null, inactive: null });
  });

  it("is all zeros when only the admin exists", () => {
    expect(directorySummary([person("owner@gmail.com", { role: "admin" })])).toEqual({
      total: 0,
      operators: 0,
      managers: 0,
      active: 0,
      inactive: 0,
    });
  });
});

describe("parseDirectoryState / directorySearch", () => {
  it("defaults when the URL says nothing", () => {
    expect(parseDirectoryState({})).toEqual(DEFAULT_DIRECTORY_STATE);
    expect(directorySearch(DEFAULT_DIRECTORY_STATE)).toBe("");
  });

  it("reads every field", () => {
    expect(parseDirectoryState({ role: "manager", q: " ali ", sort: "name", view: "table" })).toEqual({
      role: "manager",
      query: "ali",
      sort: "name",
      view: "table",
    });
  });

  it("keeps the good fields when one is invalid", () => {
    expect(parseDirectoryState({ role: "owner", q: "ali", sort: "bogus", view: "table" })).toEqual({
      role: "all",
      query: "ali",
      sort: "activity",
      view: "table",
    });
  });

  it("takes the first of a repeated parameter", () => {
    expect(parseDirectoryState({ role: ["operator", "admin"], q: ["a", "b"] })).toMatchObject({ role: "operator", query: "a" });
  });

  it("caps an over-long query instead of dropping it", () => {
    const parsed = parseDirectoryState({ q: "x".repeat(DIRECTORY_QUERY_MAX_LENGTH + 30) });
    expect(parsed.query).toHaveLength(DIRECTORY_QUERY_MAX_LENGTH);
  });

  it("writes only what differs from the defaults, and reads it back", () => {
    const state: DirectoryState = { role: "operator", query: "o'ral valiyev", sort: "time", view: "cards" };
    const search = directorySearch(state);
    expect(search).toBe("?role=operator&q=o%27ral+valiyev&sort=time");
    const params = Object.fromEntries(new URLSearchParams(search));
    expect(parseDirectoryState(params)).toEqual(state);
  });
});

describe("search", () => {
  const people = [
    person("ali.valiyev@gmail.com", { fullName: "Ali Valiyev" }),
    person("oral@gmail.com", { fullName: "O'ral Karimov", role: "manager" }),
    person("nurbek@gmail.com", { fullName: "Нурбек Юсупов" }),
    person("owner@gmail.com", { role: "admin" }),
  ];
  const keys = buildSearchKeys(people);
  const find = (query: string, role: "all" | "operator" | "manager" | "admin" = "all") =>
    filterPeople(people, role, searchTerms(query), keys).map((p) => p.email);

  it("matches name or gmail, in any case", () => {
    expect(find("ALI")).toEqual(["ali.valiyev@gmail.com"]);
    expect(find("valiyev@gmail")).toEqual(["ali.valiyev@gmail.com"]);
    expect(find("OWNER")).toEqual(["owner@gmail.com"]);
  });

  it("ignores every apostrophe glyph", () => {
    for (const query of ["oral", "o'ral", "o‘ral", "o’ral", "oʻral", "o`ral"]) {
      expect(find(query)).toEqual(["oral@gmail.com"]);
    }
  });

  it("finds a Cyrillic name from a Latin query and the other way round", () => {
    expect(find("nurbek")).toEqual(["nurbek@gmail.com"]);
    expect(find("Нурбек")).toEqual(["nurbek@gmail.com"]);
  });

  it("needs every word, in any order", () => {
    expect(find("valiyev ali")).toEqual(["ali.valiyev@gmail.com"]);
    expect(find("ali karimov")).toEqual([]);
  });

  it("shows everyone for an empty or blank query", () => {
    expect(find("")).toHaveLength(4);
    expect(find("   ")).toHaveLength(4);
  });

  it("filters by role, and counts each tab for the same search", () => {
    expect(find("", "manager")).toEqual(["oral@gmail.com"]);
    expect(find("", "admin")).toEqual(["owner@gmail.com"]);
    expect(roleCounts(people, [], keys)).toEqual({ all: 4, operator: 2, manager: 1, admin: 1 });
    expect(roleCounts(people, searchTerms("karimov"), keys)).toEqual({ all: 1, operator: 0, manager: 1, admin: 0 });
  });
});

describe("sortPeople", () => {
  const stats = (activeMs: number) => ({ activeMs, activeDays: 1, dailyMs: [] });
  const people = [
    person("b@gmail.com", { fullName: "Bobur", lastActivityAt: "2026-09-20T00:00:00.000Z", stats: stats(10), addedAt: "2026-08-03T00:00:00.000Z" }),
    person("a@gmail.com", { fullName: "Aziza", lastActivityAt: "2026-09-24T00:00:00.000Z", stats: stats(30), addedAt: "2026-08-01T00:00:00.000Z" }),
    person("c@gmail.com", { fullName: null, lastActivityAt: null, stats: stats(30), addedAt: "2026-08-02T00:00:00.000Z" }),
    person("owner@gmail.com", { role: "admin", fullName: "Zafar", lastActivityAt: null, addedAt: "2026-07-01T00:00:00.000Z" }),
  ];
  const order = (sort: Parameters<typeof sortPeople>[1]) => sortPeople(people, sort).map((p) => p.email);

  it("activity: newest first, people never seen last", () => {
    expect(order("activity")).toEqual(["a@gmail.com", "b@gmail.com", "c@gmail.com", "owner@gmail.com"]);
  });

  it("time: most active time first, equal times by name, no stats last", () => {
    expect(order("time")).toEqual(["a@gmail.com", "c@gmail.com", "b@gmail.com", "owner@gmail.com"]);
  });

  it("name: A to Z by the name shown, the gmail where there is none", () => {
    expect(order("name")).toEqual(["a@gmail.com", "b@gmail.com", "c@gmail.com", "owner@gmail.com"]);
  });

  it("added: newest first", () => {
    expect(order("added")).toEqual(["b@gmail.com", "c@gmail.com", "a@gmail.com", "owner@gmail.com"]);
  });

  it("returns a new array and leaves the input alone", () => {
    const before = people.map((p) => p.email);
    const sorted = sortPeople(people, "name");
    expect(sorted).not.toBe(people);
    expect(people.map((p) => p.email)).toEqual(before);
  });
});
