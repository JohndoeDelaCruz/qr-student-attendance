import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth/staff";
import { createClient } from "@/lib/supabase/server";
import { isStudentId, type Student } from "@/lib/students/management";
import { signedStudentPhotos } from "@/lib/students/data";
import { studentQrImage } from "@/lib/students/qr";
import { StudentPhoto } from "@/components/student-photo";
import { QrControls } from "./qr-controls";

export default async function StudentQrPage({ params }: { params: Promise<{ id: string }> }) {
  await requireStaff();
  const { id } = await params;
  if (!isStudentId(id)) notFound();
  const supabase = await createClient();
  const { data, error } = await supabase.from("students").select("*").eq("id", id).maybeSingle();
  if (error) return <main className="p-8"><p role="alert">We couldn’t load this QR card. Please try again.</p><Link href={`/students/${id}`} className="secondary-button mt-5">Back to student</Link></main>;
  if (!data) notFound();
  const student = data as Student;
  const [image, photos] = await Promise.all([studentQrImage(student.qr_token), signedStudentPhotos(supabase, [student])]);
  return <main className="qr-print-page min-h-screen bg-[#f7f9f8] px-6 py-10">
    <div className="no-print mx-auto mb-8 max-w-md"><Link href={`/students/${id}`} className="text-sm font-medium text-teal-700">← Back to student</Link><h1 className="mt-5 text-2xl font-semibold">Student QR card</h1><p className="mt-3 text-sm leading-6 text-slate-500">Print this card for scanning, or download the QR for your ID layout. The QR contains a random student reference.</p>{student.archived_at ? <p role="status" className="mt-3 text-sm text-amber-800">This student is archived. Restore them before using this QR for attendance.</p> : student.status === "inactive" && <p role="status" className="mt-3 text-sm text-amber-800">This student is inactive. The QR will not record attendance until reactivated.</p>}</div>
    <article className="qr-print-card mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">QR Attendance · Student card</p>
      <div className="mt-6 flex justify-center"><StudentPhoto large name={`${student.first_name} ${student.last_name}`} url={student.photo_path ? photos.urls[student.photo_path] : null} /></div>
      <h2 className="mt-5 break-words text-2xl font-semibold">{student.first_name} {student.last_name}</h2><p className="mt-2 break-words text-sm text-slate-600">{student.student_number}</p><p className="mt-2 break-words text-sm text-slate-500">{student.section}</p>
      {/* Data URI is generated locally; retain the QR quiet zone and original pixels. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={image} width={512} height={512} alt={`Attendance QR for ${student.first_name} ${student.last_name}`} className="mx-auto mt-5 h-auto w-full max-w-[256px]" />
      <p className="mt-3 text-xs text-slate-500">{student.archived_at ? "Archived student · New scans are disabled." : "Present this QR for entry and exit scans."}</p>
    </article>
    <div className="mx-auto mt-8 max-w-xl"><QrControls image={image} token={student.qr_token} studentNumber={student.student_number} /></div>
  </main>;
}
