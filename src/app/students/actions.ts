"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth/staff";
import { createClient } from "@/lib/supabase/server";
import { saveStudent, setStudentArchived, type StudentFormState, type ArchiveState } from "@/lib/students/management";

export async function archiveStudentAction(studentId: string, archived: boolean, _previousState: ArchiveState, form: FormData): Promise<ArchiveState> {
  const staff = await requireStaff();
  if (form.get("archive_action") !== (archived ? "archive" : "restore")) return { error: "Choose a valid archive or restore action." };
  const result = await setStudentArchived(await createClient(), staff, studentId, archived);
  if (!result.success) return result.state;
  revalidatePath("/students");
  revalidatePath(`/students/${studentId}`);
  revalidatePath(`/students/${studentId}/edit`);
  revalidatePath(`/students/${studentId}/qr`);
  redirect(`/students/${studentId}?saved=${archived ? "archived" : "restored"}`);
}

export async function saveStudentAction(studentId: string | null, _previousState: StudentFormState, form: FormData): Promise<StudentFormState> {
  // Server Actions are directly reachable: authorize every save independently.
  const staff = await requireStaff();
  const result = await saveStudent(await createClient(), staff, form, studentId);
  if (!result.success) return result.state;
  revalidatePath("/students");
  revalidatePath(`/students/${result.id}`);
  revalidatePath(`/students/${result.id}/edit`);
  redirect(`/students/${result.id}?saved=${studentId ? "updated" : "created"}`);
}
