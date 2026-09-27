import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";

// Both default clients are only built when no client is passed; the tests
// always pass one, so these never run — they keep lib/env.ts's eager parse out.
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import {
  OPERATOR_SCHEDULE_COLUMNS,
  adminAttestationRepo,
  bankReadiness,
  operatorAttestationRepo,
  sessionEmail,
} from "@/lib/attestation/repository";
import { DEFAULT_ASSESSMENT_CONFIG } from "@/lib/attestation/config";
import type { Database } from "@/lib/supabase/database.types";

// The real supabase-js query builder over a mocked fetch (the approach of
// tests/unit/admin/user-access.test.ts), so what is asserted is the PostgREST
// traffic itself: above all, that every query of the candidate's surface is
// filtered by the session's email and never selects a score.

interface Recorded {
  method: string;
  url: URL;
  body: unknown;
  headers: Headers;
}

function setup(respond: (request: Recorded) => { status: number; body: unknown; headers?: Record<string, string> }) {
  const requests: Recorded[] = [];
  const fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const raw = typeof init?.body === "string" ? init.body : null;
    const request: Recorded = {
      method: init?.method ?? "GET",
      url,
      body: raw === null ? null : JSON.parse(raw),
      headers: new Headers(init?.headers),
    };
    requests.push(request);
    const answer = respond(request);
    return new Response(answer.body === null ? null : JSON.stringify(answer.body), {
      status: answer.status,
      headers: { "Content-Type": "application/json", ...answer.headers },
    });
  };
  const client = createClient<Database>("https://example.supabase.co", "service-key-service-key-service", {
    global: { fetch },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return { client, requests };
}

const EMAIL = sessionEmail({ email: " Aziza@WaterTech.UZ " });

let consoleError: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => {
  consoleError.mockRestore();
});

describe("sessionEmail", () => {
  it("lowercases and trims the verified session's email, and refuses an empty one", () => {
    expect(EMAIL).toBe("aziza@watertech.uz");
    expect(() => sessionEmail({ email: "  " })).toThrow();
  });
});

describe("operatorAttestationRepo", () => {
  function operatorSetup() {
    return setup((request) => {
      const path = request.url.pathname;
      if (request.method === "HEAD") return { status: 200, body: null, headers: { "Content-Range": "0-0/1" } };
      if (path.endsWith("/assessment_unlocks")) return { status: 200, body: [{ day: 3 }, { day: 7 }] };
      if (request.url.searchParams.get("select") === "item_ids") {
        return { status: 200, body: [{ item_ids: ["d1-a", "d1-b"] }, { item_ids: ["d1-b", "d1-c"] }] };
      }
      return {
        status: 200,
        body: [
          { id: "a1", day: 1, status: "evaluated", attempt_no: 1, submitted_at: "2026-09-25T05:00:00+00:00" },
          { id: "a2", day: 2, status: "in_progress", attempt_no: 1, submitted_at: null },
          { id: "a3", day: 9, status: "in_progress", attempt_no: 1, submitted_at: null },
        ],
      };
    });
  }

  it("filters every query by the session's email", async () => {
    const { client, requests } = operatorSetup();
    const repo = operatorAttestationRepo(EMAIL, client);
    await repo.listScheduleAttempts();
    await repo.listUnlockedDays();
    await repo.listSeenItemIds(1);
    await repo.hasAttemptInProgress();

    expect(requests).toHaveLength(4);
    for (const request of requests) {
      expect(request.url.searchParams.get("user_email"), request.url.toString()).toBe("eq.aziza@watertech.uz");
      expect(request.method === "GET" || request.method === "HEAD").toBe(true);
    }
  });

  it("selects day, status and submit time for the state — never a score", async () => {
    const { client, requests } = operatorSetup();
    const attempts = await operatorAttestationRepo(EMAIL, client).listScheduleAttempts();

    const select = requests[0]?.url.searchParams.get("select") ?? "";
    expect(select).toBe(OPERATOR_SCHEDULE_COLUMNS);
    for (const column of ["score", "rubric", "answers", "served_items", "answer_key", "flags", "persona", "override"]) {
      expect(select).not.toContain(column);
    }
    // A row that does not parse (day 9) is skipped, not trusted.
    expect(attempts).toEqual([
      { id: "a1", day: 1, status: "evaluated", attemptNo: 1, submittedAt: "2026-09-25T05:00:00+00:00" },
      { id: "a2", day: 2, status: "in_progress", attemptNo: 1, submittedAt: null },
    ]);
  });

  it("reads unlocks, seen items and 'in progress' for that person only", async () => {
    const { client, requests } = operatorSetup();
    const repo = operatorAttestationRepo(EMAIL, client);
    expect(await repo.listUnlockedDays()).toEqual([3]);
    expect(await repo.listSeenItemIds(1)).toEqual(["d1-a", "d1-b", "d1-c"]);
    expect(requests[1]?.url.searchParams.get("status")).toBe("eq.archived");
    expect(requests[1]?.url.searchParams.get("day")).toBe("eq.1");
    expect(await repo.hasAttemptInProgress()).toBe(true);
    expect(requests[2]?.url.searchParams.get("status")).toBe("eq.in_progress");
  });

  it("throws on a read error without the database's message", async () => {
    const { client } = setup(() => ({ status: 500, body: { code: "XX000", message: "secret table detail", details: null, hint: null } }));
    await expect(operatorAttestationRepo(EMAIL, client).listScheduleAttempts()).rejects.toThrow(/read failed \(XX000\)/);
    await expect(operatorAttestationRepo(EMAIL, client).listScheduleAttempts()).rejects.not.toThrow(/secret/);
  });
});

