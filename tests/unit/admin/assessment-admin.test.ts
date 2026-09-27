import { describe, expect, it, vi } from "vitest";
import { assessmentAdminActions, type AssessmentAdminDeps } from "@/lib/admin/actions/assessment-admin";
import { AdminActionError } from "@/lib/admin/errors";
import type { AdminAttestationRepo, WriteOutcome } from "@/lib/attestation/repository";
import type { ItemWriteInput } from "@/lib/attestation/schemas";
import type { AssessmentItem } from "@/lib/attestation/types";
import { DEFAULT_ASSESSMENT_CONFIG } from "@/lib/attestation/config";

// The attestation's admin writes (lib/admin/actions/assessment-admin.ts) over
// a repository double: what is asserted is the order of the guards — the
// session, then zod, then the publish rules, then exactly one write — and how
// every refusal becomes an AdminErrorCode.

const ATTEMPT = "a0000000-0000-4000-8000-000000000001";

function storedItem(overrides: Partial<AssessmentItem> = {}): AssessmentItem {
  return {
    id: "d1-warranty",
    day: 1,
    topic: "company",
    kind: "single",
    difficulty: 1,
    prompt: "Kafolat?",
    promptRu: "Гарантия?",
    options: [
      { id: "a", text: "1 yil", textRu: "1 год" },
      { id: "b", text: "10 yil", textRu: "10 лет" },
    ],
    answerKey: ["b"],
    explanation: null,
    explanationRu: null,
    sourceRef: null,
    status: "draft",
    version: 3,
    createdAt: "2026-09-26T00:00:00+00:00",
    updatedAt: "2026-09-26T00:00:00+00:00",
    updatedBy: null,
    ...overrides,
  };
}

function itemInput(overrides: Partial<ItemWriteInput> = {}): ItemWriteInput {
  return {
    id: "d1-warranty",
    day: 1,
    topic: "company",
    kind: "single",
    difficulty: 1,
    status: "draft",
    prompt: "Kafolat?",
    promptRu: "",
    explanation: "",
    explanationRu: "",
    sourceRef: "",
    options: [
      { id: "a", text: "1 yil", textRu: "", correct: false },
      { id: "b", text: "10 yil", textRu: "", correct: true },
    ],
    ...overrides,
  };
}

const OK_VERSION: WriteOutcome<{ version: number }> = { ok: true, value: { version: 4 } };

function setup(overrides: Partial<AdminAttestationRepo> = {}, session: "admin" | "none" = "admin") {
  const repo: AdminAttestationRepo = {
    listItems: vi.fn(async () => [storedItem()]),
    getItem: vi.fn(async () => storedItem()),
    itemExists: vi.fn(async () => true),
    insertItem: vi.fn(async () => OK_VERSION),
    updateItem: vi.fn(async () => OK_VERSION),
    setItemStatus: vi.fn(async () => OK_VERSION),
    deleteItem: vi.fn(async (): Promise<WriteOutcome<null>> => ({ ok: true, value: null })),
    getConfig: vi.fn(async () => ({ config: DEFAULT_ASSESSMENT_CONFIG, source: "database" as const })),
    updateConfig: vi.fn(async () => OK_VERSION),
    listAttemptSummaries: vi.fn(async () => []),
    override: vi.fn(async () => OK_VERSION),
    clearOverride: vi.fn(async () => OK_VERSION),
    resetAttempt: vi.fn(async (): Promise<WriteOutcome<null>> => ({ ok: true, value: null })),
    resetPerson: vi.fn(async () => ({ ok: true as const, value: { attemptsArchived: 1, unlocksRemoved: 0 } })),
    unlockDay: vi.fn(async () => ({ ok: true as const, value: { created: true } })),
    ...overrides,
  };
  const deps: AssessmentAdminDeps = {
    requireSession: async () => {
      if (session === "none") throw new AdminActionError("unauthorized");
      return { email: "owner@watertech.uz" };
    },
    repo: () => repo,
  };
  return { actions: assessmentAdminActions(deps), repo };
}

