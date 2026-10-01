import type { SupabaseClient } from "@supabase/supabase-js";
import type { StaffIdentity } from "../auth/staff-access";

export type StudentValues = {
  student_number: string;
  first_name: string;
  last_name: string;
  section: string;
  status: "active" | "inactive";
  guardian_phone: string;
};

export type Student = Omit<StudentValues, "guardian_phone"> & {
  id: string;
  qr_token: string;
  guardian_phone: string | null;
  photo_path: string | null;
  created_at: string;
};

export type StudentFormState = {
  error: string;
  fieldErrors?: Partial<Record<keyof StudentValues | "photo", string>>;
};

export const MAX_PHOTO_BYTES = 3 * 1024 * 1024;
const photoExtensions: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export function isStudentId(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export function studentSearchTerms(value: string) {
  // Raw PostgREST OR filters must never include user-supplied filter syntax.
  return value.slice(0, 100).replace(/[^\p{L}\p{N} '\-]/gu, " ")
    .trim().split(/\s+/).filter(Boolean).slice(0, 5);
}

export function validateStudentForm(form: FormData) {
  const fieldErrors: NonNullable<StudentFormState["fieldErrors"]> = {};
  function text(field: keyof StudentValues, label: string, limit: number, required = true) {
    const raw = form.get(field);
    const value = typeof raw === "string" ? raw.trim() : "";
    if ((required && !value) || (raw !== null && typeof raw !== "string")) fieldErrors[field] = `Enter ${label}.`;
    else if (value.length > limit) fieldErrors[field] = `${label} must be ${limit} characters or fewer.`;
    return value;
  }
  const values: StudentValues = {
    student_number: text("student_number", "a student number", 50),
    first_name: text("first_name", "a first name", 100),
    last_name: text("last_name", "a last name", 100),
    section: text("section", "a section", 100),
    status: "active",
    guardian_phone: text("guardian_phone", "a guardian phone number", 30, false),
  };
  const status = form.get("status");
  if (status !== "active" && status !== "inactive") fieldErrors.status = "Choose active or inactive.";
  else values.status = status;

  if (values.guardian_phone) {
    const normalized = values.guardian_phone.replace(/[\s()-]/g, "");
    if (!/^\+?[0-9]{7,15}$/.test(normalized)) fieldErrors.guardian_phone = "Enter a valid phone number, including country code if needed.";
    else values.guardian_phone = normalized;
  }

  const rawPhoto = form.get("photo");
  let photo: File | null = null;
  if (rawPhoto !== null) {
    if (!(rawPhoto instanceof File)) fieldErrors.photo = "Choose an image file.";
    else if (rawPhoto.name || rawPhoto.size) {
      if (!rawPhoto.size) fieldErrors.photo = "The image file is empty.";
      else if (!photoExtensions[rawPhoto.type]) fieldErrors.photo = "Use a JPG, PNG, or WebP image.";
      else if (rawPhoto.size > MAX_PHOTO_BYTES) fieldErrors.photo = "Choose an image no larger than 3 MB.";
      else photo = rawPhoto;
    }
  }
  const removePhoto = form.get("remove_photo") === "on";
  if (photo && removePhoto) fieldErrors.photo = "Choose a replacement photo or remove the current photo, not both.";

  return { values, photo, removePhoto, fieldErrors, valid: Object.keys(fieldErrors).length === 0 };
}

export async function hasValidPhotoSignature(photo: File) {
  const bytes = new Uint8Array(await photo.slice(0, 12).arrayBuffer());
  if (photo.type === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (photo.type === "image/png") return [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte);
  if (photo.type === "image/webp") return String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  return false;
}

type SaveResult = { success: true; id: string } | { success: false; state: StudentFormState };

export async function saveStudent(
  supabase: SupabaseClient,
  staff: StaffIdentity,
  form: FormData,
  studentId: string | null,
): Promise<SaveResult> {
  const failure = (error: string, fieldErrors?: StudentFormState["fieldErrors"]): SaveResult => ({ success: false, state: { error, fieldErrors } });
  if (staff.role !== "admin") return failure("Only administrators can change student records.");
  if (studentId !== null && !isStudentId(studentId)) return failure("The student record could not be found.");
  const parsed = validateStudentForm(form);
  if (!parsed.valid) return failure("Please check the highlighted fields.", parsed.fieldErrors);
  if (parsed.photo && !(await hasValidPhotoSignature(parsed.photo))) return failure("Please check the photo.", { photo: "The file content does not match its image type." });

  let uploadedPath: string | null = null;
  const bucket = supabase.storage.from("student-photos");
  async function discardUpload() {
    if (!uploadedPath) return;
    try { await bucket.remove([uploadedPath]); } catch { /* Best-effort cleanup of this request's upload. */ }
  }

  try {
    let previousPhoto: string | null = null;
    if (studentId) {
      const existing = await supabase.from("students").select("id, photo_path").eq("id", studentId).maybeSingle();
      if (existing.error) return failure("We couldn’t load this student. Please try again.");
      if (!existing.data) return failure("The student record could not be found.");
      previousPhoto = existing.data.photo_path;
    }

    if (parsed.photo) {
      const path = `students/${crypto.randomUUID()}.${photoExtensions[parsed.photo.type]}`;
      const upload = await bucket.upload(path, parsed.photo, { contentType: parsed.photo.type, upsert: false });
      if (upload.error) return failure("The photo could not be uploaded. Please try again or save without a photo.");
      uploadedPath = path;
    }

    const record = {
      ...parsed.values,
      guardian_phone: parsed.values.guardian_phone || null,
      ...(uploadedPath ? { photo_path: uploadedPath } : parsed.removePhoto ? { photo_path: null } : {}),
    };
    const write = studentId
      ? supabase.from("students").update(record).eq("id", studentId)
      : supabase.from("students").insert(record);
    const saved = await write.select("id").maybeSingle();
    if (saved.error || !saved.data) {
      await discardUpload();
      if (saved.error?.code === "23505") return failure("That student number is already in use.", { student_number: "Use a unique student number." });
      return failure("The student could not be saved. Please try again.");
    }

    // Never delete an old image before the record is saved, or while referenced.
    if (previousPhoto?.startsWith("students/") && (uploadedPath || parsed.removePhoto)) {
      try {
        const references = await supabase.from("students").select("id", { count: "exact", head: true }).eq("photo_path", previousPhoto);
        if (!references.error && references.count === 0) await bucket.remove([previousPhoto]);
      } catch { /* The saved record remains valid if old-image cleanup fails. */ }
    }
    return { success: true, id: saved.data.id };
  } catch {
    await discardUpload();
    return failure("The student could not be saved. Please try again.");
  }
}
