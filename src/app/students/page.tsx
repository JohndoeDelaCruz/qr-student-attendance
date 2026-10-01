import type { Metadata } from "next";
import Link from "next/link";
import { Workspace } from "@/components/workspace";
import { StudentPhoto } from "@/components/student-photo";
import { requireStaff } from "@/lib/auth/staff";
import { createClient } from "@/lib/supabase/server";
import { studentSearchTerms, type Student } from "@/lib/students/management";
import { signedStudentPhotos } from "@/lib/students/data";

export const metadata: Metadata = { title: "Students | QR Attendance" };
const pageSize = 20;

export default async function StudentsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const staff = await requireStaff();
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.slice(0, 100) : "";
  const status = params.status === "active" || params.status === "inactive" ? params.status : "all";
  const requestedPage = typeof params.page === "string" ? Number(params.page) : 1;
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 && requestedPage <= 100000 ? requestedPage : 1;
  const supabase = await createClient();
  let query = supabase.from("students").select("id, student_number, first_name, last_name, section, status, photo_path", { count: "exact" });
  if (status !== "all") query = query.eq("status", status);
  for (const term of studentSearchTerms(q)) {
    query = query.or(["student_number", "first_name", "last_name", "section"].map((field) => `${field}.ilike.%${term}%`).join(","));
  }
  const { data, count, error } = await query.order("last_name").order("first_name").order("id").range((page - 1) * pageSize, page * pageSize - 1);
  const students = (data ?? []) as Student[];
  const photos = await signedStudentPhotos(supabase, students);
  const pages = Math.max(1, Math.ceil((count ?? 0) / pageSize));
  function pageUrl(nextPage: number) {
    const search = new URLSearchParams();
    if (q) search.set("q", q);
    if (status !== "all") search.set("status", status);
    search.set("page", String(nextPage));
    return `/students?${search}`;
  }

  return (
    <Workspace staff={staff} active="students">
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">Student directory</p><h1 className="mt-3 text-3xl font-semibold tracking-tight">Students</h1><p className="mt-3 text-sm text-slate-500">View student profiles and keep enrollment details up to date.</p></div>
        {staff.role === "admin" && <Link href="/students/new" className="primary-button"><span aria-hidden="true">+</span> Add student</Link>}
      </div>
      <form action="/students" method="get" className="mb-6 flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-5">
        <div className="min-w-0 flex-1 basis-64"><label htmlFor="q" className="mb-2 block text-xs font-medium text-slate-600">Search students</label><input id="q" name="q" defaultValue={q} maxLength={100} placeholder="Name, student number, or section" className="field" /></div>
        <div><label htmlFor="status" className="mb-2 block text-xs font-medium text-slate-600">Enrollment</label><select id="status" name="status" defaultValue={status} className="field"><option value="all">All students</option><option value="active">Active</option><option value="inactive">Inactive</option></select></div>
        <button type="submit" className="primary-button">Search</button>
        {(q || status !== "all") && <Link href="/students" className="secondary-button">Clear</Link>}
      </form>
      {error ? <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-800">We couldn’t load the students. Please try again. <Link href="/students" className="font-medium underline">Retry</Link></div> : (
        <>
          {photos.failed && <p role="status" className="mb-4 text-sm text-amber-800">Some student photos are temporarily unavailable.</p>}
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div className="border-b border-slate-100 px-6 py-4 text-sm font-medium text-slate-600">{count ?? 0} {(count ?? 0) === 1 ? "student" : "students"}{q || status !== "all" ? " matching your filters" : " in the directory"}</div>
            {!students.length ? <div className="px-6 py-16 text-center"><h2 className="text-lg font-semibold">{q || status !== "all" ? "No matching students" : page > 1 ? "No students on this page" : "Your directory is empty"}</h2><p className="mt-3 text-sm text-slate-500">{q || status !== "all" ? "Try another name, student number, or enrollment filter." : "Add your first student to start building the directory."}</p>{staff.role === "admin" && <Link href="/students/new" className="primary-button mt-6">Add student</Link>}</div> : (
              <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs font-medium uppercase tracking-wider text-slate-500"><tr><th scope="col" className="px-6 py-4">Student</th><th scope="col" className="px-6 py-4">Student number</th><th scope="col" className="px-6 py-4">Grade / section</th><th scope="col" className="px-6 py-4">Enrollment</th><th scope="col" className="px-6 py-4"><span className="sr-only">Open profile</span></th></tr></thead><tbody className="divide-y divide-slate-100">{students.map((student) => <tr key={student.id} className="hover:bg-slate-50/60"><td className="px-6 py-4"><div className="flex items-center gap-3"><StudentPhoto url={student.photo_path ? photos.urls[student.photo_path] : null} name={`${student.first_name} ${student.last_name}`} /><Link href={`/students/${student.id}`} className="whitespace-nowrap font-medium text-slate-900 hover:text-teal-700">{student.first_name} {student.last_name}</Link></div></td><td className="px-6 py-4 text-slate-600">{student.student_number}</td><td className="px-6 py-4 text-slate-600">{student.section}</td><td className="px-6 py-4"><span className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${student.status === "active" ? "bg-teal-50 text-teal-800" : "bg-slate-100 text-slate-600"}`}>{student.status === "active" ? "Active" : "Inactive"}</span></td><td className="px-6 py-4"><Link href={`/students/${student.id}`} className="font-medium text-teal-700" aria-label={`View ${student.first_name} ${student.last_name}`}>View →</Link></td></tr>)}</tbody></table></div>
            )}
          </div>
          {(pages > 1 || page > 1) && <nav aria-label="Student pages" className="mt-5 flex items-center justify-between gap-3 text-sm"><span className="text-slate-500">Page {page} of {pages}</span><div className="flex gap-3">{page > 1 && <Link href={pageUrl(page - 1)} className="secondary-button">Previous</Link>}{page < pages && <Link href={pageUrl(page + 1)} className="secondary-button">Next</Link>}</div></nav>}
        </>
      )}
    </Workspace>
  );
}
