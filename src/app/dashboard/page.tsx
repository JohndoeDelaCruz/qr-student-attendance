import type { Metadata } from "next";
import Link from "next/link";
import { Workspace } from "@/components/workspace";
import { requireStaff } from "@/lib/auth/staff";

export const metadata: Metadata = { title: "Dashboard | QR Attendance" };

export default async function DashboardPage() {
  const staff = await requireStaff();
  return (
    <Workspace staff={staff} active="dashboard">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">Your workspace</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Welcome, {staff.displayName}</h1>
        <p className="mt-4 max-w-xl text-sm leading-7 text-slate-500">Manage student profiles and record school entry and exit scans.</p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2"><Link href="/scan" className="rounded-2xl bg-slate-900 p-6 text-white"><span className="text-lg font-semibold">Student scanner →</span><p className="mt-2 text-sm leading-6 text-slate-300">Record Time In and Time Out using a student QR.</p></Link><Link href="/logbook" className="rounded-2xl border border-slate-200 bg-white p-6"><span className="text-lg font-semibold">Digital logbook →</span><p className="mt-2 text-sm leading-6 text-slate-500">Review daily scans and filter by student or scan type.</p></Link></div>
        <Link href="/students" className="mt-8 block max-w-xl rounded-2xl border border-teal-200 bg-teal-50 p-6 transition hover:border-teal-400"><span className="text-lg font-semibold text-teal-900">Student directory <span aria-hidden="true">→</span></span><p className="mt-2 text-sm leading-6 text-teal-800">{staff.role === "admin" ? "Add students, update profiles, and manage enrollment." : "View student profiles and enrollment details."}</p></Link>
        <section className="mt-10 max-w-xl rounded-2xl border border-slate-200 bg-white p-6 sm:p-8" aria-labelledby="account-title">
          <h2 id="account-title" className="text-lg font-semibold">Your account</h2>
          <dl className="mt-6 space-y-5 text-sm">
            <div><dt className="text-slate-500">Email address</dt><dd className="mt-1 break-all font-medium">{staff.email || "Not provided"}</dd></div>
            <div><dt className="text-slate-500">Access level</dt><dd className="mt-2"><span className="inline-flex rounded-full bg-teal-50 px-3 py-1 font-medium text-teal-800">{staff.role === "admin" ? "Administrator" : "Scanner operator"}</span></dd></div>
          </dl>
        </section>
    </Workspace>
  );
}
