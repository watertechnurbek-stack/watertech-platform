import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider, type AbstractIntlMessages } from "next-intl";
import { describe, expect, it } from "vitest";
import { PersonCard } from "@/components/admin/people/PersonCard";
import type { DirectoryPerson } from "@/lib/admin/directory";
import uz from "@/messages/uz.json";
import ru from "@/messages/ru.json";

// A hydration mismatch (CLAUDE.md §3: no new Date()/Math.random()/window
// during render) shows up as the server's HTML differing from what the same
// component tree produces on the browser's *first* pass — before any effect
// has run and while state is still at its initial value. React never
// actually re-runs a Server Component on the client, but a "use client"
// component like PersonCard is rendered once on the server (SSR) and again
// during hydration with the same initial state, so the two calls below stand
// in for exactly that pair: same props, same (unmounted) initial `nowMs`, and
// renderToStaticMarkup needs no DOM. A future change that reads the clock, a
// random value or `window` directly in PersonCard's render body (or in
// anything it renders — ColumnBars, PersonCardMenu, RoleBadge, PersonAvatar)
// would make these two strings disagree.

const person: DirectoryPerson = {
  email: "ali.valiyev@watertech.uz",
  fullName: "Ali Valiyev",
  role: "operator",
  isActive: true,
  // Old enough to hit formatRelative's plain-date fallback once mounted —
  // irrelevant before mount (nowMs is null then either way) but keeps the
  // fixture realistic for anyone extending this test.
  lastActivityAt: "2026-08-01T10:00:00.000Z",
  addedAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  updatedBy: null,
  stats: { activeMs: 3_600_000, activeDays: 5, dailyMs: new Array(14).fill(60_000) },
  activeRecently: true,
};

function renderCard(locale: "uz" | "ru", messages: AbstractIntlMessages): string {
  return renderToStaticMarkup(
    createElement(NextIntlClientProvider, {
      locale,
      messages,
      now: new Date(0),
      timeZone: "UTC",
      onError: () => {},
      children: createElement(PersonCard, {
        person,
        windowStart: "2026-09-01",
        nowMs: null, // what both the server and the pre-hydration client see
        manageable: false,
        onToggleActive: () => {},
        onRemove: () => {},
      }),
    })
  );
}

describe("PersonCard hydration safety", () => {
  it("renders identical markup on two independent passes with the same (unmounted) props, in uz", () => {
    const first = renderCard("uz", uz);
    const second = renderCard("uz", uz);
    expect(second).toBe(first);
  });

  it("renders identical markup on two independent passes with the same (unmounted) props, in ru", () => {
    const first = renderCard("ru", ru);
    const second = renderCard("ru", ru);
    expect(second).toBe(first);
  });

  it("shows the mount-safe absolute time, not a relative label, before nowMs arrives", () => {
    const html = renderCard("uz", uz);
    // formatStableDateTime's fixed "YYYY-MM-DD HH:MM" form (CLAUDE.md §15) —
    // never a relative string, which would need the clock this render doesn't
    // have yet.
    expect(html).toContain("2026-08-01 15:00");
  });
});