describe("saveItem", () => {
  it("refuses a non-admin before reading anything", async () => {
    const { actions, repo } = setup({}, "none");
    expect(await actions.saveItem(itemInput())).toEqual({ ok: false, code: "unauthorized" });
    expect(repo.insertItem).not.toHaveBeenCalled();
  });

  it("creates when there is no version, with the key taken from the correct options", async () => {
    const { actions, repo } = setup();
    expect(await actions.saveItem(itemInput())).toEqual({ ok: true });
    expect(repo.insertItem).toHaveBeenCalledWith(
      expect.objectContaining({ id: "d1-warranty", status: "draft", answer_key: ["b"], prompt_ru: null })
    );
    expect(repo.updateItem).not.toHaveBeenCalled();
  });

  it("updates with the version the editor loaded, without the id in the row", async () => {
    const { actions, repo } = setup();
    expect(await actions.saveItem(itemInput({ version: 3, prompt: "Yangi" }))).toEqual({ ok: true });
    expect(repo.updateItem).toHaveBeenCalledWith("d1-warranty", 3, expect.not.objectContaining({ id: expect.anything() }));
  });

  it("answers a publish that breaks the rules with their keys, writing nothing", async () => {
    const { actions, repo } = setup();
    const result = await actions.saveItem(itemInput({ status: "published" }));
    expect(result).toMatchObject({ ok: false, code: "validation", field: "status" });
    expect(result.ok ? [] : result.details).toContain("publishBothLocales");
    expect(repo.insertItem).not.toHaveBeenCalled();
  });

  it.each([
    [{ ok: false, kind: "db", sqlstate: "23505" } as const, "id_taken"],
    [{ ok: false, kind: "db", sqlstate: "23514" } as const, "validation"],
    [{ ok: false, kind: "db", sqlstate: "42501" } as const, "unauthorized"],
    [{ ok: false, kind: "db", sqlstate: undefined } as const, "unknown"],
  ])("maps a refused create %o to %s", async (outcome, code) => {
    const { actions } = setup({ insertItem: vi.fn(async () => outcome) });
    expect(await actions.saveItem(itemInput())).toEqual({ ok: false, code });
  });

  it("tells a stale version from a deleted item", async () => {
    const stale = setup({ updateItem: vi.fn(async () => ({ ok: false as const, kind: "no_row" as const })) });
    expect(await stale.actions.saveItem(itemInput({ version: 2 }))).toEqual({ ok: false, code: "version_conflict" });

    const gone = setup({
      updateItem: vi.fn(async () => ({ ok: false as const, kind: "no_row" as const })),
      itemExists: vi.fn(async () => false),
    });
    expect(await gone.actions.saveItem(itemInput({ version: 2 }))).toEqual({ ok: false, code: "not_found" });
  });
});

describe("setItemStatus", () => {
  it("publishes only a stored row that passes the rules, at the version the admin saw", async () => {
    const { actions, repo } = setup();
    expect(await actions.setItemStatus("d1-warranty", "published", 3)).toEqual({ ok: true });
    expect(repo.setItemStatus).toHaveBeenCalledWith("d1-warranty", 3, "published");

    const incomplete = setup({ getItem: vi.fn(async () => storedItem({ promptRu: null })) });
    const refused = await incomplete.actions.setItemStatus("d1-warranty", "published", 3);
    expect(refused).toEqual({ ok: false, code: "validation", field: "status", details: ["publishBothLocales"] });
    expect(incomplete.repo.setItemStatus).not.toHaveBeenCalled();

    const moved = setup({ getItem: vi.fn(async () => storedItem({ version: 4 })) });
    expect(await moved.actions.setItemStatus("d1-warranty", "published", 3)).toEqual({ ok: false, code: "version_conflict" });
    expect(moved.repo.setItemStatus).not.toHaveBeenCalled();
  });

  it("unpublishes without loading the row, and validates its arguments", async () => {
    const { actions, repo } = setup();
    expect(await actions.setItemStatus("d1-warranty", "draft", 3)).toEqual({ ok: true });
    expect(repo.getItem).not.toHaveBeenCalled();
    expect(await actions.setItemStatus("D1 Bad", "draft", 3)).toMatchObject({ ok: false, code: "validation" });
    expect(await actions.setItemStatus("d1-warranty", "archived", 3)).toMatchObject({ ok: false, code: "validation" });
  });
});

describe("deleteItem", () => {
  it("deletes guarded on the version, and tells a conflict from a miss", async () => {
    const { actions, repo } = setup();
    expect(await actions.deleteItem("d1-warranty", 3)).toEqual({ ok: true });
    expect(repo.deleteItem).toHaveBeenCalledWith("d1-warranty", 3);

    const stale = setup({ deleteItem: vi.fn(async () => ({ ok: false as const, kind: "no_row" as const })) });
    expect(await stale.actions.deleteItem("d1-warranty", 2)).toEqual({ ok: false, code: "version_conflict" });
  });
});

