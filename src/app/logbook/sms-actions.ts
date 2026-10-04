"use server";

import { requireStaff } from "@/lib/auth/staff";
import { createClient } from "@/lib/supabase/server";
import { processPendingSms, refreshRecordedSms, smsServerReady } from "@/lib/sms/server";
import { smsRefreshIds } from "@/lib/sms/queue";
import { revalidatePath } from "next/cache";

export type SmsActionState = { message: string };

export async function refreshSmsStatuses(attendanceIds: unknown): Promise<{ ok: boolean }> {
  await requireStaff();
  const ids = smsRefreshIds(attendanceIds);
  if (!ids?.length || !smsServerReady()) return { ok: false };
  try {
    await refreshRecordedSms(ids);
    return { ok: true };
  } catch { return { ok: false }; }
}

export async function manageSms(_previous: SmsActionState, form: FormData): Promise<SmsActionState> {
  const staff = await requireStaff();
  if (staff.role !== "admin") return { message: "Only administrators can manage SMS notifications." };
  const action = form.get("sms_action");
  if (action === "enable" || action === "disable") {
    if (action === "enable" && !smsServerReady()) return { message: "Complete the server and Android SMSGate setup before enabling SMS." };
    try {
      const { data, error } = await (await createClient()).from("sms_settings").update({ enabled: action === "enable" }).eq("id", true).select("enabled").single();
      if (error || !data) return { message: "SMS settings are unavailable. Apply the guardian SMS migration first." };
      revalidatePath("/logbook");
      return { message: data.enabled ? "Guardian SMS enabled for future successful scans." : "Guardian SMS disabled. Pending unsent messages are paused." };
    } catch { return { message: "We couldn’t update SMS settings. Please try again." }; }
  }
  if (action !== "process") return { message: "Choose an SMS action." };
  try {
    const { processed, checked } = await processPendingSms();
    revalidatePath("/logbook");
    return { message: `Processed ${processed} pending notification(s) and checked ${checked} gateway status(es).` };
  } catch { return { message: "SMS processing is unavailable. Check the migration, server configuration, and Android gateway. Attendance remains saved." }; }
}
