"use server";

import { requireStaff } from "@/lib/auth/staff";
import { createClient } from "@/lib/supabase/server";
import { recordScan } from "@/lib/attendance/scan";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { dispatchRecordedSms } from "@/lib/sms/server";

export async function scanStudent(token: string, event: string) {
  await requireStaff();
  const result = await recordScan(await createClient(), token, event);
  if (result.status === "recorded") {
    revalidatePath("/logbook");
    if (result.student?.id && result.scanned_at) {
      const studentId = result.student.id;
      const scannedAt = result.scanned_at;
      after(async () => {
        try { await dispatchRecordedSms(studentId, scannedAt); }
        catch { /* Durable notification remains in the logbook for admin review. Never undo attendance or log private gateway errors. */ }
      });
    }
  }
  return result;
}
