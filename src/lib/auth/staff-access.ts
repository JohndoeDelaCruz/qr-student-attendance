import type { SupabaseClient } from "@supabase/supabase-js";

export type StaffIdentity = {
  userId: string;
  email: string;
  displayName: string;
  role: "admin" | "operator";
};

export type StaffAccess =
  | { status: "allowed"; staff: StaffIdentity }
  | { status: "anonymous" | "denied" | "unavailable" };

export async function resolveStaffAccess(supabase: SupabaseClient): Promise<StaffAccess> {
  try {
    const { data, error } = await supabase.auth.getClaims();
    if (error) return { status: error.status && error.status >= 500 ? "unavailable" : "anonymous" };

    const userId = data?.claims?.sub;
    if (typeof userId !== "string" || !userId) return { status: "anonymous" };

    const { data: membership, error: membershipError } = await supabase
      .from("staff_users")
      .select("display_name, role")
      .eq("user_id", userId)
      .maybeSingle();

    if (membershipError) return { status: "unavailable" };
    if (!membership || !["admin", "operator"].includes(membership.role)) return { status: "denied" };

    return {
      status: "allowed",
      staff: {
        userId,
        email: typeof data.claims.email === "string" ? data.claims.email : "",
        displayName: membership.display_name,
        role: membership.role,
      },
    };
  } catch {
    return { status: "unavailable" };
  }
}

export function readLoginCredentials(formData: FormData) {
  const email = formData.get("email");
  const password = formData.get("password");
  if (
    typeof email !== "string" || typeof password !== "string" ||
    email.trim().length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ||
    !password || password.length > 4096
  ) return null;

  return { email: email.trim(), password };
}
