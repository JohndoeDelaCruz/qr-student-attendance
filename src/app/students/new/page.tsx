import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Workspace } from "@/components/workspace";
import { requireStaff } from "@/lib/auth/staff";
import { StudentForm } from "../student-form";

export const metadata: Metadata = { title: "Add student | QR Attendance" };

export default async function NewStudentPage() {
  const staff = await requireStaff();
  if (staff.role !== "admin") redirect("/students");
  return <Workspace staff={staff} active="students"><Link href="/students" className="text-sm font-medium text-teal-700">← Back to students</Link><h1 className="mb-3 mt-6 text-3xl font-semibold tracking-tight">Add student</h1><p className="mb-8 text-sm text-slate-500">Create a student profile for your school directory.</p><StudentForm /></Workspace>;
}
