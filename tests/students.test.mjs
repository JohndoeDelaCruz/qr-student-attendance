import assert from "node:assert/strict";
import test from "node:test";
import { hasValidPhotoSignature, saveStudent, studentSearchTerms, validateStudentForm } from "../src/lib/students/management.ts";

const admin = { userId: "admin-id", role: "admin", email: "admin@example.test", displayName: "Admin" };
const studentId = "00000000-0000-4000-8000-000000000001";
const png = new File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0])], "photo.png", { type: "image/png" });
function form(overrides = {}) {
  const result = new FormData();
  for (const [key, value] of Object.entries({ student_number: "DEMO-001", first_name: "Demo", last_name: "Student", section: "Grade 12 A", status: "active", guardian_phone: "", ...overrides })) result.set(key, value);
  return result;
}
function backend({ writeError = null, uploadError = null, existing = { id: studentId, photo_path: null }, references = 0 } = {}) {
  const calls = { records: [], uploads: [], removals: [] };
  const client = {
    storage: { from(bucket) {
      assert.equal(bucket, "student-photos");
      return {
        async upload(path, file, options) { calls.uploads.push({ path, file, options }); return { error: uploadError }; },
        async remove(paths) { calls.removals.push(...paths); return { error: null }; },
      };
    } },
    from(table) {
      assert.equal(table, "students");
      const write = (record) => {
        calls.records.push(record);
        const result = { select: () => ({ maybeSingle: async () => ({ data: writeError ? null : { id: studentId }, error: writeError }) }) };
        return { ...result, eq: (field, id) => { assert.equal(field, "id"); assert.equal(id, studentId); return result; } };
      };
      return {
        insert: write, update: write,
        select: (_columns, options) => ({ eq: (field, value) => options?.head
          ? Promise.resolve({ count: references, error: null })
          : ({ maybeSingle: async () => { assert.equal(field, "id"); assert.equal(value, studentId); return { data: existing, error: null }; } }) }),
      };
    },
  };
  return { client, calls };
}

test("required fields and status are validated before saving", () => {
  const result = validateStudentForm(form({ first_name: "  ", status: "administrator" }));
  assert.equal(result.valid, false);
  assert.ok(result.fieldErrors.first_name); assert.ok(result.fieldErrors.status);
});
test("phone formatting is normalized and letters rejected", () => {
  assert.equal(validateStudentForm(form({ guardian_phone: "+63 (912) 345-6789" })).values.guardian_phone, "+639123456789");
  assert.equal(validateStudentForm(form({ guardian_phone: "call-me-1234567" })).valid, false);
});
test("search terms cannot inject PostgREST grammar or wildcards", () => {
  assert.deepEqual(studentSearchTerms('Demo,role.eq.admin()%_"'), ["Demo", "role", "eq", "admin"]);
  assert.deepEqual(studentSearchTerms("José O'Neil"), ["José", "O'Neil"]);
});
test("SVG, oversized, empty, and conflicting photo submissions are rejected", () => {
  assert.equal(validateStudentForm(form({ photo: new File(["<svg/>"], "x.svg", { type: "image/svg+xml" }) })).valid, false);
  assert.equal(validateStudentForm(form({ photo: new File([new Uint8Array(3 * 1024 * 1024 + 1)], "large.png", { type: "image/png" }) })).valid, false);
  assert.equal(validateStudentForm(form({ photo: new File([], "empty.png", { type: "image/png" }) })).valid, false);
  assert.equal(validateStudentForm(form({ photo: png, remove_photo: "on" })).valid, false);
});
test("photo signatures reject a disguised file", async () => {
  assert.equal(await hasValidPhotoSignature(png), true);
  assert.equal(await hasValidPhotoSignature(new File(["<script>"], "x.png", { type: "image/png" })), false);
});
test("operators cannot upload or modify student records", async () => {
  const { client, calls } = backend();
  assert.equal((await saveStudent(client, { ...admin, role: "operator" }, form({ photo: png }), null)).success, false);
  assert.equal(calls.records.length, 0); assert.equal(calls.uploads.length, 0);
});
test("creates only whitelisted fields and leaves QR/ID generation to the database", async () => {
  const { client, calls } = backend();
  assert.equal((await saveStudent(client, admin, form({ id: "forged", qr_token: "forged", photo_path: "forged", role: "admin" }), null)).success, true);
  const saved = calls.records[0];
  assert.equal(saved.guardian_phone, null);
  for (const key of ["id", "qr_token", "photo_path", "role"]) assert.equal(key in saved, false);
});
test("duplicate numbers report an error and discard only the new upload", async () => {
  const { client, calls } = backend({ writeError: { code: "23505" }, existing: { id: studentId, photo_path: "students/old.png" } });
  const result = await saveStudent(client, admin, form({ photo: png }), studentId);
  assert.equal(result.success, false); assert.ok(result.state.fieldErrors.student_number);
  assert.deepEqual(calls.removals, [calls.uploads[0].path]);
  assert.equal(calls.removals.includes("students/old.png"), false);
});
test("photo upload failure does not write a student", async () => {
  const { client, calls } = backend({ uploadError: { message: "bucket missing" } });
  assert.equal((await saveStudent(client, admin, form({ photo: png }), null)).success, false);
  assert.equal(calls.records.length, 0);
});
test("missing records cannot produce orphan uploads", async () => {
  const { client, calls } = backend({ existing: null });
  assert.equal((await saveStudent(client, admin, form({ photo: png }), studentId)).success, false);
  assert.equal(calls.uploads.length, 0);
});
test("deactivation preserves the QR token and existing photo", async () => {
  const { client, calls } = backend({ existing: { id: studentId, photo_path: "students/old.png" } });
  assert.equal((await saveStudent(client, admin, form({ status: "inactive" }), studentId)).success, true);
  assert.equal(calls.records[0].status, "inactive");
  assert.equal("qr_token" in calls.records[0], false);
  assert.equal("photo_path" in calls.records[0], false);
  assert.equal(calls.removals.length, 0);
});
test("removing a photo clears the reference and cleans only unreferenced managed images", async () => {
  for (const references of [0, 1]) {
    const { client, calls } = backend({ existing: { id: studentId, photo_path: "students/old.png" }, references });
    assert.equal((await saveStudent(client, admin, form({ remove_photo: "on" }), studentId)).success, true);
    assert.equal(calls.records[0].photo_path, null);
    assert.equal(calls.removals.length, references === 0 ? 1 : 0);
  }
});
