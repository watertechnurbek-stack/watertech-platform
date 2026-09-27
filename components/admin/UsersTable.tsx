"use client";

import { useEffect, useId, useMemo, useState, useTransition } from "react";
import dynamic from "next/dynamic";
import { ArrowUpDown, Lock, Search, ShieldCheck } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/routing";
import { EmptyState } from "@/components/EmptyState";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import type { RemovePersonTarget } from "@/components/admin/people/RemovePersonDialog";
import { setActive, setRole } from "@/lib/admin/actions/users";
import { formatRelative } from "@/lib/admin/format";
import { personPath } from "@/lib/admin/people";
import type { OnboardingProgress } from "@/lib/admin/directory";
import {
  ASSIGNABLE_ROLES,
  USER_ROLES,
  isAssignableRole,
  isUserRole,
  type AdminUser,
  type AssignableRole,
  type UserRole,
} from "@/lib/admin/users";
import type { ActionResult } from "@/lib/admin/errors";
import { useActionError } from "@/hooks/useActionError";
import { useMounted } from "@/hooks/useMounted";
import { useOnline } from "@/hooks/useOnline";
import { useToast } from "@/hooks/useToast";

// Only mounted once "add" is pressed, and not the page's main content.
const AddUserDialog = dynamic(() => import("@/components/admin/AddUserDialog").then((m) => m.AddUserDialog), {
  ssr: false,
});

// Only mounted once a row's "Remove" is pressed.
const RemovePersonDialog = dynamic(
  () => import("@/components/admin/people/RemovePersonDialog").then((m) => m.RemovePersonDialog),
  { ssr: false }
);

type RoleFilter = "all" | UserRole;
type StatusFilter = "all" | "active" | "inactive";
type SortKey = "email" | "fullName" | "lastActivityAt";

/** An activate/deactivate waiting for the admin's confirmation. */
interface PendingToggle {
  email: string;
  name: string;
  role: UserRole;
  next: boolean;
}

interface RunOptions {
  success: string;
  onFailure?: () => void;
  onSettled?: () => void;
}

const FILTER_SELECT_CLASS =
  "rounded-lg border border-border bg-surface-alt px-3 py-2 text-[13px] text-primary-dark focus:outline-none focus:ring-2 focus:ring-primary-light";

function compareUsers(a: AdminUser, b: AdminUser, key: SortKey): number {
  if (key === "lastActivityAt") {
    // Never-active rows sort after every dated one, in either direction's base order.
    if (a.lastActivityAt === b.lastActivityAt) return 0;
    if (a.lastActivityAt === null) return 1;
    if (b.lastActivityAt === null) return -1;
    return a.lastActivityAt.localeCompare(b.lastActivityAt);
  }
  return (a[key] ?? "").localeCompare(b[key] ?? "");
}

/**
 * The allow-list as a table: search, role and status filters, an inline role
 * select (operator ↔ manager), activate/deactivate behind a ConfirmDialog
 * that says what happens right away, and "remove" behind RemovePersonDialog
 * (0022: the typed email, the optional history purge). Admin rows — the
 * caller's own included — are read-only here: they carry an Admin badge, their
 * controls are disabled, they get no remove action at all, and a note under
 * the table says why. The database refuses any API change to an admin row
 * anyway (0020, WT462), and a self-demotion or self-removal too (WT461), so
 * offering either would only produce an error.
 *
 * Every write re-validates on the server and again in SQL; nothing this
 * component disables is a protection, only a courtesy.
 *
 * The onboarding column is each person's checklist progress when the rows
 * carry it (the directory joins it in: `onboarding`), "—" for the admin, who
 * has no checklist, or when it could not be read.
 *
 * The email is a link to the person's page (/admin/users/[email]). Inside the
 * people directory the table is its "Jadval" view: `hideToolbar` drops its own
 * search, filters and add button, because the directory's tabs, search box and
 * add button already filtered `users` and opened the dialog — one set of
 * controls per page.
 */
