import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { resolveStaffAccess } from "./staff-access";

export async function getStaffAccess() {
  return resolveStaffAccess(await createClient());
}

export async function requireStaff() {
  const access = await getStaffAccess();
  if (access.status === "anonymous") redirect("/login");
  if (access.status !== "allowed") redirect("/access");
  return access.staff;
}
