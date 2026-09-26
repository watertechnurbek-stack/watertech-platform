import { displayName, personPath, type PersonOverview } from "@/lib/admin/people";
import { knowledgeHref } from "@/lib/admin/knowledge";
import { faqPrefillHref } from "@/lib/dashboard/copilot";
import { tashkentDayOf } from "@/lib/telemetry/aggregate";

// The overview's "Diqqat talab qiladi" list (/admin, S03): what the admin
// should act on now, each as one sentence and exactly one action link. Pure —
// the page reads the sources, this decides which of them become items, how
// severe each is and in what order they stand; tests/unit/admin/attention.test.ts
// pins every kind, threshold and tie.
//
// The component (components/admin/AttentionList.tsx) knows no kind: it renders
// `pages.admin.overview.attention.items.<kind>.text` with the item's `values`,
// `….action` as the link's label and `severity` as a dot and a word. So a new
// kind (S07: assessment_low, assessment_needs_review, assessment_eval_failed)
// is a member of the AttentionItem union, an entry in KIND_ORDER and
// ATTENTION_THRESHOLDS, an input field with its detector below, and its two
// messages in both files — the component is not touched.

export const ATTENTION_SEVERITIES = ["high", "medium", "low"] as const;
export type AttentionSeverity = (typeof ATTENTION_SEVERITIES)[number];

/** ICU arguments of an item's sentence. */
type AttentionValues = Readonly<Record<string, string | number>>;

interface AttentionItemOf<K extends string, V extends AttentionValues> {
  readonly kind: K;
  /** Unique within one list — the React key. */
  readonly key: string;
  readonly severity: AttentionSeverity;
  /** How big the problem is, in the kind's own unit (idle working days,
   * searches, rows): ranks the items of one severity, largest first. */
  readonly count: number;
  /** The arguments of `attention.items.<kind>.text`. */
  readonly values: V;
  /** The one action; `attention.items.<kind>.action` is its label. */
  readonly href: string;
}

export type AttentionItem =
  | AttentionItemOf<"publish_blocked", { count: number }>
  | AttentionItemOf<"inactive_person", { name: string; days: number; never: "yes" | "no" }>
  | AttentionItemOf<"zero_result_top", { query: string; count: number }>
  | AttentionItemOf<"copilot_unanswered", { count: number }>
  | AttentionItemOf<"not_helpful", { count: number; pages: number }>
  | AttentionItemOf<"drafts_waiting", { count: number }>
  | AttentionItemOf<"stale_content", { count: number; days: number }>;

export type AttentionKind = AttentionItem["kind"];

/** Which kind goes first when severity and count tie. A Record, so a kind
 * added to the union without a place here does not compile. */
const KIND_ORDER: Readonly<Record<AttentionKind, number>> = {
  publish_blocked: 0,
  inactive_person: 1,
  zero_result_top: 2,
  copilot_unanswered: 3,
  not_helpful: 4,
  drafts_waiting: 5,
  stale_content: 6,
};

function isAttentionKind(value: string): value is AttentionKind {
  return Object.prototype.hasOwnProperty.call(KIND_ORDER, value);
}

/** Every kind, in tie-break order — what the message test walks. */
export const ATTENTION_KINDS: readonly AttentionKind[] = Object.keys(KIND_ORDER)
  .filter(isAttentionKind)
  .sort((a, b) => KIND_ORDER[a] - KIND_ORDER[b]);

const SEVERITY_ORDER: Readonly<Record<AttentionSeverity, number>> = { high: 0, medium: 1, low: 2 };

/** How many items the list shows before "Hammasi". */
export const ATTENTION_VISIBLE_ITEMS = 6;

// --- Thresholds ---------------------------------------------------------------------

export interface SeverityThresholds {
  readonly low?: number;
  readonly medium?: number;
  readonly high?: number;
}

/** The smallest count at which each kind reaches each severity; below the
 * lowest one listed the kind is not an item at all. */
export const ATTENTION_THRESHOLDS = {
  /** A refused publish is content the admin meant to be live and is not. */
  publishBlocked: { high: 1 },
  /** Working days (WORKING_WEEKDAYS) without any event. */
  inactivePerson: { medium: 3, high: 5 },
  /** Times the most frequent zero-result search was repeated — a one-off typo is not a gap. */
  zeroResultTop: { medium: 3, high: 10 },
  /** Copilot requests answered with "nothing found". */
  copilotUnanswered: { low: 1, medium: 3, high: 10 },
  /** "Not helpful" marks, over all pages. */
  notHelpful: { low: 1, medium: 5 },
  draftsWaiting: { low: 1, medium: 10 },
  staleContent: { low: 1, medium: 10 },
} as const satisfies Readonly<Record<string, SeverityThresholds>>;

