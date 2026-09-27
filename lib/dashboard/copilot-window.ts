import "server-only";
import { createClient } from "@/lib/supabase/server";
import { dashboardRangeWindow, type DashboardRange } from "@/lib/dashboard/range";
import { toWidget, type WidgetData } from "@/lib/dashboard/telemetry-window";
import {
  UNANSWERED_LIMIT,
  toCopilotStats,
  toUnansweredQuestions,
  type CopilotStatsSummary,
  type UnansweredQuestion,
} from "@/lib/dashboard/copilot";

// The two 0019 functions, called with the admin's own session (RLS-scoped,
// SECURITY INVOKER). Like every monitoring widget, a failed call is an
// explicit error state for its widget, never an empty one that reads as "no
// questions".

function rangeArgs(range: DashboardRange): { p_from: string; p_to: string } {
  const { startUTC, endUTC } = dashboardRangeWindow(range);
  return { p_from: startUTC, p_to: endUTC };
}

export async function fetchCopilotStats(range: DashboardRange): Promise<WidgetData<CopilotStatsSummary>> {
  const result = await createClient().rpc("copilot_stats", rangeArgs(range));
  return toWidget("copilot_stats", result, toCopilotStats);
}

export async function fetchCopilotUnanswered(range: DashboardRange): Promise<WidgetData<UnansweredQuestion[]>> {
  const result = await createClient().rpc("copilot_unanswered", { ...rangeArgs(range), p_limit: UNANSWERED_LIMIT });
  return toWidget("copilot_unanswered", result, toUnansweredQuestions);
}
