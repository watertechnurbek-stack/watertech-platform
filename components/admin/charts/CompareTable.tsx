"use client";

import { memo, useCallback, useMemo, useState, type MouseEvent, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { useLocale } from "next-intl";
import { Link, useRouter } from "@/i18n/routing";

export type SortDirection = "asc" | "desc";

export interface CompareColumn {
  key: string;
  header: string;
  /** A second, smaller header line — the unit or the window ("daq / kun",
   * "oxirgi 14 kun"), so a cell can stay a bare number. */
  hint?: string;
  align?: "left" | "right";
  sortable?: boolean;
  /** Direction a first click on this header sorts in — "desc" suits numbers
   * (largest first), "asc" names. Defaults to "desc". */
  firstDirection?: SortDirection;
}

/** One cell. Server pages build the table, and a function cannot cross the
 * Server → Client boundary, so each column's "render" happens on the server:
 * `content` is the rendered cell, `sortValue` what the column sorts by. */
export interface CompareCell {
  content: ReactNode;
  /** null sorts last in both directions ("no data" is never "the least"). */
  sortValue: number | string | null;
}

export interface CompareRow {
  /** Stable React key (an email). */
  key: string;
  /** Where the row leads; the first cell becomes a link to it. */
  href?: string;
  cells: Readonly<Record<string, CompareCell>>;
}

export interface CompareTableProps {
  columns: readonly CompareColumn[];
  rows: readonly CompareRow[];
  /** Accessible name of the table and its scroll region. */
  caption: string;
  defaultSort?: { key: string; direction: SortDirection };
}

interface SortState {
  key: string;
  direction: SortDirection;
}

function compareValues(
  a: CompareCell["sortValue"],
  b: CompareCell["sortValue"],
  direction: SortDirection,
  collator: Intl.Collator
): number {
  if (a === null || b === null) return a === b ? 0 : a === null ? 1 : -1;
  const order = typeof a === "number" && typeof b === "number" ? a - b : collator.compare(String(a), String(b));
  return direction === "asc" ? order : -order;
}

/** Many rows across many metrics (CLAUDE.md §15). Sorting is client-side over
 * the rows given; ties keep the order the server sent. The first column is
 * the row header and sticks to the left edge while the table scrolls
 * sideways (phones), and holds the row's link — Tab reaches every row through
 * it and Enter follows it; a click anywhere else on the row does the same. */
export function CompareTable({ columns, rows, caption, defaultSort }: CompareTableProps) {
  const locale = useLocale();
  const router = useRouter();
  const [sort, setSort] = useState<SortState | null>(defaultSort ?? null);

  const collator = useMemo(() => new Intl.Collator(locale === "ru" ? "ru-RU" : "uz-UZ"), [locale]);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    return rows
      .map((row, index) => ({ row, index }))
      .sort(
        (a, b) =>
          compareValues(
            a.row.cells[sort.key]?.sortValue ?? null,
            b.row.cells[sort.key]?.sortValue ?? null,
            sort.direction,
            collator
          ) || a.index - b.index
      )
      .map(({ row }) => row);
  }, [rows, sort, collator]);

  const navigate = useCallback((href: string) => router.push(href), [router]);

  function toggleSort(column: CompareColumn) {
    setSort((current) =>
      current?.key === column.key
        ? { key: column.key, direction: current.direction === "asc" ? "desc" : "asc" }
        : { key: column.key, direction: column.firstDirection ?? "desc" }
    );
  }

  return (
    <div
      role="region"
      aria-label={caption}
      tabIndex={0}
      className="overflow-x-auto rounded-xl border border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <table className="w-full min-w-[56rem] border-collapse text-left text-[13px]">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-border bg-surface-alt">
            {columns.map((column, index) => {
              const active = sort?.key === column.key;
              const ariaSort = !column.sortable
                ? undefined
                : active
                  ? sort.direction === "asc"
                    ? "ascending"
                    : "descending"
                  : "none";
              const SortIcon = !active ? ArrowUpDown : sort.direction === "asc" ? ArrowUp : ArrowDown;
              const label = column.hint ? (
                <span className={`flex flex-col ${column.align === "right" ? "items-end" : "items-start"}`}>
                  <span>{column.header}</span>
                  <span className="text-[11px] font-normal">{column.hint}</span>
                </span>
              ) : (
                column.header
              );
              return (
                <th
                  key={column.key}
                  scope="col"
                  aria-sort={ariaSort}
                  className={`whitespace-nowrap px-3 py-2.5 text-[12px] font-semibold text-text-secondary ${
                    column.align === "right" ? "text-right" : "text-left"
                  } ${index === 0 ? "sticky left-0 z-20 bg-surface-alt" : ""}`}
                >
                  {column.sortable ? (
                    <button
                      type="button"
                      onClick={() => toggleSort(column)}
                      className={`inline-flex items-center gap-1 rounded-lg px-1 py-0.5 transition-colors hover:text-primary-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                        column.align === "right" ? "flex-row-reverse" : ""
                      } ${active ? "text-primary-dark" : ""}`}
                    >
                      {label}
                      <SortIcon size={13} aria-hidden="true" className={active ? "" : "opacity-50"} />
                    </button>
                  ) : (
                    label
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <CompareTableRow key={row.key} row={row} columns={columns} onNavigate={navigate} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

const CompareTableRow = memo(function CompareTableRow({
  row,
  columns,
  onNavigate,
}: {
  row: CompareRow;
  columns: readonly CompareColumn[];
  onNavigate: (href: string) => void;
}) {
  const { href } = row;

  function handleClick(event: MouseEvent<HTMLTableRowElement>) {
    if (!href) return;
    // The link (and any control in a cell) handles its own click.
    if (event.target instanceof Element && event.target.closest("a, button")) return;
    onNavigate(href);
  }

  return (
    <tr
      onClick={handleClick}
      className={`group border-b border-border bg-surface last:border-0 hover:bg-surface-alt focus-within:bg-surface-alt ${
        href ? "cursor-pointer" : ""
      }`}
    >
      {columns.map((column, index) => {
        const content = row.cells[column.key]?.content ?? null;
        const align = column.align === "right" ? "text-right tabular-nums" : "text-left";
        if (index === 0) {
          return (
            <th
              key={column.key}
              scope="row"
              className="sticky left-0 z-10 max-w-[10.5rem] bg-surface sm:max-w-[16rem] px-3 py-2.5 text-left font-normal group-focus-within:bg-surface-alt group-hover:bg-surface-alt"
            >
              {href ? (
                <Link
                  href={href}
                  className="block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  {content}
                </Link>
              ) : (
                content
              )}
            </th>
          );
        }
        return (
          <td key={column.key} className={`whitespace-nowrap px-3 py-2.5 text-primary-dark ${align}`}>
            {content}
          </td>
        );
      })}
    </tr>
  );
});
