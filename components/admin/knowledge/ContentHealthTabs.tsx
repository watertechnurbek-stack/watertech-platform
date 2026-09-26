"use client";

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import type { HealthSegment } from "@/lib/admin/knowledge";

export interface HealthTab {
  id: HealthSegment;
  label: string;
  /** Rows in the whole list, not only the ones the panel shows. */
  count: number;
  /** Rendered on the server — rows, quick actions, the empty state. */
  panel: ReactNode;
}

export interface ContentHealthTabsProps {
  tabs: readonly HealthTab[];
  /** From `?health=` on the server, so a link can open a given list. */
  initial: HealthSegment;
  /** Accessible name of the tab list. */
  label: string;
}

/**
 * The content-health card's segmented control: drafts · stale · missing RU as
 * one WAI-ARIA tab list (arrow keys, Home/End, roving tabindex) over three
 * panels the server already rendered — switching is only a `hidden` swap, no
 * request. The choice is mirrored to `?health=` with history.replaceState (the
 * same route with other search params must not start a server render,
 * CLAUDE.md §4), so a reload or a shared link reopens the same list.
 */
export function ContentHealthTabs({ tabs, initial, label }: ContentHealthTabsProps) {
  const idBase = useId();
  const [selected, setSelected] = useState<HealthSegment>(initial);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  function select(id: HealthSegment) {
    setSelected(id);
    const url = new URL(window.location.href);
    url.searchParams.set("health", id);
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const index = tabs.findIndex((tab) => tab.id === selected);
    const count = tabs.length;
    let next: number;
    switch (event.key) {
      case "ArrowRight":
        next = (index + 1) % count;
        break;
      case "ArrowLeft":
        next = (index - 1 + count) % count;
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
    const tab = tabs[next];
    if (!tab) return;
    select(tab.id);
    tabRefs.current[next]?.focus();
  }

  return (
    <div className="space-y-3">
      <div
        role="tablist"
        aria-label={label}
        onKeyDown={onKeyDown}
        className="inline-flex max-w-full gap-0.5 overflow-x-auto rounded-lg border border-border bg-surface p-0.5"
      >
        {tabs.map((tab, index) => {
          const active = tab.id === selected;
          return (
            <button
              key={tab.id}
              ref={(node) => {
                tabRefs.current[index] = node;
              }}
              type="button"
              role="tab"
              id={`${idBase}-tab-${tab.id}`}
              aria-selected={active}
              aria-controls={`${idBase}-panel-${tab.id}`}
              tabIndex={active ? 0 : -1}
              onClick={() => select(tab.id)}
              className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-1.5 text-[12.5px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                active ? "bg-primary/10 text-primary-dark" : "text-text-secondary hover:bg-surface-alt"
              }`}
            >
              {tab.label}
              <span className="rounded-full bg-surface-alt px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-primary-dark">
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      {tabs.map((tab) => (
        <div
          key={tab.id}
          role="tabpanel"
          id={`${idBase}-panel-${tab.id}`}
          aria-labelledby={`${idBase}-tab-${tab.id}`}
          hidden={tab.id !== selected}
        >
          {tab.panel}
        </div>
      ))}
    </div>
  );
}
