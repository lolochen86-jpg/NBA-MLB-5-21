"use client";

type Props = {
  queryString: string;
};

export function DownloadButtons({ queryString }: Props) {
  const hrefFor = (format: string) => {
    const params = new URLSearchParams(queryString);
    params.set("type", "matchup");
    params.set("format", format);
    return `/api/export?${params.toString()}`;
  };

  return (
    <div className="flex flex-wrap gap-3">
      <a className="rounded-md bg-blue-600 px-4 py-3 text-base font-bold text-white hover:bg-blue-700" href={hrefFor("csv")}>
        下載 CSV
      </a>
      <a className="rounded-md bg-emerald-600 px-4 py-3 text-base font-bold text-white hover:bg-emerald-700" href={hrefFor("xlsx")}>
        下載 Excel
      </a>
      <a className="rounded-md bg-slate-800 px-4 py-3 text-base font-bold text-white hover:bg-slate-900" href={hrefFor("json")}>
        下載 JSON
      </a>
    </div>
  );
}
