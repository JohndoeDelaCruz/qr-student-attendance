"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { refreshSmsStatuses } from "./sms-actions";

export function SmsStatusRefresh({ attendanceIds }: { attendanceIds: string[] }) {
  const router = useRouter();
  const idsKey = attendanceIds.join(",");

  useEffect(() => {
    if (!idsKey) return;
    const ids = idsKey.split(",");
    let cancelled = false;
    let running = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = (delay: number) => {
      clearTimeout(timer);
      if (!cancelled && document.visibilityState === "visible") timer = setTimeout(poll, delay);
    };
    const poll = async () => {
      if (cancelled || running || document.visibilityState !== "visible") return;
      running = true;
      try {
        const result = await refreshSmsStatuses(ids);
        if (!cancelled && result.ok) router.refresh();
      } catch { /* Keep the recorded status when the connection/session is unavailable. */ }
      finally {
        running = false;
        schedule(15_000);
      }
    };
    const visibilityChanged = () => {
      clearTimeout(timer);
      if (!running) schedule(0);
    };
    document.addEventListener("visibilitychange", visibilityChanged);
    schedule(0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", visibilityChanged);
    };
  }, [idsKey, router]);

  return null;
}
