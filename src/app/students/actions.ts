"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth/staff";
import { createClient } from "@/lib/supabase/server";
import { saveStudent, type StudentFormState } from "@/lib/students/management";

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
