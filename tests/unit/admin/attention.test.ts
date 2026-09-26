import { describe, expect, it } from "vitest";
import { createTranslator } from "next-intl";
import ru from "@/messages/ru.json";
import uz from "@/messages/uz.json";
import {
  ATTENTION_KINDS,
  ATTENTION_SEVERITIES,
  ATTENTION_SOURCES,
  ATTENTION_THRESHOLDS,
  ATTENTION_VISIBLE_ITEMS,
  attentionSkippedSources,
  buildAttentionItems,
  rankAttentionItems,
  severityFor,
  workingDaysBetween,
  type AttentionInput,
  type AttentionItem,
  type AttentionPerson,
  type AttentionSeverity,
} from "@/lib/admin/attention";
import { faqPrefillHref } from "@/lib/dashboard/copilot";

// The overview's attention list (S03): which sources become items, how severe,
// in what order — and that a failed source is skipped, never read as zero.

/** A Friday. */
const TODAY = "2026-09-25";

function person(email: string, over: Partial<AttentionPerson> = {}): AttentionPerson {
  return {
    email,
    fullName: null,
    role: "operator",
    isActive: true,
    addedAt: "2026-08-01T05:00:00.000Z",
    lastSeenAt: "2026-09-25T05:00:00.000Z",
    ...over,
  };
}

/** Every source read fine and nothing needs the admin. */
function calm(over: Partial<AttentionInput> = {}): AttentionInput {
  return {
    today: TODAY,
    people: [person("ali@x.uz")],
    content: { draftsTotal: 0, staleTotal: 0, staleDays: 90 },
    unreadGateBlocked: 0,
    zeroResultSearches: [],
    copilotUnanswered: 0,
    notHelpful: [],
    knowledgeSearch: "",
    ...over,
  };
}

function kinds(items: readonly AttentionItem[]): string[] {
  return items.map((item) => item.kind);
}

function only(input: AttentionInput): AttentionItem {
  const items = buildAttentionItems(input);
  expect(items).toHaveLength(1);
  const [item] = items;
  if (!item) throw new Error("no item");
  return item;
}

describe("workingDaysBetween (Monday–Friday, both ends excluded)", () => {
  it("counts only the weekdays strictly between the two dates", () => {
    expect(workingDaysBetween("2026-09-21", "2026-09-25")).toBe(3); // Tue, Wed, Thu
    expect(workingDaysBetween("2026-09-18", "2026-09-24")).toBe(3); // Mon, Tue, Wed — the weekend is free
    expect(workingDaysBetween("2026-09-18", "2026-09-21")).toBe(0); // Fri → Mon: only a weekend between
    expect(workingDaysBetween("2026-09-14", "2026-09-28")).toBe(9); // a full week and a bit
  });

  it("is 0 for the same or the next day, a reversed pair, or garbage", () => {
    expect(workingDaysBetween(TODAY, TODAY)).toBe(0);
    expect(workingDaysBetween("2026-09-24", TODAY)).toBe(0);
    expect(workingDaysBetween(TODAY, "2026-09-01")).toBe(0);
    expect(workingDaysBetween("nope", TODAY)).toBe(0);
  });

  it("counts across a month boundary", () => {
    // Wed 2026-09-30 → Mon 2026-10-05: Thu 1, Fri 2 (Sat, Sun free).
    expect(workingDaysBetween("2026-09-30", "2026-10-05")).toBe(2);
  });
});

describe("severityFor", () => {
  it("takes the highest severity the count reaches, none below the lowest", () => {
    const thresholds = ATTENTION_THRESHOLDS.copilotUnanswered;
    expect(severityFor(0, thresholds)).toBeNull();
    expect(severityFor(1, thresholds)).toBe("low");
    expect(severityFor(2, thresholds)).toBe("low");
    expect(severityFor(3, thresholds)).toBe("medium");
    expect(severityFor(10, thresholds)).toBe("high");
    expect(severityFor(99, { medium: 3 })).toBe("medium");
    expect(severityFor(2, { medium: 3 })).toBeNull();
  });
});

