import { createCipheriv, pbkdf2, randomBytes } from "node:crypto";

export type SmsStatus = "disabled" | "pending" | "processing" | "queued" | "sent" | "delivered" | "failed" | "uncertain" | "skipped" | "expired";
export type GatewayConfig = { username: string; password: string; deviceId: string; passphrase: string };
export type Notification = { id: string; recipient_phone: string | null; student_name: string | null; event_type: "TIME_IN" | "TIME_OUT"; scanned_at: string; attempts: number };
export type GatewayResult = { status: SmsStatus; detail: string };

export function normalizeGuardianPhone(value: unknown) {
  if (typeof value !== "string") return null;
  const phone = value.trim().replace(/[\s()-]/g, "");
  if (/^09\d{9}$/.test(phone)) return `+63${phone.slice(1)}`;
  if (/^639\d{9}$/.test(phone)) return `+${phone}`;
  // A bare 10-digit number could have lost its leading zero: require confirmation.
  return /^\+[1-9]\d{7,14}$/.test(phone) ? phone : null;
}

export function gatewayConfig(env: Record<string, string | undefined>): GatewayConfig | null {
  const { SMS_ENABLED, SMSGATE_USERNAME, SMSGATE_PASSWORD, SMSGATE_DEVICE_ID, SMSGATE_ENCRYPTION_PASSPHRASE } = env;
  if (SMS_ENABLED !== "true" || !SMSGATE_USERNAME || !SMSGATE_PASSWORD ||
    !SMSGATE_DEVICE_ID || !/^[\w-]{1,21}$/.test(SMSGATE_DEVICE_ID) || !SMSGATE_ENCRYPTION_PASSPHRASE || SMSGATE_ENCRYPTION_PASSPHRASE.length < 16) return null;
  return { username: SMSGATE_USERNAME, password: SMSGATE_PASSWORD, deviceId: SMSGATE_DEVICE_ID, passphrase: SMSGATE_ENCRYPTION_PASSPHRASE };
}

export function attendanceSms(notification: Notification) {
  const timestamp = new Date(notification.scanned_at);
  if (!Number.isFinite(timestamp.getTime())) throw new Error("Invalid attendance timestamp");
  const when = new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(timestamp);
  return `Attendance notification: ${notification.student_name?.replace(/\s+/g, " ").trim() || "Your student"} recorded ${notification.event_type === "TIME_IN" ? "Time In" : "Time Out"} on ${when} (Philippine time).`;
}

// SMSGate's documented wire format encrypts content and recipients before they
// reach its public cloud. The same passphrase must be set on the Android phone.
export async function encryptSmsField(value: string, passphrase: string) {
  const salt = randomBytes(16);
  const iterations = 300_000;
  const key = await new Promise<Buffer>((resolve, reject) => pbkdf2(passphrase, salt, iterations, 32, "sha1", (error, key) => error ? reject(error) : resolve(key)));
  const cipher = createCipheriv("aes-256-cbc", key, salt);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return `$aes-256-cbc/pbkdf2-sha1$i=${iterations}$${salt.toString("base64")}$${ciphertext.toString("base64")}`;
}

export function parseGatewayStatus(data: unknown, expectedId: string): GatewayResult | null {
  if (!data || typeof data !== "object") return null;
  const response = data as { id?: unknown; state?: unknown };
  if (response.id !== expectedId) return null;
  switch (response.state) {
    case "Pending": case "Processed": case "Cancelling": return { status: "queued", detail: "Accepted by gateway; awaiting sending/delivery confirmation." };
    case "Sent": return { status: "sent", detail: "Sent by the phone; delivery is not confirmed." };
    case "Delivered": return { status: "delivered", detail: "Gateway reports delivery to the recipient device." };
    case "Failed": case "Cancelled": return { status: "failed", detail: "Gateway reports the message failed or was cancelled. Check the Android app." };
    default: return null;
  }
}

const API = "https://api.sms-gate.app/3rdparty/v1/messages";
function requestOptions(config: GatewayConfig): RequestInit {
  return { headers: { Authorization: `Basic ${Buffer.from(`${config.username}:${config.password}`).toString("base64")}`, "Content-Type": "application/json" }, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(8_000) };
}

