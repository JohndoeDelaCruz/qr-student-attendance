# Supabase dashboard setup

The connection is configured locally. Complete these steps in the existing Supabase project. SQL migrations are applied manually through the dashboard; the app does not apply them automatically.

## 1. Create the tables and policies

Open **SQL Editor**, create a new query, paste the complete contents of `migrations/202610010001_initial_schema.sql`, and click **Run** once. The migration is intended for a fresh project; it creates all objects inside one transaction and does not delete existing data. If it reports that a table or policy already exists, stop and inspect the existing schema instead of rerunning fragments.

In **Table Editor**, confirm these public tables exist and have RLS enabled:

- `staff_users`: explicitly approved staff memberships, with `admin` or `operator` roles.
- `students`: student details and random QR tokens.
- `attendance_logs`: append-only entry/exit events with database timestamps and scanner identity.

Only admins can create/edit students; operators can read students and record attendance. Staff members can read logs. Signed-out users and signed-in users without a staff membership cannot access student data. Users cannot create or change their own staff membership through the app. Students are deactivated rather than deleted to preserve attendance history. `status` currently means active/inactive enrollment, not a computed attendance state.

After the initial schema, open a **new SQL Editor query**, paste the complete contents of `migrations/202610010002_record_attendance.sql`, and click **Run**. If the initial tables already exist, run only this second migration. It adds the `record_student_scan` function and removes direct browser inserts into the logbook; existing records are preserved.

Staff explicitly choose **Time In** or **Time Out**. The database serializes scans for each student, rejects repeats within 10 seconds, rejects consecutive scans of the same type that day, and requires a Time In before a Time Out that day. Multiple entry/exit cycles per day are allowed. Days use `Asia/Manila`; overnight visits are not supported by this MVP. The timestamp and staff identity come from the database. SMS is not implemented.

## 2. Create private photo storage

In **Storage**, create a bucket whose name/ID is exactly `student-photos`. Keep **Public bucket** off. Set the maximum file size to **5 MB** and allow **image/jpeg**, **image/png**, and **image/webp**. The migration includes staff read and admin write policies for this bucket. Store the object path in `students.photo_path`; the app should create temporary signed URLs when displaying photos.

## 3. Create your first admin login

In **Authentication > Users**, use **Add user > Create new user** if that option is available. Set your email and a strong password privately in the dashboard. Ensure the account is email-confirmed before testing password login. If using an invitation instead, complete the invite flow and set the password before proceeding. Do not add password columns to the app tables.

Copy that account's **User UID**, then open a new SQL Editor query. Replace the placeholder UUID with the actual UID and run:

```sql
insert into public.staff_users (user_id, display_name, role)
values ('REPLACE_WITH_AUTH_USER_UUID'::uuid, 'Project Admin', 'admin');
```

Creating an Auth account alone does not grant staff access. Only add accounts you intend to authorize. Additional scanner accounts can be assigned `operator` instead of `admin` through the dashboard.

## 4. Configure authentication for development

Under **Authentication > URL Configuration**, set **Site URL** to `http://localhost:3000` for local development. Add the deployed HTTPS origin and required callback URLs when deploying.

In Auth configuration, turn **Allow new users to sign up** off and keep anonymous sign-ins off. This app uses staff accounts provisioned through the dashboard. Keep the Email provider enabled for password login.

## 5. Continue in the Next.js app

The app includes staff login/logout, student management, QR cards, the scanner, and the logbook. Sign in with your confirmed admin account. If you see **Staff access required**, verify that the Auth UID matches the admin membership from step 3. Protected pages and server actions verify identity and membership in addition to database permissions.

Use a student from the owner’s supplied roster for this walkthrough. Do not create a fabricated/demo student. Run live scan tests only when intended, since they create actual logbook entries:

1. Open **Students** and select a student entered from the supplied roster. If the roster has not been imported, enter only a supplied record, preserving its student ID and confirmed details. Open their profile and select **Student QR**.
2. Select **Copy QR value**. Open **Scanner**, choose **Time In**, paste the value, and record it.
3. Record the same value again. Confirm there is no new logbook row.
4. Wait at least 10 seconds, choose **Time Out**, and record it. Open **Logbook** and confirm both events and their Philippine timestamps.
5. Open **Scanner** and allow camera access when the browser asks. The live preview opens automatically. Test with the QR printed or displayed on another device. The preview stays live after a scan; remove the QR from view for at least a second before presenting it again. Use **Stop camera** to release it and **Start camera** to restart or retry permission. Leaving the page also releases the camera.
6. Deactivate the student and confirm a new scan is rejected. Reactivate when finished.
7. Sign out and confirm `/scan`, `/logbook`, and QR pages return to `/login`.

The QR encodes only the random reference, without student names or photos. Photo/profile lookup still requires staff access. A printed QR can be copied; this MVP retrieves the photo for the operator to check and does not automatically authenticate the student carrying it. Logbook names/sections reflect the current student profile.

## References

- [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Storage access control](https://supabase.com/docs/guides/storage/security/access-control)
- [Auth configuration](https://supabase.com/docs/guides/auth/general-configuration)
- [Auth users](https://supabase.com/docs/guides/auth/users)
