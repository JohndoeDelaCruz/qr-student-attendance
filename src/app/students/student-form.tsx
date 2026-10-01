"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import type { Student, StudentValues } from "@/lib/students/management";
import { StudentPhoto } from "@/components/student-photo";
import { saveStudentAction } from "./actions";

const fields = [
  { key: "student_number", label: "Student number", limit: 50, placeholder: "e.g. 2026-001" },
  { key: "first_name", label: "First name", limit: 100, placeholder: "First name" },
  { key: "last_name", label: "Last name", limit: 100, placeholder: "Last name" },
  { key: "section", label: "Grade / section", limit: 100, placeholder: "e.g. Grade 12 – Section A" },
] as const;

export function StudentForm({ student, photoUrl }: { student?: Student; photoUrl?: string | null }) {
  const [values, setValues] = useState<StudentValues>({
    student_number: student?.student_number ?? "", first_name: student?.first_name ?? "",
    last_name: student?.last_name ?? "", section: student?.section ?? "",
    status: student?.status ?? "active", guardian_phone: student?.guardian_phone ?? "",
  });
  const [state, formAction, pending] = useActionState(saveStudentAction.bind(null, student?.id ?? null), { error: "", fieldErrors: {} });
  function update(field: keyof StudentValues, value: string) {
    setValues((previous) => ({ ...previous, [field]: value }));
  }
  const cancelUrl = student ? `/students/${student.id}` : "/students";

  return (
    <form action={formAction} aria-busy={pending} className="max-w-3xl rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
      {state.error && <div role="alert" className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-800">{state.error}<p className="mt-1">If you selected a photo, choose it again before retrying.</p></div>}
      <fieldset disabled={pending} className="grid gap-6 sm:grid-cols-2">
        <legend className="mb-6 text-lg font-semibold">Student details</legend>
        {fields.map(({ key, label, limit, placeholder }) => (
          <div key={key}>
            <label htmlFor={key} className="mb-2 block text-sm font-medium text-slate-700">{label} <span className="text-slate-400" aria-hidden="true">*</span></label>
            <input id={key} name={key} value={values[key]} onChange={(event) => update(key, event.target.value)} required maxLength={limit} placeholder={placeholder} className="field" autoComplete="off" aria-invalid={Boolean(state.fieldErrors?.[key])} aria-describedby={state.fieldErrors?.[key] ? `${key}-error` : undefined} />
            {state.fieldErrors?.[key] && <p id={`${key}-error`} className="mt-2 text-xs text-red-700">{state.fieldErrors[key]}</p>}
          </div>
        ))}
        <div>
          <label htmlFor="status" className="mb-2 block text-sm font-medium text-slate-700">Enrollment status</label>
          <select id="status" name="status" value={values.status} onChange={(event) => update("status", event.target.value)} className="field" aria-invalid={Boolean(state.fieldErrors?.status)} aria-describedby="status-help">
            <option value="active">Active</option><option value="inactive">Inactive</option>
          </select>
          <p id="status-help" className="mt-2 text-xs leading-5 text-slate-500">Inactive students cannot record new entry/exit scans.</p>
          {state.fieldErrors?.status && <p className="mt-2 text-xs text-red-700">{state.fieldErrors.status}</p>}
        </div>
        <div>
          <label htmlFor="guardian_phone" className="mb-2 block text-sm font-medium text-slate-700">Guardian phone <span className="font-normal text-slate-400">(optional)</span></label>
          <input id="guardian_phone" name="guardian_phone" type="tel" value={values.guardian_phone} onChange={(event) => update("guardian_phone", event.target.value)} maxLength={30} placeholder="e.g. +639123456789" className="field" autoComplete="off" aria-invalid={Boolean(state.fieldErrors?.guardian_phone)} aria-describedby={state.fieldErrors?.guardian_phone ? "guardian_phone-error" : undefined} />
          {state.fieldErrors?.guardian_phone && <p id="guardian_phone-error" className="mt-2 text-xs text-red-700">{state.fieldErrors.guardian_phone}</p>}
        </div>
        <div className="border-t border-slate-100 pt-6 sm:col-span-2">
          <label htmlFor="photo" className="mb-3 block text-sm font-medium text-slate-700">Student photo <span className="font-normal text-slate-400">(optional)</span></label>
          {student?.photo_path && <div className="mb-4 flex items-center gap-4"><StudentPhoto url={photoUrl} name={`${student.first_name} ${student.last_name}`} /><span className="text-xs text-slate-500">Current photo</span></div>}
          <input id="photo" name="photo" type="file" accept="image/jpeg,image/png,image/webp" className="block w-full rounded-xl border border-slate-300 p-3 text-sm text-slate-600 file:mr-4 file:rounded-lg file:border-0 file:bg-teal-50 file:px-3 file:py-2 file:font-medium file:text-teal-800 focus-visible:outline-2 focus-visible:outline-teal-700" aria-invalid={Boolean(state.fieldErrors?.photo)} aria-describedby="photo-help photo-error" />
          <p id="photo-help" className="mt-2 text-xs text-slate-500">JPG, PNG, or WebP. Maximum 3 MB.</p>
          {state.fieldErrors?.photo && <p id="photo-error" className="mt-2 text-xs text-red-700">{state.fieldErrors.photo}</p>}
          {student?.photo_path && <label className="mt-4 flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" name="remove_photo" className="size-4 accent-teal-700" />Remove current photo</label>}
        </div>
      </fieldset>
      <div className="mt-8 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-6">
        <button type="submit" disabled={pending} className="primary-button">{pending ? "Saving…" : student ? "Save changes" : "Add student"}</button>
        {pending ? <span className="secondary-button opacity-60" aria-disabled="true">Cancel</span> : <Link href={cancelUrl} className="secondary-button">Cancel</Link>}
      </div>
    </form>
  );
}
