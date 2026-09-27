import { z } from "zod";
import { normalizeSearchText } from "@/lib/search/normalize";
import { percentChange } from "@/lib/admin/people";
import type { UnansweredQuestion } from "@/lib/dashboard/copilot";
import type { DashboardTableName } from "@/lib/dashboard/content-health";
import type { ZeroResultQueryGroup } from "@/lib/dashboard/quality";

// "Bilim sifati" (/admin/knowledge, S03): is the knowledge base answering the
// operators' questions? Pure and client-safe — the page's reads are the
// existing dashboard functions; this merges and totals them.
// tests/unit/admin/knowledge.test.ts pins it.

export const KNOWLEDGE_PATH = "/admin/knowledge";

/** The page's sections, in page order — each is the `id` of its card, so a
 * link can land on it (the overview's links, next.config.js's redirects from
 * the retired /dashboard tabs; tests/unit/security/monitoring-redirects.test.ts
 * checks those against this list). */
export const KNOWLEDGE_SECTIONS = ["gaps", "feedback", "health", "usage", "copilot"] as const;
export type KnowledgeSection = (typeof KNOWLEDGE_SECTIONS)[number];

/** A link to the knowledge page: `search` carries the range ("" or
 * "from=…&to=…", rangeSearchParams), `extra` sets further params, `section` is
 * the card it lands on. */
export function knowledgeHref(
  search: string,
  section?: KnowledgeSection,
  extra: Readonly<Record<string, string>> = {}
): string {
  const params = new URLSearchParams(search);
  for (const [key, value] of Object.entries(extra)) params.set(key, value);
  const query = params.toString();
  return `${KNOWLEDGE_PATH}${query ? `?${query}` : ""}${section ? `#${section}` : ""}`;
}

// --- Content health segments ------------------------------------------------------------

export const HEALTH_SEGMENTS = ["drafts", "stale", "missingRu"] as const;
export type HealthSegment = (typeof HEALTH_SEGMENTS)[number];

const healthSegmentSchema = z.enum(HEALTH_SEGMENTS).catch("drafts");

/** `?health=` — which list the content-health card opens on; anything else is
 * "drafts". */
export function parseHealthSegment(value: string | string[] | undefined): HealthSegment {
  return healthSegmentSchema.parse(Array.isArray(value) ? value[0] : value);
}

/** The `admin.nav.items` label of the section a health row's table belongs to. */
export const HEALTH_TABLE_LABEL: Readonly<Record<DashboardTableName, string>> = {
  content_scripts: "scripts",
  content_objections: "objections",
  content_faqs: "faq",
  content_competitors: "competitors",
  content_package_groups: "packages",
  content_packages: "packages",
  content_products: "products",
  content_changelog: "changelog",
  content_contacts: "contacts",
  content_sops: "sops",
};

// --- Unanswered questions ---------------------------------------------------------------

export type GapSource = "search" | "copilot";

/** One question the knowledge base had no answer for — the zero-result
 * searches and the questions Copilot found nothing for, as one list. */
export interface KnowledgeGap {
  /** normalizeSearchText of the wording: what the two sources are matched on,
   * and the React key. */
  key: string;
  /** The most recent wording, as it was searched or asked. */
  text: string;
  /** searches + copilot. */
  total: number;
  /** Searches that found nothing. */
  searches: number;
  /** Copilot requests answered with "nothing found". */
  copilot: number;
  /** Distinct people who asked Copilot — at least this many when several of
   * its groups fold into one wording. A search row does not say who searched,
   * so null for a gap only search saw. */
  copilotPeople: number | null;
  lastSeenIso: string;
}

/** How many gaps the card lists before "Hammasi". */
export const GAPS_VISIBLE = 15;

/** Rows of the "most used materials" card (admin_top_content takes 1-100). */
export const USAGE_LIMIT = 20;

function later(a: string, b: string): boolean {
  return Date.parse(a) > Date.parse(b);
}

/**
 * Zero-result searches and unanswered Copilot questions, merged on their
 * normalized wording (case, apostrophes, Cyrillic — normalizeSearchText), so
 * "Kafolat muddati" searched twice and "kafolat muddati?" asked three times is
 * one row of five with both sources. Most asked first; ties by the newest,
 * then by wording. A wording that normalizes to nothing is dropped.
 */
export function mergeKnowledgeGaps(
  searches: readonly ZeroResultQueryGroup[],
  copilot: readonly UnansweredQuestion[]
): KnowledgeGap[] {
  const byKey = new Map<string, KnowledgeGap>();

  function add(text: string, lastSeenIso: string, source: GapSource, count: number, people: number | null): void {
    const key = normalizeSearchText(text.replace(/[?!.,;:]+/g, " "));
    if (key === "" || count <= 0) return;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, {
        key,
        text: text.trim(),
        total: count,
        searches: source === "search" ? count : 0,
        copilot: source === "copilot" ? count : 0,
        copilotPeople: people,
        lastSeenIso,
      });
      return;
    }
    existing.total += count;
    if (source === "search") existing.searches += count;
    else existing.copilot += count;
    if (people !== null) existing.copilotPeople = Math.max(existing.copilotPeople ?? 0, people);
    if (later(lastSeenIso, existing.lastSeenIso)) {
      existing.lastSeenIso = lastSeenIso;
      existing.text = text.trim();
    }
  }

  for (const row of searches) add(row.query, row.lastSeenIso, "search", row.count, null);
  for (const row of copilot) add(row.question, row.lastAskedIso, "copilot", row.count, row.operatorCount);

  return [...byKey.values()].sort(
    (a, b) =>
      b.total - a.total ||
      Date.parse(b.lastSeenIso) - Date.parse(a.lastSeenIso) ||
      (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)
  );
}

// --- The overview's "knowledge gaps" number -------------------------------------------------

/** One window's gap counts; null where that source could not be read. */
export interface GapParts {
  searches: number | null;
  feedback: number | null;
  copilot: number | null;
}

export interface GapKpi {
  /** Zero-result searches + "not helpful" marks + unanswered Copilot requests. */
  total: number;
  searches: number;
  feedback: number;
  copilot: number;
  /** % change of the total against the previous window; null when any part
   * of it is unknown or it was 0. Up is worse here. */
  delta: number | null;
}

/** The overview's fourth StatCard. null when any current part is unknown — a
 * sum of the parts that happened to load would read as fewer gaps. */
export function gapKpi(current: GapParts, previous: GapParts): GapKpi | null {
  const { searches, feedback, copilot } = current;
  if (searches === null || feedback === null || copilot === null) return null;
  const total = searches + feedback + copilot;
  const previousTotal =
    previous.searches === null || previous.feedback === null || previous.copilot === null
      ? null
      : previous.searches + previous.feedback + previous.copilot;
  return {
    total,
    searches,
    feedback,
    copilot,
    delta: previousTotal === null ? null : percentChange(total, previousTotal),
  };
}

/** Sum of a ranked list's counts (e.g. every "not helpful" mark over its pages). */
export function sumCounts(rows: readonly { count: number }[]): number {
  return rows.reduce((total, row) => total + row.count, 0);
}
