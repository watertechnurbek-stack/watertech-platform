import { describe, expect, it } from "vitest";
import { assessmentSeedItems, assessmentSeedRows } from "@/supabase/seed/assessment-items";
import { SOURCE_REF_PATTERN, itemFormToPublishInput, itemPublishIssues, itemWriteSchema } from "@/lib/attestation/schemas";
import { ASSESSMENT_DAYS, ITEM_TOPIC_SUGGESTIONS, type SourceRefKind } from "@/lib/attestation/types";
import { competitors } from "@/lib/content/competitors";
import { faqs } from "@/lib/content/faq";
import { objections } from "@/lib/content/objections";
import { packageGroups } from "@/lib/content/packages";
import { products } from "@/lib/content/products";
import { scripts } from "@/lib/content/scripts";

// The staging seed of the attestation item bank (supabase/seed/assessment-items.ts):
// eight drafts per day that an admin can publish as they are, each pointing at
// the shipped content it was written from.

const CONTENT_IDS = new Map<SourceRefKind, ReadonlySet<string>>([
  ["faq", new Set(faqs.map((faq) => faq.id))],
  ["product", new Set(products.map((product) => product.id))],
  ["package", new Set(packageGroups.flatMap((group) => group.packages.map((pkg) => pkg.id)))],
  ["competitor", new Set(competitors.map((competitor) => competitor.id))],
  ["objection", new Set(objections.map((objection) => objection.id))],
  ["script", new Set(scripts.map((script) => script.id))],
]);

describe("assessment seed items", () => {
  it("has eight items per day, with unique ids named after their day", () => {
    expect(assessmentSeedItems).toHaveLength(32);
    for (const day of ASSESSMENT_DAYS) {
      const ofDay = assessmentSeedItems.filter((item) => item.day === day);
      expect(ofDay).toHaveLength(8);
      for (const item of ofDay) expect(item.id.startsWith(`d${day}-`)).toBe(true);
    }
    expect(new Set(assessmentSeedItems.map((item) => item.id)).size).toBe(32);
  });

  it("are all drafts that the admin's save accepts as they are", () => {
    for (const item of assessmentSeedItems) {
      expect(item.status).toBe("draft");
      expect(item.version).toBeUndefined();
      expect(itemWriteSchema.safeParse(item).success, item.id).toBe(true);
    }
  });

  it("pass every publish check, so a reviewer can publish them without edits", () => {
    for (const item of assessmentSeedItems) {
      expect(itemPublishIssues(itemFormToPublishInput(item)), item.id).toEqual([]);
      expect(itemWriteSchema.safeParse({ ...item, status: "published" }).success, item.id).toBe(true);
    }
  });

  it("use the suggested topics of their day, and every difficulty on every day", () => {
    for (const day of ASSESSMENT_DAYS) {
      const ofDay = assessmentSeedItems.filter((item) => item.day === day);
      for (const item of ofDay) expect(ITEM_TOPIC_SUGGESTIONS[day], item.id).toContain(item.topic);
      expect(new Set(ofDay.map((item) => item.topic)).size).toBeGreaterThanOrEqual(3);
      expect(new Set(ofDay.map((item) => item.difficulty))).toEqual(new Set([1, 2, 3]));
    }
  });

  it("name the shipped content each fact comes from", () => {
    for (const item of assessmentSeedItems) {
      expect(item.sourceRef, item.id).toMatch(SOURCE_REF_PATTERN);
      // The SOP steps are still placeholder text: nothing may be sourced from them.
      const source = [...CONTENT_IDS].find(([kind]) => item.sourceRef.startsWith(`${kind}:`));
      expect(source, item.sourceRef).toBeDefined();
      const [kind, ids] = source ?? ["", new Set<string>()];
      expect(ids.has(item.sourceRef.slice(kind.length + 1)), item.sourceRef).toBe(true);
    }
  });

  it("keep the Uzbek apostrophe convention of lib/content (o', g' with a plain ')", () => {
    for (const item of assessmentSeedItems) {
      const uzbek = [item.prompt, item.explanation, ...item.options.map((option) => option.text)].join(" ");
      expect(uzbek, item.id).not.toMatch(/[ʻʼ‘’`]/u);
    }
  });
});

describe("assessmentSeedRows", () => {
  it("maps each item the way the admin's save does: key from the correct boxes, drafts only", () => {
    const rows = assessmentSeedRows();
    expect(rows).toHaveLength(32);
    const multi = rows.find((row) => row.id === "d3-mijoz-haqida");
    expect(multi).toMatchObject({ kind: "multi", status: "draft", answer_key: ["a", "b", "c"], source_ref: "script:lead-orqali-tushgan" });
    expect(multi?.options).toContainEqual({ id: "e", text: "Oylik maoshi", text_ru: "Размер зарплаты" });
    for (const row of rows) {
      expect(row.status).toBe("draft");
      expect(row.prompt_ru).not.toBeNull();
      expect(row.answer_key.length).toBeGreaterThan(0);
    }
  });
});