function connectionProblemDetail(error: unknown) {
  const failure = error && typeof error === "object" ? error as { name?: unknown; cause?: { code?: unknown } } : {};
  const code = failure.cause?.code;
  let problem = "The gateway connection failed";
  if (failure.name === "TimeoutError" || code === "UND_ERR_CONNECT_TIMEOUT" || code === "UND_ERR_HEADERS_TIMEOUT") problem = "The gateway request timed out";
  else if (failure.name === "AbortError") problem = "The gateway request was interrupted";
  else if (code === "ENOTFOUND" || code === "EAI_AGAIN") problem = "The server could not resolve the gateway address";
  else if (code === "ECONNREFUSED" || code === "ECONNRESET" || code === "UND_ERR_SOCKET") problem = "The gateway connection was refused or interrupted";
  else if (code === "CERT_HAS_EXPIRED" || code === "UNABLE_TO_VERIFY_LEAF_SIGNATURE" || code === "DEPTH_ZERO_SELF_SIGNED_CERT") problem = "The gateway TLS certificate could not be verified";
  // Use only known categories: raw errors can contain credentials or request data.
  return `${problem}; SMS acceptance is unconfirmed. Check gateway status; no automatic resend.`;
}

export async function getSmsStatus(id: string, config: GatewayConfig, fetcher: typeof fetch = fetch): Promise<GatewayResult | null> {
  try {
    const response = await fetcher(`${API}/${encodeURIComponent(id)}`, requestOptions(config));
    if (!response.ok) return null;
    return parseGatewayStatus(await response.json(), id);
  } catch { return null; }
}

export async function sendGuardianSms(notification: Notification, config: GatewayConfig, fetcher: typeof fetch = fetch): Promise<GatewayResult> {
  const phone = normalizeGuardianPhone(notification.recipient_phone);
  if (!phone) return { status: "skipped", detail: "Guardian number is missing or invalid. Confirm and correct the student profile for future scans." };
  let text: string;
  let recipient: string;
  let validUntil: string;
  try {
    [text, recipient] = await Promise.all([encryptSmsField(attendanceSms(notification), config.passphrase), encryptSmsField(phone, config.passphrase)]);
    validUntil = new Date(Date.parse(notification.scanned_at) + 3_600_000).toISOString();
  } catch {
    return { status: "failed", detail: "Could not prepare the encrypted notification. No gateway request was made." };
  }
  try {
    const response = await fetcher(API, { ...requestOptions(config), method: "POST", body: JSON.stringify({ id: notification.id, deviceId: config.deviceId, textMessage: { text }, phoneNumbers: [recipient], isEncrypted: true, withDeliveryReport: true, validUntil }) });
    // Reuse the durable ID. A conflict means it was already submitted, not a new send.
    if (response.status === 409) return await getSmsStatus(notification.id, config, fetcher) ?? { status: "uncertain", detail: "Gateway already has this message; check its status before any further action." };
    if ([400,401,403,404].includes(response.status)) return { status: "failed", detail: "Gateway rejected the request. Check server credentials, device configuration, and the Android app." };
    if (response.status === 429) return { status: notification.attempts < 3 ? "pending" : "failed", detail: "Gateway rate limit reached; a later processing attempt is needed." };
    if (!response.ok) return { status: "uncertain", detail: "Gateway acceptance is unconfirmed. Check status; the system will not automatically resend." };
    let data: unknown;
    try { data = await response.json(); }
    catch { return { status: "uncertain", detail: "Gateway returned a successful HTTP response, but its confirmation could not be read. Check status; no automatic resend." }; }
    return parseGatewayStatus(data, notification.id) ?? { status: "uncertain", detail: "Gateway returned an unrecognized response. Check status; no automatic resend." };
  } catch (error) {
    return { status: "uncertain", detail: connectionProblemDetail(error) };
  }
}

export function smsStatusLabel(status: string) {
  return ({ disabled: "Disabled", pending: "Pending", processing: "Submitting", queued: "Gateway queued", sent: "Sent", delivered: "Delivered", failed: "Failed", uncertain: "Check gateway", skipped: "Skipped", expired: "Expired", historical: "No notification" } as Record<string, string>)[status] ?? "Not available";
}
