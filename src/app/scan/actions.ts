"use server";

import { requireStaff } from "@/lib/auth/staff";
import { createClient } from "@/lib/supabase/server";
import { recordScan } from "@/lib/attendance/scan";
import { revalidatePath } from "next/cache";

export async function scanStudent(token: string, event: string) {
  await requireStaff();
  const result = await recordScan(await createClient(), token, event);
  if (result.status === "recorded") revalidatePath("/logbook");
  return result;
}
