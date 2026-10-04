import type { SupabaseClient } from "@supabase/supabase-js";
import type { GatewayResult, Notification } from "./gateway";

export async function processSmsQueue(client: SupabaseClient, sender: (notification: Notification) => Promise<GatewayResult>, attendanceId: string | null = null) {
  const { data, error } = await client.rpc("claim_guardian_sms", { p_attendance_id: attendanceId });
  if (error) throw new Error("SMS queue is unavailable");
  let processed = 0;
  for (const notification of (data ?? []) as Notification[]) {
    let result: GatewayResult;
    try { result = await sender(notification); }
    catch { result = { status: "uncertain", detail: "Submission outcome is unconfirmed. Check gateway status before any further action." }; }
    const { error: saveError } = await client.from("sms_notifications").update({ ...result, updated_at: new Date().toISOString(), next_attempt_at: new Date(Date.now() + 60_000).toISOString() }).eq("id", notification.id).eq("status", "processing").eq("attempts", notification.attempts);
    if (saveError) throw new Error("SMS outcome could not be saved");
    processed++;
  }
  return processed;
}

export function smsRefreshIds(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > 20 || value.some((id) => typeof id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))) return null;
  return [...new Set(value)] as string[];
}

export async function refreshSmsOutcomes(client: SupabaseClient, lookup: (id: string) => Promise<GatewayResult | null>, attendanceIds?: string[]) {
  if (attendanceIds !== undefined && !attendanceIds.length) return 0;
  let query = client.from("sms_notifications").select("id,status,updated_at").in("status", ["processing", "queued", "sent", "uncertain"]).lt("updated_at", new Date(Date.now() - 30_000).toISOString());
  if (attendanceIds !== undefined) query = query.in("attendance_id", attendanceIds);
  const { data, error } = await query.order("updated_at").limit(3);
  if (error) throw new Error("SMS status is unavailable");
  let checked = 0;
  for (const row of data ?? []) {
    // A batch claims all rows before sending sequentially. Give a live sender
    // enough time before treating an abandoned processing claim as uncertain.
    if (row.status === "processing" && Date.now() - Date.parse(row.updated_at) < 90_000) continue;
    const result = await lookup(row.id);
    // Keep sent records from moving backwards due to an older gateway snapshot.
    const update = result && !(row.status === "sent" && result.status === "queued") ? result : row.status === "processing" ? { status: "uncertain", detail: "Submission may have been interrupted. Check gateway status; no automatic resend." } : {};
    const { error: saveError } = await client.from("sms_notifications").update({ ...update, updated_at: new Date().toISOString() }).eq("id", row.id).eq("status", row.status).eq("updated_at", row.updated_at);
    if (saveError) throw new Error("SMS status could not be saved");
    checked++;
  }
  return checked;
}
