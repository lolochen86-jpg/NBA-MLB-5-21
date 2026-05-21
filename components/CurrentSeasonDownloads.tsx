export function CurrentSeasonDownloads() {
  const links = [
    ["NBA 本季 CSV", "/api/export/current-season?league=NBA&format=csv"],
    ["NBA 本季 Excel", "/api/export/current-season?league=NBA&format=xlsx"],
    ["MLB 本季 CSV", "/api/export/current-season?league=MLB&format=csv"],
    ["MLB 本季 Excel", "/api/export/current-season?league=MLB&format=xlsx"]
  ];

  return (
    <section className="mx-auto max-w-7xl px-5 pb-8">
      <div className="rounded-lg border border-sky-100 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-2xl font-black text-ink">本季已完賽資料下載</h2>
            <p className="mt-2 text-base text-slate-600">
              直接從 NBA.com Stats / MLB StatsAPI 抓本季已完賽比分。抓不到時會在檔案內標明資料來源目前無法取得。
            </p>
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
