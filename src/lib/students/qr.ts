import QRCode from "qrcode";

export async function studentQrImage(token: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)) throw new Error("Invalid student QR token");
  return QRCode.toDataURL(token, { width: 512, margin: 4, errorCorrectionLevel: "M", color: { dark: "#102b32", light: "#ffffff" } });
}
