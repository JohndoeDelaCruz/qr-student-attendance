import type { Metadata } from "next";
import { Workspace } from "@/components/workspace";
import { requireStaff } from "@/lib/auth/staff";
import { Scanner } from "./scanner";

export const metadata: Metadata = { title: "Scanner | QR Attendance" };

export default async function ScanPage() {
  const staff = await requireStaff();
  return <Workspace staff={staff} active="scan"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">Entry & exit</p><h1 className="mt-3 text-3xl font-semibold tracking-tight">Student scanner</h1><p className="mb-8 mt-4 max-w-2xl text-sm leading-7 text-slate-500">Choose the correct mode before scanning. Students must have a Time In today before a Time Out.</p><Scanner /></Workspace>;
}
