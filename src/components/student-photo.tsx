/* eslint-disable @next/next/no-img-element -- Private signed URLs must be served directly, without the shared image optimizer. */
export function StudentPhoto({ url, name, large = false }: { url?: string | null; name: string; large?: boolean }) {
  const size = large ? "size-32 rounded-2xl text-3xl" : "size-11 rounded-xl text-sm";
  return url
    ? <img src={url} alt={large ? `${name}'s photo` : ""} width={large ? 128 : 44} height={large ? 128 : 44} className={`${size} shrink-0 object-cover`} />
    : <span aria-hidden="true" className={`${size} flex shrink-0 items-center justify-center bg-teal-50 font-semibold text-teal-800`}>{name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase()}</span>;
}
