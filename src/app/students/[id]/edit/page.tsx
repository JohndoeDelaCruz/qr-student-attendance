import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Workspace } from "@/components/workspace";
import { requireStaff } from "@/lib/auth/staff";
import { createClient } from "@/lib/supabase/server";
import { isStudentId, type Student } from "@/lib/students/management";
import { signedStudentPhotos } from "@/lib/students/data";
import { StudentForm } from "../../student-form";

export const metadata: Metadata = { title: "Edit student | QR Attendance" };

export default async function EditStudentPage({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaff();
  if (staff.role !== "admin") redirect("/students");
  const { id } = await params;
  if (!isStudentId(id)) notFound();
  const supabase = await createClient();
  const { data, error } = await supabase.from("students").select("*").eq("id", id).maybeSingle();
  if (error) return <Workspace staff={staff} active="students"><p role="alert" className="text-red-800">We couldn’t load this student. Please try again.</p><Link href="/students" className="secondary-button mt-6">Back to students</Link></Workspace>;
  if (!data) notFound();
  const student = data as Student;
  const photos = await signedStudentPhotos(supabase, [student]);
  return <Workspace staff={staff} active="students"><Link href={`/students/${id}`} className="text-sm font-medium text-teal-700">← Back to profile</Link><h1 className="mb-3 mt-6 text-3xl font-semibold tracking-tight">Edit student</h1><p className="mb-8 text-sm text-slate-500">Update the profile for {student.first_name} {student.last_name}.</p>{photos.failed && <p className="mb-4 text-sm text-amber-800">The current photo is temporarily unavailable.</p>}<StudentForm student={student} photoUrl={student.photo_path ? photos.urls[student.photo_path] : null} /></Workspace>;
}
