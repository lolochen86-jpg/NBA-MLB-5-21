import { dict, type Lang } from "@/lib/i18n";

export function CurrentSeasonDownloads({ lang }: { lang: Lang }) {
  const t = dict[lang].downloads;
  const links = [
    [t.nbaCsv, "/api/export/current-season?league=NBA&format=csv"],
    [t.nbaXlsx, "/api/export/current-season?league=NBA&format=xlsx"],
    [t.mlbCsv, "/api/export/current-season?league=MLB&format=csv"],
    [t.mlbXlsx, "/api/export/current-season?league=MLB&format=xlsx"]
  ];

  return (
    <section className="mx-auto max-w-7xl px-5 pb-8">
      <div className="rounded-lg border border-sky-100 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-2xl font-black text-ink">{t.title}</h2>
            <p className="mt-2 text-base text-slate-600">{t.subtitle}</p>
          </div>
          <div className="flex flex-wrap gap-3">
            {links.map(([label, href]) => (
              <a key={label} className="rounded-md bg-blue-600 px-4 py-3 text-base font-bold text-white hover:bg-blue-700" href={href}>
                {label}
              </a>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
