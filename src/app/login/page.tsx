import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Brand } from "@/components/brand";
import { getStaffAccess } from "@/lib/auth/staff";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in | QR Attendance" };

export default async function LoginPage() {
  const access = await getStaffAccess();
  if (access.status === "allowed") redirect("/dashboard");
  if (access.status === "denied") redirect("/access");
  return (
    <main className="grid min-h-screen lg:grid-cols-[1fr_1fr]">
      <section className="relative flex flex-col justify-between overflow-hidden bg-[#102e32] px-8 py-8 text-white sm:px-12 lg:px-16 lg:py-12">
        <Brand light />
        <div className="relative z-10 my-12 max-w-lg lg:my-20">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/15 px-3 py-1.5 text-xs font-medium text-teal-100"><span className="size-1.5 rounded-full bg-teal-300" /> SCHOOL ATTENDANCE</div>
          <h1 className="text-4xl font-semibold leading-tight tracking-tight sm:text-5xl lg:text-6xl">Every arrival.<br /><span className="text-teal-200">Every departure.</span></h1>
          <p className="mt-6 max-w-sm text-base leading-7 text-slate-300">A simpler way to keep track of student entry and exit, all in one school workspace.</p>
        </div>
        <p className="relative z-10 hidden text-xs text-slate-400 lg:block">Student entry &amp; exit monitoring</p>
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-28 -right-24 size-96 rounded-full border border-white/10" />
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-14 -right-10 size-64 rounded-full border border-white/10" />
      </section>
      <section className="flex items-center justify-center bg-[#f7f9f8] px-6 py-12 sm:px-12">
        <div className="w-full max-w-sm">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">Staff portal</p>
          <h2 className="text-3xl font-semibold tracking-tight text-slate-900">Welcome back</h2>
          <p className="mt-3 text-sm leading-6 text-slate-500">Sign in to your school workspace.</p>
          {access.status === "unavailable" && <p role="alert" className="mt-5 text-sm text-red-700">We couldn&apos;t check your session. Please try again.</p>}
          <LoginForm />
        </div>
      </section>
    </main>
  );
}
