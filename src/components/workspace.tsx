import Link from "next/link";
import type { ReactNode } from "react";
import type { StaffIdentity } from "@/lib/auth/staff-access";
import { Brand } from "./brand";
import { LogoutForm } from "./logout-form";

export function Workspace({ staff, active, children }: { staff: StaffIdentity; active: "dashboard" | "students" | "scan" | "logbook"; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[#f7f9f8]">
      <header className="border-b border-slate-200 bg-white px-6">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 py-5">
          <Link href="/dashboard" aria-label="QR Attendance dashboard"><Brand /></Link>
          <div className="flex items-center gap-4"><span className="hidden text-sm text-slate-500 sm:block">{staff.displayName}</span><LogoutForm /></div>
        </div>
        <nav aria-label="Workspace" className="mx-auto flex max-w-6xl gap-5 overflow-x-auto sm:gap-7">
          {([['dashboard', 'Overview'], ['students', 'Students'], ['scan', 'Scanner'], ['logbook', 'Logbook']] as const).map(([key, label]) => <Link key={key} href={`/${key}`} aria-current={active === key ? "page" : undefined} className={`border-b-2 py-3 text-sm font-medium ${active === key ? "border-teal-700 text-teal-800" : "border-transparent text-slate-500 hover:text-slate-900"}`}>{label}</Link>)}
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-10 sm:py-12">{children}</main>
    </div>
  );
}
