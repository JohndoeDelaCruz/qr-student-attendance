export function Brand({ light = false }: { light?: boolean }) {
  return (
    <div className={`flex items-center gap-3 ${light ? "text-white" : "text-slate-900"}`}>
      <span className={`grid size-10 place-items-center rounded-xl ${light ? "bg-white/10" : "bg-teal-700 text-white"}`}>
        <svg width="23" height="23" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M3 9V3h6M15 3h6v6M21 15v6h-6M9 21H3v-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M8 8h3v3H8zM14 8h2v3h-2zM8 14h3v2H8zM14 14h3v3h-3z" fill="currentColor" />
        </svg>
      </span>
      <span className="text-lg font-semibold tracking-tight">QR Attendance</span>
    </div>
  );
}