/** The highest severity `count` reaches, or null below every threshold. */
export function severityFor(count: number, thresholds: SeverityThresholds): AttentionSeverity | null {
  if (thresholds.high !== undefined && count >= thresholds.high) return "high";
  if (thresholds.medium !== undefined && count >= thresholds.medium) return "medium";
  if (thresholds.low !== undefined && count >= thresholds.low) return "low";
  return null;
}

// --- Working days in Tashkent ---------------------------------------------------------

/** Monday–Friday (getUTCDay numbering) — Uzbekistan's standard five-day week.
 * A quiet Saturday or Sunday never counts towards "inactive"; public holidays
 * are not known here and do count. */
export const WORKING_WEEKDAYS: ReadonlySet<number> = new Set([1, 2, 3, 4, 5]);

const DAY_MS = 86_400_000;

/** Working days strictly between two Tashkent dates (YYYY-MM-DD): neither the
 * day of the last activity nor today — still under way — counts. 0 when `to`
 * is not at least two days after `from`, or either date is unreadable. */
export function workingDaysBetween(from: string, to: string): number {
  const start = Date.parse(`${from}T00:00:00.000Z`);
  const end = Date.parse(`${to}T00:00:00.000Z`);
  if (Number.isNaN(start) || Number.isNaN(end)) return 0;
  const between = Math.round((end - start) / DAY_MS) - 1;
  if (between <= 0) return 0;
  // Every run of seven consecutive days holds each weekday once.
  const firstWeekday = new Date(start + DAY_MS).getUTCDay();
  let count = Math.floor(between / 7) * WORKING_WEEKDAYS.size;
  for (let offset = 0; offset < between % 7; offset += 1) {
    if (WORKING_WEEKDAYS.has((firstWeekday + offset) % 7)) count += 1;
  }
  return count;
}

// --- Input ----------------------------------------------------------------------------

export type AttentionPerson = Pick<PersonOverview, "email" | "fullName" | "role" | "isActive" | "addedAt" | "lastSeenAt">;

/** What the list is built from. Every source is null when its read failed: it
 * then contributes no item — never a zero that reads as "all fine" or a list of
 * everyone as idle — and attentionSkippedSources names it, so the list can say
 * it is incomplete. */
export interface AttentionInput {
  /** Today in Tashkent (YYYY-MM-DD) — a parameter so a test can pin it. */
  today: string;
  /** The allow-list with each person's last event (admin_people_overview:
   * lastSeenAt is over all retained telemetry, not the page's range). */
  people: readonly AttentionPerson[] | null;
  /** Content health (lib/dashboard/content-health.ts): totals, and the age
   * after which published content counts as stale. */
  content: { draftsTotal: number; staleTotal: number; staleDays: number } | null;
  /** Unread "gate_blocked" notifications. */
  unreadGateBlocked: number | null;
  /** Zero-result searches of the range, any order. */
  zeroResultSearches: readonly { query: string; count: number }[] | null;
  /** Copilot requests of the range it answered with "nothing found". */
  copilotUnanswered: number | null;
  /** "Not helpful" marks of the range, per page. */
  notHelpful: readonly { path: string; count: number }[] | null;
  /** The query (from/to) links to the knowledge page carry, so it opens on
   * the overview's range — "" when that is the default (rangeSearchParams). */
  knowledgeSearch: string;
}

export const ATTENTION_SOURCES = ["people", "content", "notifications", "searches", "copilot", "feedback"] as const;
export type AttentionSource = (typeof ATTENTION_SOURCES)[number];

/** The sources whose read failed, in ATTENTION_SOURCES order. */
export function attentionSkippedSources(input: AttentionInput): AttentionSource[] {
  const failed: Readonly<Record<AttentionSource, boolean>> = {
    people: input.people === null,
    content: input.content === null,
    notifications: input.unreadGateBlocked === null,
    searches: input.zeroResultSearches === null,
    copilot: input.copilotUnanswered === null,
    feedback: input.notHelpful === null,
  };
  return ATTENTION_SOURCES.filter((source) => failed[source]);
}

// --- Detectors ------------------------------------------------------------------------

function publishBlocked({ unreadGateBlocked }: AttentionInput): AttentionItem[] {
  if (unreadGateBlocked === null) return [];
  const severity = severityFor(unreadGateBlocked, ATTENTION_THRESHOLDS.publishBlocked);
  if (!severity) return [];
  return [
    {
      kind: "publish_blocked",
      key: "publish_blocked",
      severity,
      count: unreadGateBlocked,
      values: { count: unreadGateBlocked },
      href: "/admin/notifications?unread=1",
    },
  ];
}

/** An active operator or sales manager with no event for the threshold's
 * working days — counted from their last event, or from when they were added
 * if they have none (retained telemetry is 180 days, so "none" also covers an
 * activity older than that). The admin is never measured (CLAUDE.md §9), and a
 * deactivated account cannot sign in, so neither is an item. */