describe("adminAttestationRepo", () => {
  it("guards an item update on its version and never sends the id in the body", async () => {
    const { client, requests } = setup(() => ({ status: 200, body: [{ version: 4 }] }));
    const outcome = await adminAttestationRepo(client).updateItem("d1-warranty", 3, {
      day: 1,
      topic: "company",
      kind: "single",
      difficulty: 1,
      status: "draft",
      prompt: "Savol?",
      prompt_ru: null,
      options: [],
      answer_key: [],
      explanation: null,
      explanation_ru: null,
      source_ref: null,
    });
    expect(outcome).toEqual({ ok: true, value: { version: 4 } });
    const [request] = requests;
    expect(request?.method).toBe("PATCH");
    expect(request?.url.searchParams.get("id")).toBe("eq.d1-warranty");
    expect(request?.url.searchParams.get("version")).toBe("eq.3");
    expect(request?.body).not.toHaveProperty("id");
    expect(request?.body).not.toHaveProperty("version");
  });

  it("reports a version miss as no_row and a refusal by SQLSTATE, logging the message only", async () => {
    const miss = setup(() => ({ status: 200, body: [] }));
    expect(await adminAttestationRepo(miss.client).setItemStatus("d1-x", 2, "published")).toEqual({ ok: false, kind: "no_row" });

    const refused = setup(() => ({ status: 400, body: { code: "23514", message: "violates check constraint assessment_items_publishable_chk", details: null, hint: null } }));
    const outcome = await adminAttestationRepo(refused.client).setItemStatus("d1-x", 2, "published");
    expect(outcome).toEqual({ ok: false, kind: "db", sqlstate: "23514" });
    expect(JSON.stringify(outcome)).not.toContain("publishable_chk");
    expect(consoleError).toHaveBeenCalled();
  });

  it("writes the settings guarded on id = 1 and the version, in the stored JSON shape", async () => {
    const { client, requests } = setup(() => ({ status: 200, body: [{ version: 2 }] }));
    const config = DEFAULT_ASSESSMENT_CONFIG;
    await adminAttestationRepo(client).updateConfig(1, {
      weights: config.weights,
      thresholds: config.thresholds,
      daySettings: config.daySettings,
      extraFacts: "Fakt",
      extraFactsRu: "Факт",
      retentionDays: 365,
    });
    const [request] = requests;
    expect(request?.url.searchParams.get("id")).toBe("eq.1");
    expect(request?.url.searchParams.get("version")).toBe("eq.1");
    expect(request?.body).toEqual({
      weights: { "1": { partA: 40, partB: 60 }, "2": { partA: 40, partB: 60 }, "3": { partA: 40, partB: 60 }, "4": { partA: 20, partB: 80 } },
      thresholds: { green: 80, yellow: 60 },
      day_settings: {
        "1": { itemCount: 12, itemSeconds: 60, minTurns: 6, maxTurns: 8, partBMinutes: 20 },
        "2": { itemCount: 12, itemSeconds: 60, minTurns: 8, maxTurns: 10, partBMinutes: 20 },
        "3": { itemCount: 10, itemSeconds: 60, minTurns: 8, maxTurns: 10, partBMinutes: 20 },
        "4": { itemCount: 6, itemSeconds: 90, minTurns: 10, maxTurns: 14, partBMinutes: 20 },
      },
      extra_facts: "Fakt",
      extra_facts_ru: "Факт",
      retention_days: 365,
    });
  });

  it("calls the admin functions with their p_ arguments", async () => {
    const { client, requests } = setup((request) => {
      const fn = request.url.pathname.split("/").pop();
      if (fn === "admin_assessment_override" || fn === "admin_assessment_clear_override") return { status: 200, body: 5 };
      if (fn === "admin_assessment_reset_person") return { status: 200, body: { attempts_archived: 2, unlocks_removed: 1 } };
      if (fn === "admin_assessment_unlock") return { status: 200, body: true };
      return { status: 204, body: null };
    });
    const repo = adminAttestationRepo(client);
    const attemptId = "a0000000-0000-4000-8000-000000000001";

    expect(await repo.override({ attemptId, score: 72.5, note: "Tekshirildi", version: 4 })).toEqual({ ok: true, value: { version: 5 } });
    expect(await repo.clearOverride({ attemptId, note: "Bekor", version: 5 })).toEqual({ ok: true, value: { version: 5 } });
    expect(await repo.resetAttempt({ attemptId, version: 5 })).toEqual({ ok: true, value: null });
    expect(await repo.resetPerson("ali@watertech.uz")).toEqual({ ok: true, value: { attemptsArchived: 2, unlocksRemoved: 1 } });
    expect(await repo.unlockDay("ali@watertech.uz", 3)).toEqual({ ok: true, value: { created: true } });

    expect(requests.map((request) => [request.url.pathname.split("/").pop(), request.body])).toEqual([
      ["admin_assessment_override", { p_attempt: attemptId, p_score: 72.5, p_note: "Tekshirildi", p_version: 4 }],
      ["admin_assessment_clear_override", { p_attempt: attemptId, p_note: "Bekor", p_version: 5 }],
      ["admin_assessment_reset", { p_attempt: attemptId, p_version: 5 }],
      ["admin_assessment_reset_person", { p_email: "ali@watertech.uz" }],
      ["admin_assessment_unlock", { p_email: "ali@watertech.uz", p_day: 3 }],
    ]);
  });

  it("parses item rows and skips one that does not parse", async () => {
    const good = {
      id: "d1-warranty",
      day: 1,
      topic: "company",
      kind: "single",
      difficulty: 2,
      prompt: "Savol?",
      prompt_ru: "Вопрос?",
      options: [{ id: "a", text: "Ha", text_ru: "Да" }],
      answer_key: ["a"],
      explanation: null,
      explanation_ru: null,
      source_ref: "faq:product-1",
      status: "published",
      version: 3,
      created_at: "2026-09-26T00:00:00+00:00",
      updated_at: "2026-09-26T00:00:00+00:00",
      updated_by: null,
    };
    const { client } = setup(() => ({ status: 200, body: [good, { ...good, id: "broken", kind: "essay" }] }));
    const items = await adminAttestationRepo(client).listItems();
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ id: "d1-warranty", promptRu: "Вопрос?", answerKey: ["a"], options: [{ id: "a", text: "Ha", textRu: "Да" }] });
  });
});

describe("bankReadiness", () => {
  it("counts published items per day against the day's item count", () => {
    const items = [
      { day: 1 as const, status: "published" as const },
      { day: 1 as const, status: "draft" as const },
      { day: 4 as const, status: "published" as const },
    ];
    expect(bankReadiness(items, DEFAULT_ASSESSMENT_CONFIG)).toEqual({
      1: { published: 1, needed: 12 },
      2: { published: 0, needed: 12 },
      3: { published: 0, needed: 10 },
      4: { published: 1, needed: 6 },
    });
  });
});