describe("buildAttentionItems — each kind", () => {
  it("names a refused publish as soon as there is one unread notice", () => {
    expect(buildAttentionItems(calm({ unreadGateBlocked: 0 }))).toEqual([]);
    expect(only(calm({ unreadGateBlocked: 2 }))).toEqual({
      kind: "publish_blocked",
      key: "publish_blocked",
      severity: "high",
      count: 2,
      values: { count: 2 },
      href: "/admin/notifications?unread=1",
    });
  });

  it("flags an active operator or manager after 3 idle working days (medium), 5 (high) — in Tashkent days", () => {
    const people = [
      // Last seen Monday afternoon: Tue, Wed, Thu idle.
      person("ali@x.uz", { fullName: "Ali Valiyev", lastSeenAt: "2026-09-21T10:00:00.000Z" }),
      // Last seen Wednesday the week before: six working days.
      person("bek@x.uz", { role: "manager", lastSeenAt: "2026-09-16T10:00:00.000Z" }),
      // 00:30 on Tuesday in Tashkent is still Monday in UTC — Tashkent decides: only Wed, Thu.
      person("tun@x.uz", { lastSeenAt: "2026-09-21T19:30:00.000Z" }),
    ];
    const items = buildAttentionItems(calm({ people }));
    expect(items.map((item) => [item.key, item.severity, item.count])).toEqual([
      ["inactive_person:bek@x.uz", "high", 6],
      ["inactive_person:ali@x.uz", "medium", 3],
    ]);
    expect(items[1]).toMatchObject({
      values: { name: "Ali Valiyev", days: 3, never: "no" },
      href: "/admin/users/ali%40x.uz",
    });
  });

  it("counts a never-seen person from when they were added, and leaves a new one alone", () => {
    const items = buildAttentionItems(
      calm({
        people: [
          person("old@x.uz", { lastSeenAt: null, addedAt: "2026-09-18T05:00:00.000Z" }),
          person("new@x.uz", { lastSeenAt: null, addedAt: "2026-09-24T05:00:00.000Z" }),
        ],
      })
    );
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      kind: "inactive_person",
      severity: "medium",
      count: 4,
      values: { name: "old@x.uz", days: 4, never: "yes" },
    });
  });

  it("never flags the admin (not measured) or a deactivated account (cannot sign in)", () => {
    const idle = "2026-08-01T05:00:00.000Z";
    const people = [
      person("owner@x.uz", { role: "admin", lastSeenAt: null, addedAt: idle }),
      person("gone@x.uz", { isActive: false, lastSeenAt: idle }),
    ];
    expect(buildAttentionItems(calm({ people }))).toEqual([]);
  });

  it("names the most repeated zero-result search from 3 repeats, high from 10, and links the FAQ form", () => {
    expect(buildAttentionItems(calm({ zeroResultSearches: [{ query: "kafolat", count: 2 }] }))).toEqual([]);
    const item = only(
      calm({
        zeroResultSearches: [
          { query: "narx", count: 3 },
          { query: "  ", count: 50 },
          { query: " filtr muddati ", count: 12 },
        ],
      })
    );
    expect(item).toMatchObject({
      kind: "zero_result_top",
      severity: "high",
      count: 12,
      values: { query: "filtr muddati", count: 12 },
      href: faqPrefillHref("filtr muddati"),
    });
    expect(only(calm({ zeroResultSearches: [{ query: "narx", count: 3 }] })).severity).toBe("medium");
  });

  it("counts Copilot's unanswered requests: low from 1, medium from 3, high from 10", () => {
    expect(buildAttentionItems(calm({ copilotUnanswered: 0 }))).toEqual([]);
    expect(only(calm({ copilotUnanswered: 1 })).severity).toBe("low");
    expect(only(calm({ copilotUnanswered: 3 })).severity).toBe("medium");
    expect(only(calm({ copilotUnanswered: 10 }))).toMatchObject({
      kind: "copilot_unanswered",
      severity: "high",
      values: { count: 10 },
      href: "/admin/knowledge#gaps",
    });
  });

  it("sums the not-helpful marks over their pages: low from 1, medium from 5", () => {
    const item = only(
      calm({
        notHelpful: [
          { path: "/faq", count: 3 },
          { path: "/products", count: 2 },
          { path: "/company", count: 0 },
        ],
      })
    );
    expect(item).toMatchObject({
      kind: "not_helpful",
      severity: "medium",
      count: 5,
      values: { count: 5, pages: 2 },
      href: "/admin/knowledge#feedback",
    });
    expect(only(calm({ notHelpful: [{ path: "/faq", count: 1 }] })).severity).toBe("low");
  });

  it("reports drafts and stale content, low from 1 and medium from 10, each opening its list", () => {
    const items = buildAttentionItems(calm({ content: { draftsTotal: 12, staleTotal: 1, staleDays: 90 } }));
    expect(items).toEqual([
      {
        kind: "drafts_waiting",
        key: "drafts_waiting",
        severity: "medium",
        count: 12,
        values: { count: 12 },
        href: "/admin/knowledge?health=drafts#health",
      },
      {
        kind: "stale_content",
        key: "stale_content",
        severity: "low",
        count: 1,
        values: { count: 1, days: 90 },
        href: "/admin/knowledge?health=stale#health",
      },
    ]);
  });

  it("carries the overview's range into every knowledge-page link", () => {
    const items = buildAttentionItems(
      calm({
        knowledgeSearch: "from=2026-08-27&to=2026-09-25",
        copilotUnanswered: 4,
        content: { draftsTotal: 1, staleTotal: 0, staleDays: 90 },
      })
    );
    expect(items.map((item) => item.href)).toEqual([
      "/admin/knowledge?from=2026-08-27&to=2026-09-25#gaps",
      "/admin/knowledge?from=2026-08-27&to=2026-09-25&health=drafts#health",
    ]);
  });

  it("can produce every kind, and ATTENTION_KINDS lists exactly those", () => {
    const items = buildAttentionItems(
      calm({
        people: [person("ali@x.uz", { lastSeenAt: "2026-09-10T05:00:00.000Z" })],
        content: { draftsTotal: 2, staleTotal: 3, staleDays: 90 },
        unreadGateBlocked: 1,
        zeroResultSearches: [{ query: "kafolat", count: 4 }],
        copilotUnanswered: 2,
        notHelpful: [{ path: "/faq", count: 1 }],
      })
    );
    expect(new Set(kinds(items))).toEqual(new Set(ATTENTION_KINDS));
    expect(new Set(items.map((item) => item.key)).size).toBe(items.length);
  });
});

