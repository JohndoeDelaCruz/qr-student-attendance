import Link from "next/link";
import { redirect } from "next/navigation";
import { Brand } from "@/components/brand";
import { LogoutForm } from "@/components/logout-form";
import { getStaffAccess } from "@/lib/auth/staff";

export default async function AccessPage() {
  const access = await getStaffAccess();
  if (access.status === "anonymous") redirect("/login");
  if (access.status === "allowed") redirect("/dashboard");
  const unavailable = access.status === "unavailable";
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f7f9f8] px-6 py-12">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8">
        <Brand />
        <h1 className="mt-8 text-2xl font-semibold tracking-tight">{unavailable ? "We couldn’t check your access" : "Staff access required"}</h1>
        <p className="mt-4 text-sm leading-7 text-slate-500">{unavailable ? "Please try again in a moment. If this continues, contact your school administrator." : "Your account is signed in, but it hasn’t been granted access to this workspace. Contact your school administrator to activate staff access."}</p>
        <div className="mt-8 flex flex-wrap items-center gap-4"><LogoutForm />{unavailable && <Link href="/dashboard" className="text-sm font-medium text-teal-700 underline underline-offset-4">Try again</Link>}</div>
      </div>
    </main>
  );
}
