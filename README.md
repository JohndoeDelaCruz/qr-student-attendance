This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Supabase setup

Copy `.env.example` to `.env.local` and fill in your project's URL and publishable key from the Supabase Connect panel. Keep `.env.local` local; it is ignored by Git. Restart the development server after changing these values. Add the same variables in Vercel when deploying.

The Supabase packages are installed. Use `createClient` from `@/lib/supabase/client` in Client Components, or the async `createClient` from `@/lib/supabase/server` in Server Components, Server Actions, and Route Handlers. `src/proxy.ts` refreshes auth cookies; it does not restrict access to pages.

The database migrations are in `supabase/migrations`. Follow [the dashboard setup guide](supabase/SETUP.md) to apply them in order, create private photo storage, and provision the first admin account. These files do not automatically change the hosted project. If the initial schema already exists, apply only `202610010002_record_attendance.sql` to enable scanning.

See the [Supabase Next.js server-side client guide](https://supabase.com/docs/guides/auth/server-side/creating-a-client).

## Staff login

Open `/login` and use the email/password of your confirmed Supabase Auth account. The account must also have a matching `staff_users` membership created through the dashboard setup guide. The app verifies the session and checks that membership before rendering `/dashboard`. Signed-out requests return to `/login`; accounts without membership see `/access`. Logout signs out this browser session.

Run `npm test` with Node.js 22.18+ to check authorization boundaries, form validation, QR decoding, and the attendance migration in isolated PostgreSQL via PGlite with mocked Auth/Storage schemas. Tests do not change your hosted project. To verify your actual account, sign in, reload the dashboard, then sign out and confirm `/dashboard` returns you to `/login`.

## Student management

Open `/students` from the workspace navigation. Staff can search names, student numbers, and sections, filter enrollment status, and view profiles. Administrators can add and edit students, deactivate/reactivate enrollment, and upload, replace, or remove photos. There is no student deletion flow; attendance history is preserved.

Photo uploads use the private `student-photos` bucket and signed display URLs. The app accepts JPG/PNG/WebP up to 3 MB, checks their signatures, and uses generated object names. The bucket from the dashboard setup must exist. New uploads are cleaned up if a record save fails; replaced managed images are cleaned up only after a successful save and a reference check. Storage cleanup is best effort.

Student management uses the initial migration. Use only the student records supplied by the project owner. Do not create fabricated/demo students in the app or hosted database. Check the directory and profiles against that roster; perform any live scan or profile-change testing as an explicit test with the owner’s supplied records. Synthetic automated-test fixtures stay in mocks or isolated in-memory PostgreSQL and never reach Supabase.

## QR scanning and logbook

From a student profile, open **Student QR** to print the card, download the QR PNG, or copy the reference for testing. The QR contains the random student token only. Staff can scan it at `/scan` using a camera, a USB scanner that types text, or the pasted QR value. The scanner opens a live camera preview automatically; allow the browser's camera prompt. Choose Time In or Time Out before presenting a QR. Camera scanning requires localhost or HTTPS. The preview stays live between scans, suppresses repeated reads while the same QR remains visible, and releases the camera when stopped or when leaving the page. Remove the QR from view for at least a second to scan it again, or change scan mode. Database duplicate checks still apply.

Apply `202610010002_record_attendance.sql` before recording scans. Its staff-only RPC locks the student row to serialize scans, supplies the timestamp and scanner identity, rejects inactive/unknown students, rejects scans within 10 seconds, and prevents consecutive identical events that day. The first event of a Philippine calendar day must be Time In; multiple entry/exit cycles are allowed. Overnight attendance and automatic identification of the QR holder are outside this MVP. No service-role key is needed.

Open `/logbook` to filter by Philippine date, scan type, name, student number, or section. Names and sections reflect current student profiles. See the setup guide for a manual walkthrough covering duplicate rejection, Time Out, inactive students, and camera scanning. Hosted save flows and physical camera/USB behavior require manual verification. SMS is still pending.

The scanner’s **Front camera** and **Back camera** buttons request the chosen camera and restart the live preview, releasing the previous stream first. Back camera is preferred initially; devices with only one camera may continue using their available camera. Test both buttons on a phone with front and rear cameras. The selected camera is retained when stopping/restarting the preview during the same visit to the scanner page.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `src/app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