describe("ranking", () => {
  type Counted = "publish_blocked" | "copilot_unanswered" | "drafts_waiting";
  const counted = (kind: Counted, severity: AttentionSeverity, count: number): AttentionItem => ({
    kind,
    key: kind,
    severity,
    count,
    values: { count },
    href: "/admin",
  });
  const idle = (email: string, severity: AttentionSeverity, days: number): AttentionItem => ({
    kind: "inactive_person",
    key: `inactive_person:${email}`,
    severity,
    count: days,
    values: { name: email, days, never: "no" },
    href: "/admin",
  });
  const stale = (severity: AttentionSeverity, count: number): AttentionItem => ({
    kind: "stale_content",
    key: "stale_content",
    severity,
    count,
    values: { count, days: 90 },
    href: "/admin",
  });
  const feedback = (severity: AttentionSeverity, count: number): AttentionItem => ({
    kind: "not_helpful",
    key: "not_helpful",
    severity,
    count,
    values: { count, pages: 1 },
    href: "/admin",
  });

  it("orders by severity, then the larger count, then kind order, then key", () => {
    const ranked = rankAttentionItems([
      stale("low", 50),
      counted("drafts_waiting", "medium", 10),
      counted("copilot_unanswered", "medium", 10),
      idle("b@x.uz", "high", 5),
      idle("a@x.uz", "high", 5),
      counted("publish_blocked", "high", 1),
      feedback("medium", 11),
    ]);
    expect(ranked.map((entry) => entry.key)).toEqual([
      "inactive_person:a@x.uz",
      "inactive_person:b@x.uz",
      "publish_blocked",
      "not_helpful",
      "copilot_unanswered",
      "drafts_waiting",
      "stale_content",
    ]);
  });

  it("does not mutate its input and puts publish_blocked first among equals", () => {
    const input = [stale("high", 1), counted("publish_blocked", "high", 1)];
    expect(rankAttentionItems(input).map((entry) => entry.kind)).toEqual(["publish_blocked", "stale_content"]);
    expect(input[0]?.kind).toBe("stale_content");
    expect(ATTENTION_KINDS[0]).toBe("publish_blocked");
  });

  it("shows six before the rest are folded away", () => {
    expect(ATTENTION_VISIBLE_ITEMS).toBe(6);
  });
});

