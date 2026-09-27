import { z } from "zod";
import { normalizeSearchText } from "@/lib/search/normalize";
import { USER_ROLES, type AdminUser } from "@/lib/admin/users";
import { displayName, type PersonOverview } from "@/lib/admin/people";
import type { OnboardingProgressRow } from "@/lib/dashboard/quality";

// The people directory's own logic (/admin/users, R3/S04): joining the
// allow-list with the 0021 overview and the onboarding checklist progress
// (S03 monitoring IA), the summary strip, and the filter / sort /
// URL state of the cards. Pure and client-safe — PeopleDirectory runs all of it
// in the browser over the full list — so tests/unit/admin/directory.test.ts pins
// it without rendering anything. Nothing here imports overview.ts, which drags
// the onboarding checklist data into a client bundle.

/** How many of the newest days of the overview window count as "recently
 * active" for the summary strip. */
export const RECENT_ACTIVITY_DAYS = 7;

/** The overview window the directory reads, in days — one sparkline column each. */
export const DIRECTORY_WINDOW_DAYS = 14;

// --- The rows -------------------------------------------------------------------------

/** One person's totals over the directory's window. */
export interface DirectoryStats {
  activeMs: number;
  activeDays: number;
  /** Active milliseconds of every day of the window, oldest first — one bare
   * number per day: the days are consecutive, so the page sends the first one
   * once (`windowStart`, `dayAt`) instead of a date per point, and the
   * overview's event count only decides `activeRecently`, computed here. ~200
   * people × 14 days is the biggest part of the directory's payload. */
  dailyMs: number[];
}

