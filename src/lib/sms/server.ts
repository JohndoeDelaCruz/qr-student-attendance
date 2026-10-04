import "server-only";
import { createClient } from "@supabase/supabase-js";
import { gatewayConfig, getSmsStatus, sendGuardianSms } from "./gateway";
import { processSmsQueue, refreshSmsOutcomes } from "./queue";

export function smsServerReady() {
  return Boolean(gatewayConfig(process.env) && process.env.SUPABASE_SECRET_KEY && process.env.NEXT_PUBLIC_SUPABASE_URL);
}

function connection() {
  const config = gatewayConfig(process.env);
  const key = process.env.SUPABASE_SECRET_KEY;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!config || !key || !url) return null;
  // Dedicated privileged client: no browser cookies/session, no public exports of keys.
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  return { client, config };
}

export async function dispatchRecordedSms(studentId: string, scannedAt: string) {
  const sms = connection();
  if (!sms) return;
  // Resolve the server-recorded event rather than accepting IDs or recipients from a browser.
  const { data, error } = await sms.client.from("attendance_logs").select("id").eq("student_id", studentId).eq("scanned_at", scannedAt).maybeSingle();
  if (error || !data) return;
  await processSmsQueue(sms.client, (notification) => sendGuardianSms(notification, sms.config), data.id);
}

export async function processPendingSms() {
  const sms = connection();
  if (!sms) throw new Error("SMS server configuration is incomplete");
  const processed = await processSmsQueue(sms.client, (notification) => sendGuardianSms(notification, sms.config));
  const checked = await refreshSmsOutcomes(sms.client, (id) => getSmsStatus(id, sms.config));
  return { processed, checked };
}

export async function refreshRecordedSms(attendanceIds: string[]) {
  const sms = connection();
  if (!sms) throw new Error("SMS server configuration is incomplete");
  // Status lookups only: never claim a job or submit/retry a message.
  return refreshSmsOutcomes(sms.client, (id) => getSmsStatus(id, sms.config), attendanceIds);
}
