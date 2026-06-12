import Link from "next/link";
import { getBacktestResult, type BacktestLeague, type BacktestRow } from "@/lib/backtest";
import { getLang, withLang } from "@/lib/i18n";
import { teamName } from "@/lib/team-names";

export const dynamic = "force-dynamic";

type Search = Record<string, string | string[] | undefined>;

export default async function BacktestPage({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams;
  const lang = getLang(params.lang);
  const league = param(params.league) ?? "MLB";
  const season = param(params.season);
  const seasonType = param(params.seasonType) ?? "Regular Season";
  const fromDate = param(params.from) ?? "2026-05-01";
  const rangeValue = param(params.rangeValue) ?? "5";
  const result = await getBacktestResult({ league, season, seasonType, fromDate, rangeValue });
  const displayedRows = result.rows.slice().reverse().slice(0, 120);
  const seasonValue = season ?? (result.league === "NBA" ? "2025-26" : "2026");

  return (
    <main className="min-h-screen bg-skySoft">
      <section className="border-b border-sky-100 bg-white">
        <div className="mx-auto max-w-7xl px-5 py-8">
          <Link className="text-base font-black text-blue-700" href={withLang("/", lang)}>
            首頁
          </Link>
          <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="text-4xl font-black tracking-normal text-ink sm:text-5xl">回測紀錄</h1>
              <p className="mt-3 max-w-4xl text-lg leading-8 text-slate-600">
                從 2026/5/1 開始，比對賽前模型預測與實際比分，並統計勝負、大小分與比分區間命中率。
              </p>
            </div>
            <div className="rounded-md bg-blue-50 px-4 py-3 text-base font-black text-blue-800">
              {result.dataSource}
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-6">
        <form className="grid gap-4 rounded-lg border border-sky-100 bg-white p-5 shadow-sm sm:grid-cols-2 lg:grid-cols-5">
          <input type="hidden" name="lang" value={lang} />
          <label className="grid gap-2 text-sm font-bold text-slate-700">
            League
            <select className="rounded-md border border-slate-200 bg-white px-4 py-3 text-base" name="league" defaultValue={result.league}>
              <option value="MLB">MLB</option>
              <option value="NBA">NBA</option>
            </select>
          </label>
          <label className="grid gap-2 text-sm font-bold text-slate-700">
            賽季
            <input className="rounded-md border border-slate-200 px-4 py-3 text-base" name="season" defaultValue={seasonValue} />
          </label>
          <label className="grid gap-2 text-sm font-bold text-slate-700">
            賽事類型
            <select className="rounded-md border border-slate-200 bg-white px-4 py-3 text-base" name="seasonType" defaultValue={seasonType}>
              <option value="Regular Season">例行賽</option>
              <option value="Playoffs">季後賽</option>
            </select>
          </label>
          <label className="grid gap-2 text-sm font-bold text-slate-700">
            起始日期
            <input className="rounded-md border border-slate-200 px-4 py-3 text-base" type="date" name="from" defaultValue={result.fromDate} />
          </label>
          <label className="grid gap-2 text-sm font-bold text-slate-700">
            近幾場
            <select className="rounded-md border border-slate-200 bg-white px-4 py-3 text-base" name="rangeValue" defaultValue={String(result.rangeValue)}>
              <option value="3">3</option>
              <option value="5">5</option>
              <option value="10">10</option>
              <option value="15">15</option>
            </select>
          </label>
          <button className="rounded-md bg-blue-600 px-5 py-3 text-base font-black text-white transition hover:bg-blue-700 sm:col-span-2 lg:col-span-5" type="submit">
            重新計算
          </button>
        </form>

        {result.error ? (
          <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-base font-bold text-amber-800">
            {result.error}
          </div>
        ) : null}

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <StatCard title="回測場數" value={String(result.stats.games)} />
          <StatCard title="勝負準確率" value={`${result.stats.winnerAccuracy}%`} />
          <StatCard title="大小分準確率" value={`${result.stats.totalAccuracy}%`} />
          <StatCard title="比分區間命中" value={`${result.stats.scoreRangeAccuracy}%`} />
          <StatCard title="平均總分誤差" value={String(result.stats.averageTotalError)} />
        </div>

        <section className="mt-6 rounded-lg border border-sky-100 bg-white shadow-sm">
          <div className="flex flex-col gap-2 border-b border-sky-100 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-2xl font-black text-ink">{result.league} 回測表格</h2>
              <p className="mt-1 text-sm text-slate-500">
                顯示最新 {displayedRows.length} 筆；統計使用全部 {result.stats.games} 筆。
              </p>
            </div>
            <p className="text-sm text-slate-500">
              大小分線為模型線，不是莊家盤口。
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-[1180px] w-full text-left text-sm">
              <thead className="bg-sky-50 text-slate-700">
                <tr>
                  {[
                    "日期",
                    "對戰",
                    "預測比分",
                    "實際比分",
                    "預測勝方",
                    "實際勝方",
                    "模型線",
                    "預測大小",
                    "實際大小",
                    "勝負",
                    "大小分",
                    "總分誤差"
                  ].map((header) => (
                    <th key={header} className="whitespace-nowrap px-4 py-3 font-black">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {displayedRows.length ? (
                  displayedRows.map((row) => <BacktestTableRow key={row.id} row={row} lang={lang} league={result.league} />)
                ) : (
                  <tr>
                    <td className="px-4 py-8 text-center text-base font-bold text-amber-700" colSpan={12}>
                      目前沒有可回測的已完賽資料
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </section>
    </main>
  );
}

function StatCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-lg border border-sky-100 bg-white p-5 shadow-sm">
      <div className="text-sm font-bold text-slate-500">{title}</div>
      <div className="numeric mt-2 text-3xl font-black text-blue-700">{value}</div>
    </div>
  );
}

function BacktestTableRow({ row, lang, league }: { row: BacktestRow; lang: "zh" | "en"; league: BacktestLeague }) {
  return (
    <tr className="hover:bg-sky-50/60">
      <td className="numeric whitespace-nowrap px-4 py-3 text-slate-600">{row.date}</td>
      <td className="whitespace-nowrap px-4 py-3 font-bold text-ink">
        {shortName(row.awayTeam, lang)} @ {shortName(row.homeTeam, lang)}
      </td>
      <td className="numeric whitespace-nowrap px-4 py-3">
        {formatScore(row.predictedAway, league)} - {formatScore(row.predictedHome, league)}
      </td>
      <td className="numeric whitespace-nowrap px-4 py-3">
        {row.actualAway} - {row.actualHome}
      </td>
      <td className="whitespace-nowrap px-4 py-3">{shortName(row.predictedWinner, lang)}</td>
      <td className="whitespace-nowrap px-4 py-3">{shortName(row.actualWinner, lang)}</td>
      <td className="numeric whitespace-nowrap px-4 py-3">{row.modelTotalLine}</td>
      <td className="whitespace-nowrap px-4 py-3">{sideLabel(row.predictedTotalSide)}</td>
      <td className="whitespace-nowrap px-4 py-3">{sideLabel(row.actualTotalSide)}</td>
      <td className="whitespace-nowrap px-4 py-3">
        <Badge ok={row.winnerCorrect} />
      </td>
      <td className="whitespace-nowrap px-4 py-3">
        <Badge ok={row.totalCorrect} />
      </td>
      <td className="numeric whitespace-nowrap px-4 py-3">{row.totalError}</td>
    </tr>
  );
}

function Badge({ ok }: { ok: boolean }) {
  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-black ${ok ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
      {ok ? "命中" : "未中"}
    </span>
  );
}

function sideLabel(side: BacktestRow["predictedTotalSide"]) {
  if (side === "OVER") return "大";
  if (side === "UNDER") return "小";
  return "走水";
}

function shortName(value: string, lang: "zh" | "en") {
  return teamName(value, lang);
}

function formatScore(value: number, league: BacktestLeague) {
  return league === "NBA" ? Math.round(value) : value.toFixed(1);
}

function param(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