function addDays(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** The Tashkent day (YYYY-MM-DD) the `index`th value of `dailyMs` belongs to. */
export function dayAt(windowStart: string, index: number): string {
  return addDays(windowStart, index);
}

/** How far a person is through the onboarding checklist — a running total,
 * not a window: `completed` of its `total` current items. */
export interface OnboardingProgress {
  completed: number;
  total: number;
}

/** One card / table row. An AdminUser — so the table takes the same array —
 * plus the window's stats. Plain data: it crosses the Server → Client boundary. */
export interface DirectoryPerson extends AdminUser {
  /** null when there is nothing to show: the admin (telemetry is never
   * recorded for that role) or an overview that could not be read. */
  stats: DirectoryStats | null;
  /** Any event in the newest RECENT_ACTIVITY_DAYS days of the window; null
   * when stats is null. */
  activeRecently: boolean | null;
  /** null for the admin (no checklist), when the progress could not be read,
   * or for a row the progress read did not cover — never a made-up 0. */
  onboarding: OnboardingProgress | null;
}

/** Operators and sales managers — the roles telemetry records (CLAUDE.md §9). */
export function isTracked(person: Pick<AdminUser, "role">): boolean {
  return person.role !== "admin";
}

/**
 * The allow-list rows joined with the overview and the onboarding progress, by
 * email. The allow-list drives the list — a person added a second ago is a row
 * before they have a single event — and the other two only add numbers: a row
 * the overview lacks (or every row, when its read failed: `overview` null)
 * gets `stats: null`, one the progress lacks (`onboarding` null when that read
 * failed) `onboarding: null` — never zeros that read as idleness. The
 * overview's newest event wins over the allow-list's own "last activity"
 * (both are the newest telemetry event; the overview's is the one the person
 * page shows too).
 */
export function buildDirectory(
  users: readonly AdminUser[],
  overview: readonly PersonOverview[] | null,
  onboarding: readonly OnboardingProgressRow[] | null
): DirectoryPerson[] {
  const byEmail = new Map<string, PersonOverview>((overview ?? []).map((row) => [row.email, row]));
  const progressByEmail = new Map<string, OnboardingProgress>(
    (onboarding ?? []).map((row) => [row.email, { completed: row.completed, total: row.total }])
  );

  return users.map((user) => {
    const progress = (user.role === "admin" ? undefined : progressByEmail.get(user.email)) ?? null;
    const row = user.role === "admin" ? undefined : byEmail.get(user.email);
    if (!row) return { ...user, stats: null, activeRecently: null, onboarding: progress };

    return {
      ...user,
      onboarding: progress,
      lastActivityAt: row.lastSeenAt ?? user.lastActivityAt,
      stats: {
        activeMs: row.activeMs,
        activeDays: row.activeDays,
        dailyMs: row.daily.map((day) => day.activeMs),
      },
      activeRecently: row.daily.slice(-RECENT_ACTIVITY_DAYS).some((day) => day.events > 0),
    };
  });
}

export interface DirectorySummary {
  /** Operators + sales managers. The admin is in the list, not in the count:
   * nothing about them is measured. */
  total: number;
  operators: number;
  managers: number;
  /** With an event in the last RECENT_ACTIVITY_DAYS days; null while any
   * counted person's stats are unavailable (a partial count would mislead). */
  active: number | null;
  /** total − active: nothing in that time. */
  inactive: number | null;
}

export function directorySummary(people: readonly DirectoryPerson[]): DirectorySummary {
  const tracked = people.filter(isTracked);
  const operators = tracked.filter((person) => person.role === "operator").length;
  const known = tracked.every((person) => person.activeRecently !== null);
  const active = known ? tracked.filter((person) => person.activeRecently === true).length : null;
  return {
    total: tracked.length,
    operators,
    managers: tracked.length - operators,
    active,
    inactive: active === null ? null : tracked.length - active,
  };
}

// --- The view state (also the URL) ----------------------------------------------------

export const DIRECTORY_ROLE_TABS = ["all", ...USER_ROLES] as const;
export type DirectoryRoleTab = (typeof DIRECTORY_ROLE_TABS)[number];

export const DIRECTORY_SORTS = ["activity", "time", "name", "added"] as const;
export type DirectorySort = (typeof DIRECTORY_SORTS)[number];

export const DIRECTORY_VIEWS = ["cards", "table"] as const;
export type DirectoryView = (typeof DIRECTORY_VIEWS)[number];

export const DIRECTORY_QUERY_MAX_LENGTH = 120;

export interface DirectoryState {
  role: DirectoryRoleTab;
  query: string;
  sort: DirectorySort;
  view: DirectoryView;
}

export const DEFAULT_DIRECTORY_STATE: DirectoryState = { role: "all", query: "", sort: "activity", view: "cards" };

/** Every field falls back to its default on its own: a hand-edited URL with one
 * bad value keeps the good ones. `q` is trimmed and capped, never rejected. */
const directoryStateSchema = z.object({
  role: z.enum(DIRECTORY_ROLE_TABS).catch(DEFAULT_DIRECTORY_STATE.role),
  q: z
    .string()
    .transform((value) => value.trim().slice(0, DIRECTORY_QUERY_MAX_LENGTH))
    .catch(DEFAULT_DIRECTORY_STATE.query),
  sort: z.enum(DIRECTORY_SORTS).catch(DEFAULT_DIRECTORY_STATE.sort),
  view: z.enum(DIRECTORY_VIEWS).catch(DEFAULT_DIRECTORY_STATE.view),
});

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** The state a URL describes — `?role=&q=&sort=&view=`, any of them missing or
 * invalid. Read on the server for the first paint, so the page a shared link
 * opens is already filtered. */
export function parseDirectoryState(params: Record<string, string | string[] | undefined>): DirectoryState {
  const parsed = directoryStateSchema.parse({
    role: firstValue(params.role),
    q: firstValue(params.q) ?? "",
    sort: firstValue(params.sort),
    view: firstValue(params.view),
  });
  return { role: parsed.role, query: parsed.q, sort: parsed.sort, view: parsed.view };
}

/** "" for the default state, else "?role=operator&q=ali" — only what differs
 * from the defaults, so a clean URL stays clean. */
export function directorySearch(state: DirectoryState): string {
  const params = new URLSearchParams();
  if (state.role !== DEFAULT_DIRECTORY_STATE.role) params.set("role", state.role);
  const query = state.query.trim();
  if (query) params.set("q", query.slice(0, DIRECTORY_QUERY_MAX_LENGTH));
  if (state.sort !== DEFAULT_DIRECTORY_STATE.sort) params.set("sort", state.sort);
  if (state.view !== DEFAULT_DIRECTORY_STATE.view) params.set("view", state.view);
  const text = params.toString();
  return text ? `?${text}` : "";
}

// --- Search, filter, sort --------------------------------------------------------------

/** What a query is matched against: name and email, normalized like the
 * command palette (lowercase, Cyrillic → Latin, every apostrophe glyph gone),
 * so "o'ral" finds "Oral" and "нурбек" finds "Nurbek". Built once per list. */
export function buildSearchKeys(people: readonly Pick<AdminUser, "email" | "fullName">[]): Map<string, string> {
  return new Map(people.map((person) => [person.email, normalizeSearchText(`${person.fullName ?? ""} ${person.email}`)]));
}

/** The query as the words that must all appear — "ali val" matches
 * "Ali Valiyev", in any order of the words, none of them empty. */
export function searchTerms(query: string): string[] {
  const normalized = normalizeSearchText(query);
  return normalized === "" ? [] : normalized.split(" ");
}

function matchesTerms(key: string | undefined, terms: readonly string[]): boolean {
  if (terms.length === 0) return true;
  if (key === undefined) return false;
  return terms.every((term) => key.includes(term));
}

export function filterPeople(
  people: readonly DirectoryPerson[],
  role: DirectoryRoleTab,
  terms: readonly string[],
  keys: ReadonlyMap<string, string>
): DirectoryPerson[] {
  return people.filter(
    (person) => (role === "all" || person.role === role) && matchesTerms(keys.get(person.email), terms)
  );
}

/** How many people each role tab would show for these search terms. */
export function roleCounts(
  people: readonly DirectoryPerson[],
  terms: readonly string[],
  keys: ReadonlyMap<string, string>
): Record<DirectoryRoleTab, number> {
  const counts: Record<DirectoryRoleTab, number> = { all: 0, operator: 0, manager: 0, admin: 0 };
  for (const person of people) {
    if (!matchesTerms(keys.get(person.email), terms)) continue;
    counts.all += 1;
    counts[person.role] += 1;
  }
  return counts;
}

// A fixed, locale-less collation: the list is sorted on the server for the
// first paint and again in the browser, and two ICU builds ordering "uz-UZ"
// differently would be a hydration mismatch.
const NAME_COLLATOR = new Intl.Collator("en", { sensitivity: "base", numeric: true });

function byName(a: DirectoryPerson, b: DirectoryPerson): number {
  return NAME_COLLATOR.compare(displayName(a), displayName(b)) || (a.email < b.email ? -1 : a.email > b.email ? 1 : 0);
}

/** Largest first; "no value" (null) after every real value, in either direction. */
function byNumberDesc(a: number | null, b: number | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return b - a;
}

function timestamp(iso: string | null): number | null {
  if (iso === null) return null;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : ms;
}

/** A new array, in the order the control names: "activity" newest last-seen
 * first, "time" most active time in the window first, "name" A→Z, "added"
 * newest first. Ties fall back to the name, so the order never flickers. */
export function sortPeople(people: readonly DirectoryPerson[], sort: DirectorySort): DirectoryPerson[] {
  const compare = (a: DirectoryPerson, b: DirectoryPerson): number => {
    switch (sort) {
      case "activity":
        return byNumberDesc(timestamp(a.lastActivityAt), timestamp(b.lastActivityAt)) || byName(a, b);
      case "time":
        return byNumberDesc(a.stats?.activeMs ?? null, b.stats?.activeMs ?? null) || byName(a, b);
      case "added":
        return byNumberDesc(timestamp(a.addedAt), timestamp(b.addedAt)) || byName(a, b);
      case "name":
        return byName(a, b);
    }
  };
  return [...people].sort(compare);
}
