import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { EMPTY_STATES, type EmptyStateKey } from "@/lib/empty-states";

// Reads messages/*.json from disk (not through next-intl) so a key missing in
// one locale fails here instead of as a MISSING_MESSAGE at render time.

const LOCALES = ["uz", "ru"] as const;
type Locale = (typeof LOCALES)[number];

function loadMessages(locale: Locale): unknown {
  return JSON.parse(readFileSync(path.resolve(__dirname, `../../messages/${locale}.json`), "utf8"));
}

const messages: Record<Locale, unknown> = { uz: loadMessages("uz"), ru: loadMessages("ru") };

function lookup(value: unknown, keyPath: readonly string[]): unknown {
  let node = value;
  for (const key of keyPath) {
    if (typeof node !== "object" || node === null || !(key in node)) return undefined;
    node = Object.getOwnPropertyDescriptor(node, key)?.value;
  }
  return node;
}

type CopyField = "title" | "reason" | "cta";

/** Where each field's copy lives. `offline` and `notFound` deliberately reuse
 * chrome.offline.* / errors.* (see the comment on EMPTY_STATES). */
function copyPath(key: EmptyStateKey, field: CopyField): string[] {
  if (key === "offline") return ["chrome", "offline", { title: "title", reason: "description", cta: "retry" }[field]];
  if (key === "notFound") return ["errors", { title: "notFoundTitle", reason: "notFoundDescription", cta: "backHome" }[field]];
  return ["emptyState", key, field];
}

/** "All clear" states rendered with no action button (the knowledge page's
 * cards, the overview's attention list, VersionsList, the trash page, the
 * activity page). Kept explicit so adding a CTA to one of them — in either
 * locale — is a deliberate change to this list. */
const NO_CTA: ReadonlySet<EmptyStateKey> = new Set([
  "dashboardNoDrafts",
  "dashboardNoStale",
  "dashboardNoMissingRu",
  "dashboardNoFeedback",
  "dashboardNoOperators",
  "versionsNone",
  "trashNone",
  "copilotNoUnanswered",
  "activityNone",
  "attentionClear",
  "knowledgeNoGaps",
]);

const keys = Object.keys(EMPTY_STATES).filter((key): key is EmptyStateKey => key in EMPTY_STATES);

describe("EMPTY_STATES copy", () => {
  it("catalog keys match their own `key` field", () => {
    for (const key of keys) expect(EMPTY_STATES[key].key).toBe(key);
  });

  describe.each(LOCALES)("messages/%s.json", (locale) => {
    it.each(keys)("%s has a non-empty title and reason", (key) => {
      for (const field of ["title", "reason"] as const) {
        const copy = lookup(messages[locale], copyPath(key, field));
        expect(typeof copy, `${copyPath(key, field).join(".")}`).toBe("string");
        expect(String(copy).trim()).not.toBe("");
      }
    });

    it.each(keys.filter((key) => !NO_CTA.has(key)))("%s has a non-empty cta", (key) => {
      const copy = lookup(messages[locale], copyPath(key, "cta"));
      expect(typeof copy, `${copyPath(key, "cta").join(".")}`).toBe("string");
      expect(String(copy).trim()).not.toBe("");
    });

    it.each([...NO_CTA])("%s has no cta (rendered without an action)", (key) => {
      expect(lookup(messages[locale], copyPath(key, "cta"))).toBeUndefined();
    });
  });

  it("uz and ru define the same fields for every emptyState entry", () => {
    const fieldsOf = (locale: Locale, key: string): string[] => {
      const entry = lookup(messages[locale], ["emptyState", key]);
      return typeof entry === "object" && entry !== null ? Object.keys(entry).sort() : [];
    };
    const uzEntries = lookup(messages.uz, ["emptyState"]);
    const ruEntries = lookup(messages.ru, ["emptyState"]);
    expect(typeof uzEntries === "object" && uzEntries !== null ? Object.keys(uzEntries).sort() : []).toEqual(
      typeof ruEntries === "object" && ruEntries !== null ? Object.keys(ruEntries).sort() : []
    );
    for (const key of keys) expect(fieldsOf("ru", key), key).toEqual(fieldsOf("uz", key));
  });
});
