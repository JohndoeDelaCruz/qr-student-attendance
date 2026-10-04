import type { Metadata } from "next";
import Link from "next/link";
import { Workspace } from "@/components/workspace";
import { requireStaff } from "@/lib/auth/staff";
import { createClient } from "@/lib/supabase/server";
import { schoolDate, schoolDayBounds, schoolTime } from "@/lib/attendance/dates";
import { studentSearchTerms } from "@/lib/students/management";
import type { EventType } from "@/lib/attendance/scan";
import { smsServerReady } from "@/lib/sms/server";
import { smsStatusLabel } from "@/lib/sms/gateway";
import { SmsControls } from "./sms-controls";
import { SmsStatusRefresh } from "./sms-status-refresh";

export const metadata: Metadata = { title: "Logbook | QR Attendance" };
export const maxDuration = 120;
type LogRow = { id: string; event_type: EventType; scanned_at: string; students: { id: string; student_number: string; first_name: string; last_name: string; section: string } };
const PAGE_SIZE = 20;

export default async function LogbookPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const staff = await requireStaff();
  const search = await searchParams;
  const scalar = (key: string) => typeof search[key] === "string" ? search[key] as string : "";
  const requestedDate = scalar("date");
  const bounds = schoolDayBounds(requestedDate) ?? schoolDayBounds(schoolDate())!;
  const invalidDate = Boolean(requestedDate && !schoolDayBounds(requestedDate));
  const event = ["TIME_IN", "TIME_OUT"].includes(scalar("event")) ? scalar("event") : "";
  const q = scalar("q").slice(0, 100);
  const requestedPage = Number(scalar("page"));
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 && requestedPage <= 100000 ? requestedPage : 1;
  const supabase = await createClient();
  let query = supabase.from("attendance_logs").select("id,event_type,scanned_at,students!inner(id,student_number,first_name,last_name,section)", { count: "exact" }).gte("scanned_at", bounds.start).lt("scanned_at", bounds.end);
  if (event) query = query.eq("event_type", event);
  for (const term of studentSearchTerms(q)) query = query.or(`student_number.ilike.%${term}%,first_name.ilike.%${term}%,last_name.ilike.%${term}%,section.ilike.%${term}%`, { referencedTable: "students" });
  const { data, error, count } = await query.order("scanned_at", { ascending: false }).order("id", { ascending: false }).range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  const logs = (data ?? []) as unknown as LogRow[];
  const [{ data: smsSettings, error: smsSettingsError }, smsOutcomes] = await Promise.all([
    supabase.from("sms_settings").select("enabled").eq("id", true).maybeSingle(),
    logs.length ? supabase.from("sms_notifications").select("attendance_id,status,detail").in("attendance_id", logs.map((log) => log.id)) : Promise.resolve({ data: [], error: null }),
  ]);
  const notifications = new Map((smsOutcomes.data ?? []).map((row) => [row.attendance_id, row]));
  const smsConfigured = smsServerReady();
  const refreshIds = smsConfigured && !smsOutcomes.error ? logs.filter((log) => ["pending", "processing", "queued", "sent", "uncertain"].includes(notifications.get(log.id)?.status ?? "")).map((log) => log.id) : [];
  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));
  const pageUrl = (value: number) => `/logbook?${new URLSearchParams({ date: bounds.date, event, q, page: String(value) })}`;
  return <Workspace staff={staff} active="logbook">
    <SmsStatusRefresh attendanceIds={refreshIds} />
    <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">Attendance records</p><h1 className="mt-3 text-3xl font-semibold tracking-tight">Digital logbook</h1><p className="mt-4 text-sm leading-7 text-slate-500">Review recorded entry and exit scans. Dates and times use Philippine time (UTC+8).</p></div><Link href="/scan" className="primary-button">Open scanner</Link></div>
    <form action="/logbook" className="mt-8 grid gap-4 rounded-2xl border border-slate-200 bg-white p-5 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_2fr_auto]">
      <div><label htmlFor="log-date" className="text-xs font-medium text-slate-600">Date</label><input id="log-date" type="date" name="date" defaultValue={bounds.date} min="2000-01-01" max="2099-12-31" required className="field mt-2" /></div>
      <div><label htmlFor="log-event" className="text-xs font-medium text-slate-600">Scan type</label><select id="log-event" name="event" defaultValue={event} className="field mt-2"><option value="">All scans</option><option value="TIME_IN">Time In</option><option value="TIME_OUT">Time Out</option></select></div>
      <div><label htmlFor="log-search" className="text-xs font-medium text-slate-600">Student search</label><input id="log-search" name="q" defaultValue={q} maxLength={100} placeholder="Name, student number, or section" className="field mt-2" /></div>
      <button type="submit" className="secondary-button self-end">Apply filters</button>
    </form>
    {invalidDate && <p role="status" className="mt-4 text-sm text-amber-800">The date was invalid. Showing today’s records.</p>}
    <section aria-labelledby="sms-heading" className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
      <h2 id="sms-heading" className="text-sm font-semibold">Guardian SMS · {smsSettingsError || !smsSettings ? "Setup required" : smsSettings.enabled && smsConfigured ? "Enabled" : smsSettings.enabled ? "Configuration required" : "Disabled"}</h2>
      <p className="mt-2 text-xs leading-6 text-slate-500">{smsSettingsError || !smsSettings ? "Apply the guardian SMS migration to enable notification tracking. Attendance recording continues normally." : !smsConfigured ? "Complete the Android SMSGate and private server configuration before enabling SMS." : "Successful scans submit notifications automatically when enabled. SMS delivery statuses refresh automatically while this page is open. Gateway queued or sent does not mean delivered."}</p>
      {staff.role === "admin" && smsSettings && !smsSettingsError && <SmsControls enabled={smsSettings.enabled} configured={smsConfigured} />}
    </section>
    {error ? <p role="alert" className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">We couldn’t load the logbook. Please try again.</p> : <>
      <p className="my-5 text-sm text-slate-500">{count ?? 0} {(count ?? 0) === 1 ? "scan" : "scans"} · {bounds.date}</p>
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white"><table className="w-full text-left text-sm"><caption className="sr-only">Student scans for {bounds.date} in Philippine time</caption><thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th scope="col" className="px-6 py-4">Student</th><th scope="col" className="px-6 py-4">Section</th><th scope="col" className="px-6 py-4">Scan</th><th scope="col" className="px-6 py-4">Time</th><th scope="col" className="px-6 py-4">Guardian SMS</th></tr></thead><tbody className="divide-y divide-slate-100">{logs.map((log) => <tr key={log.id}><td className="px-6 py-5"><Link href={`/students/${log.students.id}`} className="font-medium text-slate-900 hover:text-teal-700">{log.students.first_name} {log.students.last_name}</Link><p className="mt-1 text-xs text-slate-500">{log.students.student_number}</p></td><td className="px-6 py-5 text-slate-600">{log.students.section}</td><td className="px-6 py-5"><span className={`inline-flex whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium ${log.event_type === "TIME_IN" ? "bg-teal-50 text-teal-800" : "bg-blue-50 text-blue-800"}`}>{log.event_type === "TIME_IN" ? "Time In" : "Time Out"}</span></td><td className="whitespace-nowrap px-6 py-5 font-mono text-xs text-slate-600"><time dateTime={log.scanned_at}>{schoolTime(log.scanned_at)}</time></td><td className="px-6 py-5"><span className="inline-flex whitespace-nowrap rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">{smsOutcomes.error ? "Status unavailable" : smsStatusLabel(notifications.get(log.id)?.status ?? "historical")}</span>{notifications.get(log.id)?.detail && <p className="mt-2 max-w-56 text-xs leading-5 text-slate-500">{notifications.get(log.id)?.detail}</p>}</td></tr>)}</tbody></table>{!logs.length && <div className="p-10 text-center text-sm text-slate-500">{page > totalPages ? "This page has no records. Return to the first page." : "No scans match these filters."}</div>}</div>
      <div className="mt-6 flex items-center justify-between gap-4 text-sm"><span className="text-slate-500">Page {page} of {totalPages}</span><div className="flex gap-3">{page > totalPages && <Link href={pageUrl(1)} className="secondary-button">First page</Link>}{page > 1 && page <= totalPages && <Link href={pageUrl(page - 1)} className="secondary-button">Previous</Link>}{page < totalPages && <Link href={pageUrl(page + 1)} className="secondary-button">Next</Link>}</div></div>
    </>}
  </Workspace>;
}
