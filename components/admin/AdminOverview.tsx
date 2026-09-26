import { getTranslations } from "next-intl/server";
import { ArrowRight, Clock, Eye, LayoutGrid, SearchX, Trophy, Users, UsersRound } from "lucide-react";
import { Link } from "@/i18n/routing";
import { EmptyState } from "@/components/EmptyState";
import { RangePicker } from "@/components/dashboard/RangePicker";
import { DashboardWidgetError } from "@/components/dashboard/DashboardWidgetError";
import { AttentionList } from "@/components/admin/AttentionList";
import { OverviewRefresh } from "@/components/admin/OverviewRefresh";
import { RelativeTime } from "@/components/admin/RelativeTime";
import { TopContentTable } from "@/components/admin/TopContentTable";
import { ChartCard } from "@/components/admin/charts/ChartCard";
import { CompareTable, type CompareColumn, type CompareRow } from "@/components/admin/charts/CompareTable";
import { InlineBar } from "@/components/admin/charts/InlineBar";
import { Sparkline } from "@/components/admin/charts/Sparkline";
import { StatCard } from "@/components/admin/charts/StatCard";
import { PersonAvatar } from "@/components/admin/people/PersonAvatar";
import { RoleBadge } from "@/components/admin/people/RoleBadge";
import type { AttentionItem, AttentionSource } from "@/lib/admin/attention";
import { seriesMax } from "@/lib/admin/charts";
import { knowledgeHref, type GapKpi } from "@/lib/admin/knowledge";
import type { ContentSectionStatus } from "@/lib/admin/monitoring-queries";
import { personPath, type PersonOverview, type TopContentItem } from "@/lib/admin/people";
import {
  averagePer,
  displayName,
  hasActivity,
  overviewDeltas,
  overviewPeople,
  overviewTotals,
  toMinutes,
} from "@/lib/admin/overview";
import { formatDuration } from "@/lib/dashboard/format";
import {
  DEFAULT_RANGE_DAYS,
  MONITORING_RANGE_DAYS,
  rangeDayCount,
  rangeSearchParams,
  withSearch,
  type DashboardRange,
} from "@/lib/dashboard/range";
import type { WidgetData } from "@/lib/dashboard/telemetry-window";

export interface AdminOverviewProps {
  locale: string;
  range: DashboardRange;
  /** When the page's data was read (ISO) — "Yangilandi HH:MM" after mount. */
  renderedAt: string;
  current: WidgetData<PersonOverview[]>;
  /** The equal-length window before `range`, for the StatCards' deltas. */
  previous: WidgetData<PersonOverview[]>;
  /** The knowledge-gaps StatCard; null when any of its sources failed. */
  gaps: GapKpi | null;
  attention: { items: readonly AttentionItem[]; skipped: readonly AttentionSource[] };
  topContent: WidgetData<TopContentItem[]>;
  contentStatus: WidgetData<ContentSectionStatus[]>;
}

type Translator = Awaited<ReturnType<typeof getTranslations>>;

interface Formatters {
  num: (value: number) => string;
  duration: (ms: number) => string;
}

function intlLocale(locale: string): string {
  return locale === "ru" ? "ru-RU" : "uz-UZ";
}

/** A card's one "see everything" link (ChartCard's action slot). */
function AllLink({ href, children }: { href: string; children: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 rounded-lg px-1 text-[12.5px] font-medium text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      {children}
      <ArrowRight size={13} aria-hidden="true" />
    </Link>
  );
}

/**
 * "Bosh panel" (/admin, S03 monitoring IA) — one question: how is my team doing
 * and what needs me now? Top to bottom: the header with the range and the
 * refresh stamp; four headline numbers against the window before; the
 * attention list; one team table (who worked how much, used what, when last,
 * and the shape of their days); then the most used materials next to the
 * content's own state. The reads are the page's (one Promise.all); this only
 * lays them out. Every widget fails and empties on its own (CLAUDE.md §15): a
 * failed read renders DashboardWidgetError in that widget's slot, no people or
 * no events an EmptyState — never a silent zero.
 */