describe("empty and failed sources", () => {
  it("is empty — and complete — when every source read fine and nothing needs the admin", () => {
    expect(buildAttentionItems(calm())).toEqual([]);
    expect(attentionSkippedSources(calm())).toEqual([]);
  });

  it("skips a failed source instead of reading it as zero, and names it", () => {
    const allFailed = calm({
      people: null,
      content: null,
      unreadGateBlocked: null,
      zeroResultSearches: null,
      copilotUnanswered: null,
      notHelpful: null,
    });
    expect(buildAttentionItems(allFailed)).toEqual([]);
    expect(attentionSkippedSources(allFailed)).toEqual([...ATTENTION_SOURCES]);
  });

  it("still builds the items of the sources that did load", () => {
    const input = calm({ people: null, copilotUnanswered: null, unreadGateBlocked: 1 });
    expect(kinds(buildAttentionItems(input))).toEqual(["publish_blocked"]);
    expect(attentionSkippedSources(input)).toEqual(["people", "copilot"]);
  });
});

describe.each([
  ["uz", uz],
  ["ru", ru],
] as const)("messages/%s.json", (locale, messages) => {
  const t = createTranslator({ locale, messages, namespace: "pages.admin.overview.attention" });

  it("has a sentence and an action for every kind, and they format with the item's values", () => {
    const items = buildAttentionItems(
      calm({
        people: [
          person("ali@x.uz", { fullName: "Ali", lastSeenAt: "2026-09-10T05:00:00.000Z" }),
          person("new@x.uz", { lastSeenAt: null, addedAt: "2026-09-10T05:00:00.000Z" }),
        ],
        content: { draftsTotal: 2, staleTotal: 21, staleDays: 90 },
        unreadGateBlocked: 1,
        zeroResultSearches: [{ query: "kafolat", count: 4 }],
        copilotUnanswered: 5,
        notHelpful: [{ path: "/faq", count: 1 }],
      })
    );
    for (const item of items) {
      const text = t(`items.${item.kind}.text`, item.values);
      expect(text, item.kind).not.toMatch(/[{}]|pages\.admin/);
      expect(t(`items.${item.kind}.action`).trim(), item.kind).not.toBe("");
    }
  });

  it("labels every severity and every source", () => {
    for (const severity of ATTENTION_SEVERITIES) expect(t(`severity.${severity}`)).not.toMatch(/severity/);
    for (const source of ATTENTION_SOURCES) expect(t(`sources.${source}`)).not.toMatch(/sources/);
  });
});
