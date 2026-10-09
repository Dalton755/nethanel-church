import type { ReactNode } from "react";

export const inputClass =
  "w-full min-h-11 rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-zinc-100 outline-none transition focus:border-sky-300/50 focus:ring-2 focus:ring-sky-400/10";

export function Kpi({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <article className="rounded-[1.45rem] border border-white/8 bg-white/[0.035] p-4">
      <p className="text-xs font-semibold text-zinc-500">{label}</p>
      <p className="mt-2 text-2xl font-bold tracking-tight">{value}</p>
      <p className="mt-2 text-xs text-zinc-600">{detail}</p>
    </article>
  );
}

export function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/8 bg-black/20 p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-600">
        {label}
      </p>
      <p className="mt-1.5 text-sm font-bold text-zinc-200">{value}</p>
    </div>
  );
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold text-zinc-500">
        {label}
      </span>
      {children}
    </label>
  );
}

export function Empty({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-white/10 px-4 py-10 text-center text-sm text-zinc-600">
      {text}
    </div>
  );
}
