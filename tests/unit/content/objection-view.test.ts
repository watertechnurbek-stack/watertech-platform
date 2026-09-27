import { describe, expect, it } from "vitest";
import { buildObjectionEntries, filterObjectionEntries, parseObjectionParam } from "@/lib/content/objection-view";
import type { Objection, Script } from "@/lib/content/types";

const scripts: Script[] = [
  {
    id: "lead",
    name: "Lead",
    cheatSheet: "",
    stages: [
      { id: "intro", label: "Tanishuv", turns: [], objectionIds: [] },
      { id: "etiroz", label: "E'tiroz", turns: [], objectionIds: ["obj-qimmat", "obj-think"] },
    ],
  },
  {
    id: "cold",
    name: "Sovuq",
    cheatSheet: "",
    // Lists obj-think in scriptIds below but surfaces it in no stage.
    stages: [{ id: "etiroz-cold", label: "E'tiroz", turns: [], objectionIds: ["obj-qimmat"] }],
  },
];

const objections: Objection[] = [
  {
    id: "obj-qimmat",
    label: "Narxi qimmat",
    keywords: ["chegirma", "arzon"],
    clientSays: "Narxi qimmat",
    realMeaning: "Qiymatni ko'rmayapti",
    response: "Biz xavfsizlikni sotyapmiz.",
    followUp: "Sifat haqida so'rang",
    scriptIds: ["lead", "cold", "deleted-script"],
  },
  {
    id: "obj-think",
    label: "O'ylab ko'raman",
    keywords: ["keyinroq"],
    clientSays: "Hozir o'ylab ko'ray",
    realMeaning: "Sababni aytmayapti",
    response: "Sizni nima to'xtatyapti?",
    scriptIds: ["lead", "cold"],
  },
];

const entries = buildObjectionEntries(objections, scripts);

describe("buildObjectionEntries", () => {
  it("links each script that surfaces the objection to its stage on the scripts page", () => {
    expect(entries[0].scripts).toEqual([
      { id: "lead", name: "Lead", href: "/sales-process/scripts?script=lead&stage=etiroz&objection=obj-qimmat" },
      { id: "cold", name: "Sovuq", href: "/sales-process/scripts?script=cold&stage=etiroz-cold&objection=obj-qimmat" },
    ]);
  });

  it("drops scripts that are unpublished or do not surface the objection", () => {
    expect(entries[1].scripts.map((s) => s.id)).toEqual(["lead"]);
  });

  it("leaves followUp out when the objection has none", () => {
    expect(entries[0].followUp).toBe("Sifat haqida so'rang");
    expect("followUp" in entries[1]).toBe(false);
  });
});

describe("filterObjectionEntries", () => {
  it("returns everything for an empty query", () => {
    expect(filterObjectionEntries(entries, "  ")).toBe(entries);
  });

  it("matches keywords and body text, not only the label", () => {
    expect(filterObjectionEntries(entries, "arzon").map((e) => e.id)).toEqual(["obj-qimmat"]);
    expect(filterObjectionEntries(entries, "to'xtatyapti").map((e) => e.id)).toEqual(["obj-think"]);
  });

  it("ignores case, apostrophe glyphs and Cyrillic script", () => {
    expect(filterObjectionEntries(entries, "O‘YLAB").map((e) => e.id)).toEqual(["obj-think"]);
    expect(filterObjectionEntries(entries, "нархи").map((e) => e.id)).toEqual(["obj-qimmat"]);
  });

  it("requires every word to match", () => {
    expect(filterObjectionEntries(entries, "narxi keyinroq")).toEqual([]);
  });
});

describe("parseObjectionParam", () => {
  it("accepts only a published objection id", () => {
    expect(parseObjectionParam("?o=obj-think", entries)).toBe("obj-think");
    expect(parseObjectionParam("?o=obj-missing", entries)).toBeNull();
    expect(parseObjectionParam("", entries)).toBeNull();
  });
});
