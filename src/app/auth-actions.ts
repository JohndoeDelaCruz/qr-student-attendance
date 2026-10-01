"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { readLoginCredentials, resolveStaffAccess } from "@/lib/auth/staff-access";
import type { AuthFormState } from "@/lib/auth/form-state";

export async function signIn(_previousState: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const credentials = readLoginCredentials(formData);
  if (!credentials) return { error: "Enter a valid email address and your password." };

  let destination = "/dashboard";
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword(credentials);
    if (error) {
      return { error: error.status && error.status >= 500
        ? "Sign-in is temporarily unavailable. Please try again."
        : "Unable to sign in. Check your email and password, and make sure your account is confirmed." };
    }
    const access = await resolveStaffAccess(supabase);
    if (access.status === "anonymous") return { error: "Your session could not be verified. Please sign in again." };
    if (access.status !== "allowed") destination = "/access";
  } catch {
    return { error: "Sign-in is temporarily unavailable. Please try again." };
  }
  revalidatePath("/", "layout");
  redirect(destination);
}

export async function signOut(): Promise<AuthFormState> {
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (error) return { error: "Unable to sign out. Please try again." };
  } catch {
    return { error: "Unable to sign out. Please try again." };
  }
  revalidatePath("/", "layout");
  redirect("/login");
}
