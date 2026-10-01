"use client";

import { useActionState } from "react";
import { signOut } from "@/app/auth-actions";

export function LogoutForm() {
  const [state, formAction, pending] = useActionState(signOut, { error: "" });
  return (
    <form action={formAction} aria-busy={pending}>
      <button type="submit" disabled={pending} className="secondary-button">{pending ? "Signing out…" : "Sign out"}</button>
      {state.error && <p role="alert" className="mt-2 text-sm text-red-700">{state.error}</p>}
    </form>
  );
}
