import Link from "next/link";
import { notFound } from "next/navigation";
import { Workspace } from "@/components/workspace";
import { StudentPhoto } from "@/components/student-photo";
import { requireStaff } from "@/lib/auth/staff";
import { createClient } from "@/lib/supabase/server";
import { isStudentId, type Student } from "@/lib/students/management";
import { signedStudentPhotos } from "@/lib/students/data";
import { ArchiveControls } from "../archive-controls";

export default async function StudentPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const staff = await requireStaff();
  const { id } = await params;
  if (!isStudentId(id)) notFound();
  const supabase = await createClient();
  const { data, error } = await supabase.from("students").select("*").eq("id", id).maybeSingle();
  if (error) return <Workspace staff={staff} active="students"><p role="alert" className="text-red-800">We couldn’t load this student. Please try again.</p><Link href="/students" className="secondary-button mt-6">Back to students</Link></Workspace>;
  if (!data) notFound();
  const student = data as Student;
  const photos = await signedStudentPhotos(supabase, [student]);
  const search = await searchParams;
  const archived = Boolean(student.archived_at);
  const saved = search.saved === "created" ? "Student added." : search.saved === "updated" ? "Student updated." : search.saved === "archived" && archived ? "Student archived." : search.saved === "restored" && !archived ? "Student restored." : null;
  return (
    <Workspace staff={staff} active="students">
      <Link href="/students" className="text-sm font-medium text-teal-700">← Back to students</Link>
      {saved && <p role="status" className="mt-6 rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-800">{saved}</p>}
      <div className="mb-8 mt-8 flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">Student profile</p><h1 className="mt-3 text-3xl font-semibold tracking-tight">{student.first_name} {student.last_name}</h1><p className="mt-3 text-sm text-slate-500">Student number {student.student_number}</p></div><div className="flex flex-wrap items-start gap-3"><Link href={`/students/${id}/qr`} className="secondary-button">Student QR</Link>{staff.role === "admin" && <><Link href={`/students/${id}/edit`} className="primary-button">Edit student</Link><ArchiveControls key={`${id}-${archived}`} studentId={id} archived={archived} name={`${student.first_name} ${student.last_name}`} /></>}</div></div>
      {archived && <p role="status" className="mb-6 max-w-3xl rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">Archived student. Their profile, photo, QR code, and attendance history are kept. New scans are disabled. Restoring keeps their current enrollment status.</p>}
      <section className="max-w-3xl rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
        <div className="flex flex-wrap items-center gap-6"><StudentPhoto large name={`${student.first_name} ${student.last_name}`} url={student.photo_path ? photos.urls[student.photo_path] : null} /><div><h2 className="text-lg font-semibold">Enrollment details</h2><span className={`mt-3 inline-flex rounded-full px-3 py-1 text-xs font-medium ${student.status === "active" ? "bg-teal-50 text-teal-800" : "bg-slate-100 text-slate-600"}`}>{student.status === "active" ? "Active" : "Inactive"}</span>{archived && <span className="ml-2 inline-flex rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-900">Archived</span>}<p className="mt-3 text-sm text-slate-500">{!archived && student.status === "active" ? "Eligible for entry and exit scans." : "New entry and exit scans are disabled."}</p></div></div>
        {photos.failed && <p role="status" className="mt-4 text-sm text-amber-800">The student photo is temporarily unavailable.</p>}
        <dl className="mt-8 grid gap-6 border-t border-slate-100 pt-6 text-sm sm:grid-cols-2">{[["First name", student.first_name], ["Last name", student.last_name], ["Student number", student.student_number], ["Grade / section", student.section], ["Guardian phone", student.guardian_phone || "Not provided"]].map(([label, value]) => <div key={label}><dt className="text-slate-500">{label}</dt><dd className="mt-2 break-words font-medium">{value}</dd></div>)}</dl>
      </section>
    </Workspace>
  );
}
