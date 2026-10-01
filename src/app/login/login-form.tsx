"use client";

import { useActionState } from "react";
import { signIn } from "@/app/auth-actions";

export function LoginForm() {
  const [state, formAction, pending] = useActionState(signIn, { error: "" });
  return (
    <form action={formAction} className="mt-8 space-y-5" aria-busy={pending}>
      <div>
        <label htmlFor="email" className="mb-2 block text-sm font-medium text-slate-700">Email address</label>
        <input id="email" name="email" type="email" autoComplete="username" placeholder="you@school.edu" required maxLength={254} className="field" />
      </div>
      <div>
        <label htmlFor="password" className="mb-2 block text-sm font-medium text-slate-700">Password</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required maxLength={4096} className="field" />
      </div>
      {state.error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-800">{state.error}</p>}
      <button type="submit" disabled={pending} className="primary-button w-full">
        {pending ? "Signing in…" : "Sign in"}{!pending && <span aria-hidden="true">→</span>}
      </button>
      <p className="text-center text-xs leading-5 text-slate-500">Need access? Contact your school administrator.</p>
    </form>
  );
}
