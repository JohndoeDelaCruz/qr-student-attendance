# Guardian SMS with SMSGate

Only the dedicated Android sending phone needs SMSGate. Students present their existing QR cards and guardians receive ordinary SMS. Staff can scan from another device, including an iPhone. The sender needs a working SIM with an SMS allowance/credit, cellular signal, power, and internet access. SMSGate software does not pay carrier SMS charges.

## 1. Apply the additive migration

After the first two migrations, paste the complete contents of `migrations/202610020001_guardian_sms.sql` into a new Supabase SQL Editor query and run it. Existing students and attendance records are preserved. The migration creates `sms_settings` and `sms_notifications`, with sending disabled. It creates no notifications for historical attendance.

Notifications are recorded atomically alongside new attendance. Duplicate/rejected scans create neither an attendance row nor a notification. Staff can read notification outcomes; only admins can toggle the setting. Dispatch claims/writes require the private server client, not the browser's publishable key. If this migration is not installed yet, scanning continues and the logbook displays **Setup required**.

## 2. Configure the Android phone

Use the official [SMSGate installation guide](https://docs.sms-gate.app/installation/) and official release downloads. Open the app, grant the SMS sending permission, enable **Cloud Server**, and connect until the status is **Online**. The app generates your cloud username/password. Obtain the sending device ID from the app or its [web dashboard](https://dashboard.sms-gate.app).

Configure an encryption passphrase in the app's encryption settings. Use a long, unique passphrase of at least 16 characters and keep it private. The website must use exactly the same passphrase. This integration encrypts message text and recipient numbers before submitting them to the public gateway using its documented format and 300,000 PBKDF2 iterations. The final carrier SMS is an ordinary text; this protects the gateway submission, not the SMS carrier network. See [SMSGate encryption](https://docs.sms-gate.app/privacy/encryption/).

Choose the sending SIM as the Android phone's default SMS SIM. Keep the phone online, charged, and running the app. Check that normal SMS sending works with that SIM before enabling automated notifications.

## 3. Add private server environment variables

Keep existing Supabase URL/publishable variables. Add the following to your ignored `.env.local` and, separately, your Vercel project's production environment variables. Never prefix these names with `NEXT_PUBLIC_`, commit their values, or paste them into a chat.

```dotenv
SMS_ENABLED=true
SUPABASE_SECRET_KEY=your-private-supabase-secret-key
SMSGATE_USERNAME=your-cloud-username
SMSGATE_PASSWORD=your-cloud-password
SMSGATE_DEVICE_ID=your-sending-phone-device-id
SMSGATE_ENCRYPTION_PASSPHRASE=the-same-private-passphrase-set-on-the-phone
```

`SUPABASE_SECRET_KEY` is a **server-only secret key** from Supabase project API keys, not the publishable key. A legacy `service_role` key also works in this variable. It is used only by the dedicated notification server client. Restart development after environment changes; Vercel needs a new deployment for updated variables. Set `SMS_ENABLED=false` to disable server submission.

Both gates must be open: valid server configuration with `SMS_ENABLED=true`, and the administrator's **Enable guardian SMS** setting in the logbook. Keep the app setting disabled until the phone and supplied guardian numbers are ready.

## 4. Validate supplied guardian numbers

Use only confirmed contact numbers from the project's supplied student records. Philippine numbers may be stored as `09xxxxxxxxx`, `639xxxxxxxxx`, or `+639xxxxxxxxx`; spaces, parentheses and hyphens are accepted. Explicit international numbers use `+` and country code. Missing/invalid numbers skip sending and are reported in the logbook. A bare 10-digit number is deliberately rejected rather than assuming the spreadsheet lost a leading zero. Confirm such values with the owner before correcting a profile.

The notification uses the guardian number and student name at scan time. Changing the profile later affects future notifications, not already queued snapshots. Only one guardian number per student is supported by this MVP.

## 5. Enable and perform an intended live test

Sign in as an administrator, open **Logbook**, and select **Enable guardian SMS**. This is the point at which future successful scans begin sending real texts. Do not create fake students or change a real guardian's number just to test. Coordinate an intended scan with a supplied student and their intended recipient.

Record a permitted Time In or Time Out. Attendance is saved first; Next.js `after` submits the notification after returning the scan response, so gateway problems do not turn a saved attendance record into a failed scan. Open Logbook to see the outcome. While that page is visible, it automatically checks unresolved notifications on the current page every 15 seconds, at most 3 per request. Notifications are eligible for a check when their last update was at least 30 seconds ago. Checks pause in hidden tabs and stop once the visible notifications have terminal outcomes. These checks only retrieve delivery status and never submit or retry messages. Both administrators and operators can see these updates. Re-presenting a QR that is rejected as a duplicate must not generate another notification.

Possible outcomes:

| Outcome | Meaning |
| --- | --- |
| Disabled | SMS was off when the scan was saved; never sent later by processing. |
| Pending | Awaiting a dispatch attempt or a gateway rate-limit retry. |
| Submitting | Claimed by the server; another worker cannot claim it. |
| Gateway queued | Gateway accepted it; phone/carrier delivery is still pending. |
| Sent | Phone reports it was sent; recipient delivery is not confirmed. |
| Delivered | Gateway reports receipt at the recipient device. |
| Failed | Request rejected or gateway reports failure/cancellation. |
| Check gateway | Submission outcome is uncertain; do not assume it failed. |
| Skipped | Missing or invalid guardian number. |
| Expired | Pending notification was not submitted within one hour. |
| No notification | Historical record predating installation. |

**Process pending / refresh SMS** handles up to 3 available pending notifications and checks up to 3 older unresolved statuses per click. Status checks are spaced by at least 30 seconds and do not send new SMS. Gateway delivery reporting depends on the phone/carrier. A queued or sent message must not be represented as delivered. See [status tracking](https://docs.sms-gate.app/features/status-tracking/).

## Recovery and limits

- Automatic dispatch happens for each new successful app scan. There is no independently scheduled background worker in this MVP. If the platform stops an `after` callback, an admin can process the durable pending queue from Logbook. Direct external RPC scans create queue entries but need admin processing because they do not invoke the app callback.
- Only definite rate-limit rejections return to Pending, with a one-minute wait and at most three attempts. No automatic resend occurs after a timeout, ambiguous response, 5xx error, or server crash during submission. Refresh/check the Android gateway first.
- Notification IDs are stable and supplied to SMSGate. If a message with that ID already exists, the app checks it rather than creating another. A unique attendance reference and atomic claim also prevent overlapping workers from submitting the same event.
- Pending notifications expire after one hour; submitted messages carry the same expiry to avoid stale notifications when the phone returns online. Disabling the logbook setting pauses pending submissions; previously submitted gateway messages may still send.
- Disabled, skipped, expired, and failed notifications are never replayed automatically. Correct configuration/numbers for future scans. Do not rescan solely to resend an SMS, since that creates another attendance event.
- This integration sends the student's name, event type, and recorded Philippine date/time. It does not send photos, QR tokens, section, or enrollment details. Recipient/content are encrypted for the public gateway; stored snapshots remain protected by database permissions. Gateway response bodies and credentials are never logged or shown in browser errors.

Local automated tests use mocked HTTP and in-memory PostgreSQL only. They neither send real messages nor modify your hosted Supabase project. Physical SMS delivery requires the intended live test above.