export async function AdminOverview({
  locale,
  range,
  renderedAt,
  current,
  previous,
  gaps,
  attention,
  topContent,
  contentStatus,
}: AdminOverviewProps) {
  const [t, tNav, tRoles, tDuration] = await Promise.all([
    getTranslations("pages.admin.overview"),
    getTranslations("admin.nav"),
    getTranslations("pages.admin.users.roles"),
    getTranslations("dashboard.duration"),
  ]);

  const numbers = new Intl.NumberFormat(intlLocale(locale));
  const format: Formatters = {
    num: (value) => numbers.format(value),
    duration: (ms) => formatDuration(ms, tDuration),
  };

  // Links elsewhere open on this page's window: the knowledge page shares the
  // monitoring default, a person's page has a shorter one of its own.
  const knowledgeSearch = rangeSearchParams(range, MONITORING_RANGE_DAYS).toString();
  const personParams = rangeSearchParams(range, DEFAULT_RANGE_DAYS);

  const people = current.ok ? overviewPeople(current.data) : [];
  const active = hasActivity(people);

  const noEvents = (
    <EmptyState
      variant="compact"
      stateKey="dashboardNoEvents"
      title={t("empty.noEvents.title")}
      reason={t("empty.noEvents.reason")}
    />
  );

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-[24px] font-bold text-primary-dark">{t("title")}</h1>
            <p className="mt-1 text-[13px] text-text-secondary">{t("description")}</p>
          </div>
          <OverviewRefresh renderedAt={renderedAt} />
        </div>
        <RangePicker range={range} basePath="/admin" />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {current.ok ? (
          <PeopleStats
            people={current.data}
            previous={previous.ok ? previous.data : null}
            knowledgeSearch={knowledgeSearch}
            t={t}
            format={format}
          />
        ) : (
          <div className="sm:col-span-2 xl:col-span-3">
            <DashboardWidgetError />
          </div>
        )}
        {gaps ? (
          <StatCard
            icon={SearchX}
            label={t("kpi.gaps")}
            value={format.num(gaps.total)}
            caption={t("kpi.gapsCaption", {
              searches: format.num(gaps.searches),
              feedback: format.num(gaps.feedback),
              copilot: format.num(gaps.copilot),
            })}
            delta={{ value: gaps.delta, unit: "%", better: "down" }}
            href={knowledgeHref(knowledgeSearch, "gaps")}
          />
        ) : (
          <DashboardWidgetError />
        )}
      </div>

      <AttentionList items={attention.items} skipped={attention.skipped} />

      <ChartCard
        id="team"
        icon={UsersRound}
        title={t("team.title")}
        description={t("team.description")}
        action={<AllLink href="/admin/users">{t("team.all")}</AllLink>}
      >
        {!current.ok ? (
          <DashboardWidgetError />
        ) : people.length === 0 ? (
          <EmptyState
            variant="compact"
            stateKey="dashboardNoOperators"
            title={t("empty.noPeople.title")}
            reason={t("empty.noPeople.reason")}
            action={{ label: t("empty.noPeople.cta"), href: "/admin/users" }}
          />
        ) : (
          <div className="space-y-3">
            {!active && noEvents}
            <CompareTable
              caption={t("team.title")}
              columns={teamColumns(t, rangeDayCount(range))}
              rows={teamRows(people, { t, tRoles, format, personParams, days: rangeDayCount(range) })}
              defaultSort={{ key: "activeTime", direction: "desc" }}
            />
          </div>
        )}
      </ChartCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          icon={Trophy}
          title={t("topContent.title")}
          description={t("topContent.descriptionShort")}
          action={<AllLink href={knowledgeHref(knowledgeSearch, "usage")}>{t("topContent.all")}</AllLink>}
        >
          {!topContent.ok ? (
            <DashboardWidgetError />
          ) : topContent.data.length === 0 ? (
            noEvents
          ) : (
            <TopContentTable items={topContent.data} variant="compact" />
          )}
        </ChartCard>

        <ChartCard
          icon={LayoutGrid}
          title={t("contentStatus.title")}
          description={t("contentStatus.description")}
          action={<AllLink href={knowledgeHref("", "health")}>{t("contentStatus.all")}</AllLink>}
        >
          {!contentStatus.ok ? (
            <DashboardWidgetError />
          ) : (
            <ul className="divide-y divide-border">
              {contentStatus.data.map(({ item, counts }) => {
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    >
                      <Icon size={15} aria-hidden="true" className="shrink-0 text-text-secondary" />
                      <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-primary-dark">
                        {tNav(`items.${item.label}`)}
                      </span>
                      <span className="shrink-0 text-[12.5px] tabular-nums text-text-secondary">
                        {t("contentStatus.published", { count: counts.total - counts.draft })}
                      </span>
                      {counts.draft > 0 && (
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-status-warning/15 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-primary-dark">
                          <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-status-warning" />
                          {t("drafts", { count: counts.draft })}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </ChartCard>
      </div>
    </div>
  );
}

/** The three people numbers, each against the equal-length window before. */
function PeopleStats({
  people,
  previous,
  knowledgeSearch,
  t,
  format,
}: {
  people: readonly PersonOverview[];
  previous: readonly PersonOverview[] | null;
  knowledgeSearch: string;
  t: Translator;
  format: Formatters;
}) {
  const totals = overviewTotals(people);
  const deltas = overviewDeltas(totals, previous ? overviewTotals(previous) : null);
  const average = averagePer(totals.activeMs, totals.activePeople);

  return (
    <>
      <StatCard
        icon={Users}
        label={t("kpi.activePeople")}
        value={format.num(totals.activePeople)}
        caption={t("kpi.activePeopleCaption", {
          active: format.num(totals.activePeople),
          total: format.num(totals.people),
        })}
        delta={{ value: deltas.activePeople, unit: "abs" }}
        href="/admin/users"
      />
      <StatCard
        icon={Clock}
        label={t("kpi.activeTime")}
        value={format.duration(totals.activeMs)}
        caption={average === null ? t("kpi.noActive") : t("kpi.perActive", { value: format.duration(average) })}
        delta={{ value: deltas.activeMs, unit: "%" }}
      />
      <StatCard
        icon={Eye}
        label={t("kpi.views")}
        value={format.num(totals.contentViews)}
        caption={t("kpi.viewsCaption", { copies: format.num(totals.copies) })}
        delta={{ value: deltas.contentViews, unit: "%" }}
        href={knowledgeHref(knowledgeSearch, "usage")}
      />
    </>
  );
}

function teamColumns(t: Translator, days: number): CompareColumn[] {
  return [
    { key: "person", header: t("team.columns.person"), sortable: true, firstDirection: "asc" },
    { key: "activeTime", header: t("team.columns.activeTime"), align: "right", sortable: true },
    {
      key: "activeDays",
      header: t("team.columns.activeDays"),
      hint: t("team.columns.activeDaysHint", { days }),
      align: "right",
      sortable: true,
    },
    {
      key: "usage",
      header: t("team.columns.usage"),
      hint: t("team.columns.usageHint"),
      align: "right",
      sortable: true,
    },
    { key: "lastSeen", header: t("team.columns.lastSeen"), align: "right", sortable: true },
    { key: "trend", header: t("team.columns.trend"), hint: t("team.columns.trendHint"), align: "right" },
  ];
}

function teamRows(
  people: readonly PersonOverview[],
  {
    t,
    tRoles,
    format,
    personParams,
    days,
  }: { t: Translator; tRoles: Translator; format: Formatters; personParams: URLSearchParams; days: number }
): CompareRow[] {
  const maxActive = seriesMax(people.map((person) => person.activeMs));
  const maxUsage = seriesMax(people.map((person) => person.contentViews + person.copies));

  return people.map((person) => {
    const name = displayName(person);
    const minutes = person.daily.map((day) => toMinutes(day.activeMs));
    const usage = person.contentViews + person.copies;

    return {
      key: person.email,
      href: withSearch(personPath(person.email), personParams),
      cells: {
        person: {
          sortValue: name,
          content: (
            <span className="flex min-w-0 items-center gap-2.5">
              <PersonAvatar fullName={person.fullName} email={person.email} size="sm" muted={!person.isActive} />
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="max-w-full truncate font-semibold text-primary-dark">{name}</span>
                  <RoleBadge role={person.role} label={tRoles(person.role)} />
                  {!person.isActive && (
                    <span className="shrink-0 rounded-full bg-status-outdated/15 px-2 py-0.5 text-[11px] font-semibold text-primary-dark">
                      {t("team.inactive")}
                    </span>
                  )}
                </span>
                {name !== person.email && (
                  <span className="truncate text-[12px] text-text-secondary">{person.email}</span>
                )}
              </span>
            </span>
          ),
        },
        activeTime: {
          sortValue: person.activeMs,
          content: (
            <InlineBar value={person.activeMs} max={maxActive} tone="green">
              {format.duration(person.activeMs)}
            </InlineBar>
          ),
        },
        activeDays: { sortValue: person.activeDays, content: format.num(person.activeDays) },
        usage: {
          sortValue: usage,
          content: (
            <InlineBar value={usage} max={maxUsage} tone="blue">
              {t("team.usageValue", { views: format.num(person.contentViews), copies: format.num(person.copies) })}
            </InlineBar>
          ),
        },
        lastSeen: {
          sortValue: person.lastSeenAt ? Date.parse(person.lastSeenAt) : null,
          content: (
            <span className="text-text-secondary">
              {person.lastSeenAt ? <RelativeTime iso={person.lastSeenAt} /> : t("team.never")}
            </span>
          ),
        },
        trend: {
          sortValue: null,
          content: (
            <Sparkline
              values={minutes}
              label={t("team.trendLabel", {
                name,
                days: minutes.length || days,
                values: minutes.map((value) => format.num(value)).join(", "),
              })}
            />
          ),
        },
      },
    };
  });
}