describe("saveConfig", () => {
  const input = {
    weights: DEFAULT_ASSESSMENT_CONFIG.weights,
    thresholds: { green: 85, yellow: 65 },
    daySettings: DEFAULT_ASSESSMENT_CONFIG.daySettings,
    extraFacts: "Zavod: 40 t/sutka",
    extraFactsRu: "",
    retentionDays: 365,
    version: 1,
  };

  it("writes the parsed settings at the loaded version", async () => {
    const { actions, repo } = setup();
    expect(await actions.saveConfig(input)).toEqual({ ok: true });
    expect(repo.updateConfig).toHaveBeenCalledWith(1, {
      weights: input.weights,
      thresholds: { green: 85, yellow: 65 },
      daySettings: input.daySettings,
      extraFacts: "Zavod: 40 t/sutka",
      extraFactsRu: "",
      retentionDays: 365,
    });
  });

  it("refuses invalid settings and reports someone else's save as a conflict", async () => {
    const { actions, repo } = setup({ updateConfig: vi.fn(async () => ({ ok: false as const, kind: "no_row" as const })) });
    expect(await actions.saveConfig({ ...input, thresholds: { green: 60, yellow: 70 } })).toMatchObject({
      ok: false,
      code: "validation",
      field: "thresholds.yellow",
    });
    expect(repo.updateConfig).not.toHaveBeenCalled();
    expect(await actions.saveConfig(input)).toEqual({ ok: false, code: "version_conflict" });
  });
});

describe("the attempt functions", () => {
  it("pass validated input through and map the functions' SQLSTATEs", async () => {
    const { actions, repo } = setup();
    expect(await actions.overrideScore({ attemptId: ATTEMPT, score: 72.5, note: " Tekshirildi ", version: 4 })).toEqual({ ok: true });
    expect(repo.override).toHaveBeenCalledWith({ attemptId: ATTEMPT, score: 72.5, note: "Tekshirildi", version: 4 });

    for (const [sqlstate, code] of [
      ["WT409", "version_conflict"],
      ["WT404", "not_found"],
      ["WT403", "unauthorized"],
      ["WT400", "validation"],
    ] as const) {
      const refused = setup({ override: vi.fn(async () => ({ ok: false as const, kind: "db" as const, sqlstate })) });
      expect(await refused.actions.overrideScore({ attemptId: ATTEMPT, score: 50, note: "x", version: 1 })).toEqual({ ok: false, code });
    }
  });

  it("refuse bad input before calling anything", async () => {
    const { actions, repo } = setup();
    expect(await actions.overrideScore({ attemptId: ATTEMPT, score: 101, note: "x", version: 1 })).toMatchObject({ code: "validation" });
    expect(await actions.clearOverride({ attemptId: "nope", note: "x", version: 1 })).toMatchObject({ code: "validation" });
    expect(await actions.resetAttempt({ attemptId: ATTEMPT })).toMatchObject({ code: "validation" });
    expect(await actions.unlockDay("ali@watertech.uz", 1)).toMatchObject({ code: "validation" });
    expect(await actions.resetPerson("not an email")).toMatchObject({ code: "validation" });
    expect(repo.override).not.toHaveBeenCalled();
    expect(repo.clearOverride).not.toHaveBeenCalled();
    expect(repo.resetAttempt).not.toHaveBeenCalled();
    expect(repo.unlockDay).not.toHaveBeenCalled();
    expect(repo.resetPerson).not.toHaveBeenCalled();
  });

  it("normalise the email for a person reset and an unlock", async () => {
    const { actions, repo } = setup();
    expect(await actions.resetPerson(" Ali@WaterTech.UZ ")).toEqual({ ok: true });
    expect(repo.resetPerson).toHaveBeenCalledWith("ali@watertech.uz");
    expect(await actions.unlockDay("ALI@watertech.uz", 3)).toEqual({ ok: true });
    expect(repo.unlockDay).toHaveBeenCalledWith("ali@watertech.uz", 3);
    expect(await actions.resetAttempt({ attemptId: ATTEMPT, version: 2 })).toEqual({ ok: true });
    expect(await actions.clearOverride({ attemptId: ATTEMPT, note: "Xato", version: 2 })).toEqual({ ok: true });
  });
});
