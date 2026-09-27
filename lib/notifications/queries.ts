import "server-only";
import { createClient } from "@/lib/supabase/server";
import { narrowColumn } from "@/lib/content/db";
import {
  notificationKindSchema,
  notificationSeveritySchema,
  type NotificationKind,
  type NotificationRow,
} from "@/lib/notifications/types";
import type { Tables } from "@/lib/supabase/typed";

// Session client, never the admin client: RLS (0007_notifications_and_gate.sql)
// lets only managers read admin_notifications, so an operator session simply
// gets no rows instead of this code having to re-check the role.

/** A failed admin_notifications query. Its own class so a caller can degrade
 * on exactly this and still let Next.js control-flow errors (the dynamic-
 * rendering bailout cookies() throws during static generation, redirects)
 * propagate untouched. */
export class NotificationsQueryError extends Error {
  constructor(message: string) {
    super(`admin_notifications: ${message}`);
    this.name = "NotificationsQueryError";
  }
}

function toNotificationRow(row: Tables<"admin_notifications">): NotificationRow {
  return {
    ...row,
    kind: narrowColumn(notificationKindSchema, row.kind, "scan_summary", "kind", String(row.id)),
    severity: narrowColumn(notificationSeveritySchema, row.severity, "info", "severity", String(row.id)),
  };
}

/** Unread first (read_at nulls first), newest first within each group —
 * matches the admin_notifications_read_created_idx index. */
export async function listNotifications({
  unreadOnly,
  limit,
}: {
  unreadOnly: boolean;
  limit: number;
}): Promise<NotificationRow[]> {
  let query = createClient()
    .from("admin_notifications")
    .select("*")
    .order("read_at", { ascending: true, nullsFirst: true })
    .order("created_at", { ascending: false })
    .limit(limit);
  if (unreadOnly) query = query.is("read_at", null);

  const { data, error } = await query;
  if (error) throw new NotificationsQueryError(error.message);
  return data.map(toNotificationRow);
}

/** `head: true` count — no row bodies leave the database. */
export async function countUnread(): Promise<number> {
  const { count, error } = await createClient()
    .from("admin_notifications")
    .select("id", { count: "exact", head: true })
    .is("read_at", null);
  if (error) throw new NotificationsQueryError(error.message);
  return count ?? 0;
}

/** Unread notifications of one kind — e.g. "gate_blocked", a publish the gate
 * refused that nobody has looked at yet (the overview's attention list). Also
 * a `head: true` count. */
export async function countUnreadOfKind(kind: NotificationKind): Promise<number> {
  const { count, error } = await createClient()
    .from("admin_notifications")
    .select("id", { count: "exact", head: true })
    .is("read_at", null)
    .eq("kind", kind);
  if (error) throw new NotificationsQueryError(error.message);
  return count ?? 0;
}
