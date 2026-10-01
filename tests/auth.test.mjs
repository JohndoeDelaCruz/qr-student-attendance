import assert from "node:assert/strict";
import test from "node:test";
import { readLoginCredentials, resolveStaffAccess } from "../src/lib/auth/staff-access.ts";

function client({ claims = { sub: "staff-id", email: "staff@example.test" }, authError = null, member = null, dbError = null } = {}) {
  return {
    auth: { getClaims: async () => ({ data: claims ? { claims } : null, error: authError }) },
    from(table) {
      assert.equal(table, "staff_users");
      return {
        select(columns) {
          assert.equal(columns, "display_name, role");
          return {
            eq(column, userId) {
              assert.equal(column, "user_id");
              assert.equal(userId, claims.sub);
              return { maybeSingle: async () => ({ data: member, error: dbError }) };
            },
          };
        },
      };
    },
  };
}

test("signed-out requests never query staff data", async () => {
  const supabase = client({ claims: null });
  supabase.from = () => assert.fail("Must not query without verified identity");
  assert.deepEqual(await resolveStaffAccess(supabase), { status: "anonymous" });
});

test("unverified claims cannot authorize a forged session", async () => {
  assert.deepEqual(await resolveStaffAccess(client({ authError: { status: 401 }, member: { role: "admin" } })), { status: "anonymous" });
});

test("a valid auth account without staff membership is denied", async () => {
  assert.deepEqual(await resolveStaffAccess(client()), { status: "denied" });
});

test("unknown membership roles are denied", async () => {
  assert.deepEqual(await resolveStaffAccess(client({ member: { role: "student" } })), { status: "denied" });
});

test("admins and operators are resolved from their database membership", async () => {
  for (const role of ["admin", "operator"]) {
    assert.deepEqual(await resolveStaffAccess(client({ member: { role, display_name: "School Staff" } })), {
      status: "allowed",
      staff: { userId: "staff-id", email: "staff@example.test", displayName: "School Staff", role },
    });
  }
});

test("database failures never grant access", async () => {
  assert.deepEqual(await resolveStaffAccess(client({ member: { role: "admin" }, dbError: { code: "PGRST205" } })), { status: "unavailable" });
});

test("auth outages and unexpected failures never grant access", async () => {
  assert.deepEqual(await resolveStaffAccess(client({ authError: { status: 503 } })), { status: "unavailable" });
  const supabase = client();
  supabase.auth.getClaims = async () => { throw new Error("offline"); };
  assert.deepEqual(await resolveStaffAccess(supabase), { status: "unavailable" });
});

test("login trims email without modifying the password", () => {
  const form = new FormData();
  form.set("email", " staff@example.test ");
  form.set("password", " password with spaces ");
  assert.deepEqual(readLoginCredentials(form), { email: "staff@example.test", password: " password with spaces " });
});

test("missing, malformed, file-valued and oversized credentials are rejected", () => {
  const form = new FormData();
  assert.equal(readLoginCredentials(form), null);
  form.set("email", "invalid-email"); form.set("password", "password");
  assert.equal(readLoginCredentials(form), null);
  form.set("email", "staff@example.test"); form.set("password", "");
  assert.equal(readLoginCredentials(form), null);
  form.set("password", "x".repeat(4097));
  assert.equal(readLoginCredentials(form), null);
  form.set("password", new File(["password"], "password.txt"));
  assert.equal(readLoginCredentials(form), null);
});
