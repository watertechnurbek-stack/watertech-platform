"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { EmptyState } from "@/components/EmptyState";
import { ObjectionDetail } from "@/components/scripts/ObjectionDetail";
import { useTrack } from "@/hooks/useTrack";
import { filterObjectionEntries, parseObjectionParam, type ObjectionEntry } from "@/lib/content/objection-view";

/** /sales-process/objections — the objection base as a playbook instead of a
 * five-column table: a searchable list of objections (a real `tablist`,
 * arrow keys, sticky on desktop, a chip row on mobile) and one answer card
 * at a time, read top-down in the order the call goes. The open objection is
 * mirrored to `?o=` with history.replaceState (CLAUDE.md §4), so a link to it
 * can be shared; the page is prerendered, so the param is read after mount. */
export function ObjectionsPlaybook({ entries }: { entries: ObjectionEntry[] }) {
  const t = useTranslations("pages.salesProcess.objections.playbook");
  const tNone = useTranslations("emptyState.objectionsNone");
  const tFilterEmpty = useTranslations("emptyState.filterNoMatch");
  const track = useTrack();
  const idBase = useId();
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(entries[0]?.id ?? null);
  const searchRef = useRef<HTMLInputElement>(null);
  const tabRefs = useRef(new Map<string, HTMLButtonElement>());

  const numberById = useMemo(() => new Map(entries.map((e, i) => [e.id, i + 1])), [entries]);
  const visible = useMemo(() => filterObjectionEntries(entries, query), [entries, query]);
  const active = visible.find((e) => e.id === selectedId) ?? visible[0] ?? null;
  const activeIndex = active ? visible.indexOf(active) : -1;

  const select = useCallback(
    (id: string) => {
      setSelectedId(id);
      const url = new URL(window.location.href);
      url.searchParams.set("o", id);
      window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
      track("objection_view", { entityType: "objection", entityId: id });
    },
    [track]
  );

  useEffect(() => {
    const id = parseObjectionParam(window.location.search, entries);
    if (id) {
      setSelectedId(id);
      track("objection_view", { entityType: "objection", entityId: id });
    }
    // Once per mount: the deep link the page was opened with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // `/` jumps to the search box, as on the scripts page — never while typing.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target;
      if (
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable)
      ) {
        return;
      }
      e.preventDefault();
      searchRef.current?.focus();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  function onTabKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    const count = visible.length;
    if (count === 0) return;
    let next: number;
    switch (event.key) {
      case "ArrowDown":
      case "ArrowRight":
        next = (activeIndex + 1) % count;
        break;
      case "ArrowUp":
      case "ArrowLeft":
        next = (activeIndex - 1 + count) % count;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = count - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    const id = visible[next].id;
    select(id);
    tabRefs.current.get(id)?.focus();
  }

  if (entries.length === 0) {
    return (
      <EmptyState
        stateKey="objectionsNone"
        title={tNone("title")}
        reason={tNone("reason")}
        action={{
          label: tNone("cta"),
          icon: Search,
          onClick: () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true })),
        }}
      />
    );
  }

  const tabId = (id: string): string => `${idBase}-tab-${id}`;
  const panelId = `${idBase}-panel`;
  const searchId = `${idBase}-search`;
  const prev = activeIndex > 0 ? visible[activeIndex - 1] : null;
  const next = activeIndex >= 0 && activeIndex < visible.length - 1 ? visible[activeIndex + 1] : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative min-w-0 flex-1">
          <label htmlFor={searchId} className="sr-only">
            {t("searchLabel")}
          </label>
          <Search
            size={15}
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary"
          />
          <input
            ref={searchRef}
            id={searchId}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("searchPlaceholder")}
            autoComplete="off"
            className="w-full rounded-xl border border-border bg-surface py-2.5 pl-9 pr-3 text-[14px] text-primary-dark shadow-softer placeholder:text-text-secondary focus:outline-none focus:ring-2 focus:ring-primary-light"
          />
        </div>
        <span aria-live="polite" className="shrink-0 text-[12px] font-medium tabular-nums text-text-secondary">
          {t("count", { shown: visible.length, total: entries.length })}
        </span>
      </div>

      {active === null ? (
        <EmptyState
          variant="compact"
          title={tFilterEmpty("title")}
          reason={tFilterEmpty("reason")}
          action={{
            label: tFilterEmpty("cta"),
            onClick: () => {
              setQuery("");
              searchRef.current?.focus();
            },
          }}
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)] lg:items-start lg:gap-5">
          <div className="min-w-0 lg:sticky lg:top-[88px]">
            <div
              role="tablist"
              aria-label={t("listLabel")}
              onKeyDown={onTabKeyDown}
              className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 lg:mx-0 lg:max-h-[calc(100vh-88px-72px)] lg:flex-col lg:overflow-y-auto lg:overflow-x-visible lg:px-0"
            >
              {visible.map((entry) => {
                const selected = entry.id === active.id;
                return (
                  <button
                    key={entry.id}
                    ref={(node) => {
                      if (node) tabRefs.current.set(entry.id, node);
                      else tabRefs.current.delete(entry.id);
                    }}
                    type="button"
                    role="tab"
                    id={tabId(entry.id)}
                    aria-selected={selected}
                    aria-controls={panelId}
                    tabIndex={selected ? 0 : -1}
                    onClick={() => select(entry.id)}
                    className={`flex shrink-0 items-start gap-2.5 rounded-xl border px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary lg:w-full lg:py-2.5 ${
                      selected
                        ? "border-primary bg-primary/10"
                        : "border-border bg-surface hover:border-primary/40 hover:bg-surface-alt"
                    }`}
                  >
                    <span
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold tabular-nums ${
                        selected ? "bg-primary text-on-accent" : "bg-surface-alt text-text-secondary"
                      }`}
                    >
                      {numberById.get(entry.id)}
                    </span>
                    <span className="min-w-0 self-center lg:self-start">
                      <span className="block whitespace-nowrap text-[13.5px] font-semibold text-primary-dark lg:whitespace-normal">
                        {entry.label}
                      </span>
                      <span className="mt-0.5 hidden truncate text-[12px] text-text-secondary lg:block">
                        &ldquo;{entry.clientSays}&rdquo;
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="mt-3 hidden px-1 text-[11px] text-text-secondary lg:block">{t("shortcutHint")}</p>
          </div>

          <div role="tabpanel" id={panelId} aria-labelledby={tabId(active.id)} className="min-w-0">
            <ObjectionDetail
              key={active.id}
              entry={active}
              number={numberById.get(active.id) ?? activeIndex + 1}
              total={entries.length}
              onPrev={prev ? () => select(prev.id) : undefined}
              onNext={next ? () => select(next.id) : undefined}
            />
          </div>
        </div>
      )}
    </div>
  );
}
