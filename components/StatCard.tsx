import { ReactNode } from "react";

export function StatCard({
  title,
  value,
  helper
}: {
  title: string;
  value: ReactNode;
  helper?: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-sky-100 bg-white p-5 shadow-sm">
      <div className="text-sm font-semibold text-slate-500">{title}</div>
      <div className="numeric mt-2 text-3xl font-extrabold text-ink">{value}</div>
      {helper ? <div className="mt-2 text-sm text-slate-500">{helper}</div> : null}
    </div>
  );
}
