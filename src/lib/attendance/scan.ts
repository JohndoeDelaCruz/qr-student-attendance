import type { SupabaseClient } from "@supabase/supabase-js";

export type EventType = "TIME_IN" | "TIME_OUT";
export type ScanStudent = { id: string; student_number: string; first_name: string; last_name: string; section: string; status: "active" | "inactive"; photo_path: string | null };
export type ScanResult = {
  status: "recorded" | "denied" | "invalid" | "unknown" | "inactive" | "duplicate" | "needs_time_in" | "unavailable";
  message: string;
  student?: ScanStudent;
  photoUrl?: string;
  photoUnavailable?: boolean;
  event_type?: EventType;
  scanned_at?: string;
};

export function parseScanInput(token: unknown, event: unknown) {
  if (typeof token !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token.trim())) return null;
  if (event !== "TIME_IN" && event !== "TIME_OUT") return null;
  return { token: token.trim().toLowerCase(), event };
}

export async function recordScan(supabase: SupabaseClient, token: unknown, event: unknown): Promise<ScanResult> {
  const input = parseScanInput(token, event);
  if (!input) return { status: "invalid", message: "Use a student QR value and choose Time In or Time Out." };
  try {
    const { data, error } = await supabase.rpc("record_student_scan", { p_qr_token: input.token, p_event_type: input.event });
    if (error || !data || typeof data.message !== "string" || !["recorded", "denied", "invalid", "unknown", "inactive", "duplicate", "needs_time_in"].includes(data.status)) {
      return { status: "unavailable", message: error?.code === "PGRST202" ? "Scanning is not ready. Apply the attendance migration in the Supabase SQL Editor." : "We couldn’t confirm this scan. Check the logbook before trying again." };
    }
    const result = data as ScanResult;
    if (result.student?.photo_path) {
      try {
        const { data: photo, error: photoError } = await supabase.storage.from("student-photos").createSignedUrl(result.student.photo_path, 300);
        if (!photoError && photo?.signedUrl) result.photoUrl = photo.signedUrl;
        else result.photoUnavailable = true;
      } catch { result.photoUnavailable = true; }
    }
    return result;
  } catch {
    return { status: "unavailable", message: "We couldn’t confirm this scan. Check the logbook before trying again." };
  }
}