export function UsersTable({
  users,
  currentEmail,
  hideToolbar = false,
}: {
  users: (AdminUser & { onboarding?: OnboardingProgress | null })[];
  currentEmail: string;
  hideToolbar?: boolean;
}) {
  const router = useRouter();
  const mounted = useMounted();
  const online = useOnline();
  const locale = useLocale();
  const { toast } = useToast();
  const describeError = useActionError();
  const t = useTranslations("pages.admin.users");
  const tRemove = useTranslations("pages.admin.people.remove");
  const tToast = useTranslations("toast");
  const tFilter = useTranslations("common.table");
  const tFilterEmpty = useTranslations("emptyState.filterNoMatch");
  const tRel = useTranslations("admin.relativeTime");
  const adminNoteId = useId();
  const selfNoteId = useId();

  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 } | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  // Kept mounted after the first open so the dialog's exit animation can run.
  const [addMounted, setAddMounted] = useState(false);
  const [confirm, setConfirm] = useState<PendingToggle | null>(null);
  // The row being removed; it outlives `removeOpen` so the dialog's text does
  // not blank while it animates out.
  const [removeTarget, setRemoveTarget] = useState<RemovePersonTarget | null>(null);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [removeMounted, setRemoveMounted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  // The role a select was just changed to, shown until the refreshed rows
  // arrive — otherwise the select snaps back to the old role mid-save.
  const [roleOverrides, setRoleOverrides] = useState<Record<string, AssignableRole>>({});

  useEffect(() => {
    setRoleOverrides({});
  }, [users]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const out = users.filter(
      (user) =>
        (roleFilter === "all" || user.role === roleFilter) &&
        (statusFilter === "all" || user.isActive === (statusFilter === "active")) &&
        (!needle || user.email.toLowerCase().includes(needle) || (user.fullName ?? "").toLowerCase().includes(needle))
    );
    if (!sort) return out;
    return [...out].sort((a, b) => compareUsers(a, b, sort.key) * sort.dir);
  }, [users, query, roleFilter, statusFilter, sort]);

  const filtersActive = query !== "" || roleFilter !== "all" || statusFilter !== "all";
  // The notes the locked controls point at, rendered only while such a row is
  // on screen so no aria-describedby names a missing element.
  const showAdminNote = visible.some((user) => user.role === "admin");
  const showSelfNote = visible.some((user) => user.role !== "admin" && user.email.toLowerCase() === currentEmail);

  function resetFilters() {
    setQuery("");
    setRoleFilter("all");
    setStatusFilter("all");
  }

  function toggleSort(key: SortKey) {
    setSort((prev) => (prev?.key === key ? { key, dir: prev.dir === 1 ? -1 : 1 } : { key, dir: 1 }));
  }

  function guardOnline(): boolean {
    if (online) return true;
    toast({ kind: "error", title: tToast("offline") });
    return false;
  }

  function run(email: string, action: () => Promise<ActionResult>, options: RunOptions) {
    setPendingEmail(email);
    setError(null);
    startTransition(async () => {
      const result = await action();
      setPendingEmail(null);
      options.onSettled?.();
      if (!result.ok) {
        options.onFailure?.();
        const { title } = describeError(result);
        setError(title);
        toast({ kind: "error", title });
        // The allow-list row did change; only the Supabase Auth half needs a
        // retry, and the table should show the row as it now is.
        if (result.code === "auth_sync_failed") router.refresh();
        return;
      }
      toast({ kind: "success", title: options.success });
      router.refresh();
    });
  }

  function changeRole(user: AdminUser, value: string) {
    if (user.role === "admin" || !isAssignableRole(value) || value === user.role) return;
    if (!guardOnline()) return;
    setRoleOverrides((prev) => ({ ...prev, [user.email]: value }));
    run(user.email, () => setRole(user.email, value), {
      success: t("toastRoleChanged"),
      onFailure: () =>
        setRoleOverrides((prev) => {
          const rest = { ...prev };
          delete rest[user.email];
          return rest;
        }),
    });
  }

  function confirmToggle() {
    if (!confirm || !guardOnline()) return;
    const { email, next } = confirm;
    run(email, () => setActive(email, next), {
      success: next ? t("toastActivated") : t("toastDeactivated"),
      onSettled: () => setConfirm(null),
    });
  }

  function openAdd() {
    setAddMounted(true);
    setAddOpen(true);
  }

  function openRemove(user: AdminUser) {
    setError(null);
    setRemoveTarget({ email: user.email, name: user.fullName?.trim() || user.email });
    setRemoveMounted(true);
    setRemoveOpen(true);
  }

  function sortHeader(key: SortKey, label: string) {
    return (
      <button type="button" onClick={() => toggleSort(key)} className="flex items-center gap-1 hover:text-primary">
        {label}
        <ArrowUpDown size={11} className="opacity-60" />
      </button>
    );
  }

  return (
    <div className="space-y-3">
      {error && (
        <div
          role="alert"
          className="rounded-xl border border-status-outdated/40 bg-status-outdated/10 px-4 py-2.5 text-[13px] text-primary-dark"
        >
          {error}
        </div>
      )}

      {!hideToolbar && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[180px] flex-1">
            <Search
              size={14}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary"
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={tFilter("filterPlaceholder")}
              aria-label={tFilter("filterPlaceholder")}
              className="w-full rounded-lg border border-border bg-surface-alt py-2 pl-8 pr-3 text-[13px] text-primary-dark placeholder:text-text-secondary focus:outline-none focus:ring-2 focus:ring-primary-light"
            />
          </div>
          <select
            value={roleFilter}
            onChange={(e) => {
              const value = e.target.value;
              setRoleFilter(isUserRole(value) ? value : "all");
            }}
            aria-label={t("filters.role")}
            className={FILTER_SELECT_CLASS}
          >
            <option value="all">{t("filters.allRoles")}</option>
            {USER_ROLES.map((role) => (
              <option key={role} value={role}>
                {t(`roles.${role}`)}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => {
              const value = e.target.value;
              setStatusFilter(value === "active" || value === "inactive" ? value : "all");
            }}
            aria-label={t("filters.status")}
            className={FILTER_SELECT_CLASS}
          >
            <option value="all">{t("filters.allStatuses")}</option>
            <option value="active">{t("status.active")}</option>
            <option value="inactive">{t("status.inactive")}</option>
          </select>
          <button
            type="button"
            onClick={openAdd}
            className="shrink-0 rounded-lg bg-primary px-3.5 py-2 text-[13px] font-medium text-surface transition-colors hover:bg-accent-hover"
          >
            {t("add")}
          </button>
        </div>
      )}

      {visible.length === 0 ? (
        <EmptyState
          variant="compact"
          title={tFilterEmpty("title")}
          reason={tFilterEmpty("reason")}
          action={filtersActive ? { label: tFilterEmpty("cta"), onClick: resetFilters } : undefined}
        />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-surface shadow-soft">
          <table className="w-full min-w-[880px] text-left text-[13px]">
            <thead>
              <tr className="border-b border-border bg-surface-alt/60">
                <th className="px-4 py-2.5 font-semibold text-primary-dark">{sortHeader("email", t("columns.email"))}</th>
                <th className="px-4 py-2.5 font-semibold text-primary-dark">{sortHeader("fullName", t("columns.name"))}</th>
                <th className="px-4 py-2.5 font-semibold text-primary-dark">{t("columns.role")}</th>
                <th className="px-4 py-2.5 font-semibold text-primary-dark">{t("columns.status")}</th>
                <th className="px-4 py-2.5 font-semibold text-primary-dark">
                  {sortHeader("lastActivityAt", t("columns.lastActivity"))}
                </th>
                <th className="px-4 py-2.5 font-semibold text-primary-dark">{t("columns.onboarding")}</th>
                <th className="w-48 px-4 py-2.5 font-semibold text-primary-dark">{t("columns.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((user) => {
                const isSelf = user.email.toLowerCase() === currentEmail;
                const isAdminRow = user.role === "admin";
                // An admin row is SQL-editor-only (WT462); the caller's own row
                // could not be demoted or deactivated here either (WT461).
                const locked = isAdminRow || isSelf;
                const lockNoteId = isAdminRow ? adminNoteId : isSelf ? selfNoteId : undefined;
                const lockTitle = isAdminRow ? t("adminLocked") : isSelf ? t("selfLocked") : undefined;
                // An admin row's select shows its role and nothing to change it to.
                const roleOptions: readonly UserRole[] = isAdminRow ? [user.role] : ASSIGNABLE_ROLES;
                const busy = pending && pendingEmail === user.email;
                const displayName = user.fullName ?? user.email;
                return (
                  <tr key={user.email} className="border-b border-border last:border-0 hover:bg-primary/5">
                    <td className="px-4 py-2.5">
                      <Link
                        href={personPath(user.email)}
                        className="font-medium text-primary-dark hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      >
                        {user.email}
                      </Link>
                      {isSelf && (
                        <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                          {t("you")}
                        </span>
                      )}
                      {isAdminRow && (
                        <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                          <ShieldCheck size={11} aria-hidden="true" />
                          {t("roles.admin")}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-text-secondary">{user.fullName ?? "—"}</td>
                    <td className="px-4 py-2.5">
                      <select
                        value={isAdminRow ? user.role : roleOverrides[user.email] ?? user.role}
                        onChange={(e) => changeRole(user, e.target.value)}
                        disabled={locked || busy}
                        aria-label={t("roleSelectLabel", { email: user.email })}
                        aria-describedby={lockNoteId}
                        title={lockTitle}
                        className="rounded-lg border border-border bg-surface-alt px-2 py-1 text-[12.5px] text-primary-dark focus:outline-none focus:ring-2 focus:ring-primary-light disabled:opacity-60"
                      >
                        {roleOptions.map((role) => (
                          <option key={role} value={role}>
                            {t(`roles.${role}`)}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-2.5">
                      {/* text-primary-dark, not text-status-*: the tinted status
                          text is 2.9–3.1:1 in the light theme (docs/AUDIT.md,
                          finding 9), and this word is what the admin reads. */}
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold text-primary-dark ${
                          user.isActive ? "bg-status-ok/15" : "bg-status-outdated/15"
                        }`}
                      >
                        {user.isActive ? t("status.active") : t("status.inactive")}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-text-secondary">
                      {!mounted
                        ? "—"
                        : user.lastActivityAt
                          ? formatRelative(user.lastActivityAt, tRel, locale)
                          : t("noActivity")}
                    </td>
                    <td className="px-4 py-2.5 tabular-nums">
                      {/* Operators and sales managers work through the same
                          onboarding checklist; the admin has none. */}
                      {!isAdminRow && user.onboarding ? (
                        <span className="text-primary-dark">
                          {t("onboardingValue", {
                            completed: user.onboarding.completed,
                            total: user.onboarding.total,
                          })}
                        </span>
                      ) : (
                        <span className="text-text-secondary">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() =>
                            setConfirm({ email: user.email, name: displayName, role: user.role, next: !user.isActive })
                          }
                          disabled={locked || busy}
                          aria-describedby={lockNoteId}
                          title={lockTitle}
                          className={`rounded-lg border border-border bg-surface px-2 py-1 text-[11px] font-medium text-text-secondary transition-colors disabled:opacity-50 ${
                            user.isActive
                              ? "hover:bg-status-outdated/10 hover:text-status-outdated"
                              : "hover:bg-surface-alt hover:text-accent"
                          }`}
                        >
                          {user.isActive ? t("deactivate") : t("activate")}
                        </button>
                        {/* Never on a locked row: an admin row is SQL-editor-only
                            (WT462) and the caller's own row is theirs (WT461). */}
                        {!locked && (
                          <button
                            type="button"
                            onClick={() => openRemove(user)}
                            disabled={busy}
                            aria-label={tRemove("actionLabel", { email: user.email })}
                            className="rounded-lg border border-status-outdated/40 bg-surface px-2 py-1 text-[11px] font-medium text-primary-dark transition-colors hover:bg-status-outdated/10 disabled:opacity-50"
                          >
                            {tRemove("action")}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showAdminNote && (
        <p id={adminNoteId} className="flex items-center gap-1.5 text-[12px] text-text-secondary">
          <Lock size={12} aria-hidden="true" className="shrink-0" />
          {t("adminLocked")}
        </p>
      )}
      {showSelfNote && (
        <span id={selfNoteId} className="sr-only">
          {t("selfLocked")}
        </span>
      )}

      <ConfirmDialog
        open={confirm !== null}
        title={confirm?.next ? t("activateTitle") : t("deactivateTitle")}
        description={
          confirm
            ? confirm.next
              ? t("activateDescription", { name: confirm.name, role: t(`roles.${confirm.role}`) })
              : t("deactivateDescription", { name: confirm.name })
            : ""
        }
        confirmLabel={confirm?.next ? t("activate") : t("deactivate")}
        tone={confirm?.next ? "primary" : "danger"}
        pending={pending && pendingEmail === confirm?.email}
        onConfirm={confirmToggle}
        onCancel={() => setConfirm(null)}
      />

      {addMounted && <AddUserDialog open={addOpen} onClose={() => setAddOpen(false)} />}

      {removeMounted && (
        <RemovePersonDialog
          open={removeOpen}
          person={removeTarget}
          onClose={() => setRemoveOpen(false)}
          onRemoved={() => {
            setRemoveOpen(false);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
