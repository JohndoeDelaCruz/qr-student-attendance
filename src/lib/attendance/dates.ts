export const SCHOOL_TIME_ZONE = "Asia/Manila";

export function schoolDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: SCHOOL_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const value = (type: string) => parts.find((part) => part.type === type)?.value;
  return `${value("year")}-${value("month")}-${value("day")}`;
}

export function schoolDayBounds(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.slice(0, 4) < "2000" || value.slice(0, 4) > "2099") return null;
  const start = new Date(`${value}T00:00:00+08:00`);
  if (!Number.isFinite(start.getTime()) || schoolDate(start) !== value) return null;
  return { date: value, start: start.toISOString(), end: new Date(start.getTime() + 86_400_000).toISOString() };
}

export function schoolTime(value: string) {
  return new Intl.DateTimeFormat("en-PH", { timeZone: SCHOOL_TIME_ZONE, hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(value));
}