function inactivePeople({ people, today }: AttentionInput): AttentionItem[] {
  if (people === null) return [];
  return people.flatMap((person): AttentionItem[] => {
    if (person.role === "admin" || !person.isActive) return [];
    const since = tashkentDayOf(person.lastSeenAt ?? person.addedAt);
    if (since === null) return [];
    const days = workingDaysBetween(since, today);
    const severity = severityFor(days, ATTENTION_THRESHOLDS.inactivePerson);
    if (!severity) return [];
    return [
      {
        kind: "inactive_person",
        key: `inactive_person:${person.email}`,
        severity,
        count: days,
        values: { name: displayName(person), days, never: person.lastSeenAt === null ? "yes" : "no" },
        href: personPath(person.email),
      },
    ];
  });
}

/** The most repeated search that found nothing; the action opens the FAQ form
 * with it pre-filled — where an answer to a question belongs. */
function zeroResultTop({ zeroResultSearches }: AttentionInput): AttentionItem[] {
  if (zeroResultSearches === null) return [];
  const top = zeroResultSearches.reduce<{ query: string; count: number } | null>(
    (best, row) => (row.query.trim() !== "" && (best === null || row.count > best.count) ? row : best),
    null
  );
  if (top === null) return [];
  const severity = severityFor(top.count, ATTENTION_THRESHOLDS.zeroResultTop);
  if (!severity) return [];
  const query = top.query.trim();
  return [
    {
      kind: "zero_result_top",
      key: "zero_result_top",
      severity,
      count: top.count,
      values: { query, count: top.count },
      href: faqPrefillHref(query),
    },
  ];
}

function copilotUnanswered({ copilotUnanswered: count, knowledgeSearch }: AttentionInput): AttentionItem[] {
  if (count === null) return [];
  const severity = severityFor(count, ATTENTION_THRESHOLDS.copilotUnanswered);
  if (!severity) return [];
  return [
    {
      kind: "copilot_unanswered",
      key: "copilot_unanswered",
      severity,
      count,
      values: { count },
      href: knowledgeHref(knowledgeSearch, "gaps"),
    },
  ];
}

function notHelpful({ notHelpful: rows, knowledgeSearch }: AttentionInput): AttentionItem[] {
  if (rows === null) return [];
  const marked = rows.filter((row) => row.count > 0);
  const count = marked.reduce((total, row) => total + row.count, 0);
  const severity = severityFor(count, ATTENTION_THRESHOLDS.notHelpful);
  if (!severity) return [];
  return [
    {
      kind: "not_helpful",
      key: "not_helpful",
      severity,
      count,
      values: { count, pages: marked.length },
      href: knowledgeHref(knowledgeSearch, "feedback"),
    },
  ];
}

function contentItems({ content, knowledgeSearch }: AttentionInput): AttentionItem[] {
  if (content === null) return [];
  const items: AttentionItem[] = [];
  const drafts = severityFor(content.draftsTotal, ATTENTION_THRESHOLDS.draftsWaiting);
  if (drafts) {
    items.push({
      kind: "drafts_waiting",
      key: "drafts_waiting",
      severity: drafts,
      count: content.draftsTotal,
      values: { count: content.draftsTotal },
      href: knowledgeHref(knowledgeSearch, "health", { health: "drafts" }),
    });
  }
  const stale = severityFor(content.staleTotal, ATTENTION_THRESHOLDS.staleContent);
  if (stale) {
    items.push({
      kind: "stale_content",
      key: "stale_content",
      severity: stale,
      count: content.staleTotal,
      values: { count: content.staleTotal, days: content.staleDays },
      href: knowledgeHref(knowledgeSearch, "health", { health: "stale" }),
    });
  }
  return items;
}

const DETECTORS: readonly ((input: AttentionInput) => AttentionItem[])[] = [
  publishBlocked,
  inactivePeople,
  zeroResultTop,
  copilotUnanswered,
  notHelpful,
  contentItems,
];

// --- Ranking --------------------------------------------------------------------------

/** Severity first (high → low), then the larger count, then KIND_ORDER, then
 * the key — a total order, so the list never reshuffles between renders. */
export function rankAttentionItems(items: readonly AttentionItem[]): AttentionItem[] {
  return [...items].sort(
    (a, b) =>
      SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
      b.count - a.count ||
      KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
      (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)
  );
}

/** Every item the sources call for, ranked (rankAttentionItems). Empty when
 * nothing needs the admin — or when every source failed, which
 * attentionSkippedSources tells apart. */
export function buildAttentionItems(input: AttentionInput): AttentionItem[] {
  return rankAttentionItems(DETECTORS.flatMap((detect) => detect(input)));
}
