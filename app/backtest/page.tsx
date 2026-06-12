import Link from "next/link";
import {
  getBacktestResult,
  type BacktestDiagnosticBucket,
  type BacktestLeague,
  type BacktestModelRun,
  type BacktestRow
} from "@/lib/backtest";
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
  const fromDate = param(params.from);
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
                從本季起始日開始，比對已完賽賽程的賽前模型預測與實際比分，並診斷穩定度、連勝連敗、火力趨勢與大小分型態。
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

        <section className="mt-6 rounded-lg border border-sky-100 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="text-2xl font-black text-ink">模型權重建議</h2>
              <p className="mt-1 text-sm text-slate-500">
                用同一批本季完賽資料測試多組保守權重，挑出平均總分誤差最低的一組。
              </p>
            </div>
            <div className="rounded-md bg-blue-50 px-4 py-2 text-sm font-bold text-blue-800">
              誤差改善 {result.modelSuggestion.improvement}
            </div>
          </div>
          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <ModelRunCard title="目前模型" run={result.modelSuggestion.baseline} />
            <ModelRunCard title="建議模型" run={result.modelSuggestion.best} highlight />
          </div>
        </section>

        <section className="mt-6 rounded-lg border border-sky-100 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="text-2xl font-black text-ink">模型診斷</h2>
              <p className="mt-1 text-sm text-slate-500">
                這裡用回測結果找出模型在哪些型態比較準、哪些型態容易失誤。
              </p>
            </div>
            <div className="rounded-md bg-amber-50 px-4 py-2 text-sm font-bold text-amber-800">
              樣本太少的型態會自動排除
            </div>
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-4">
            <DiagnosticList title="勝負較準" rows={result.diagnostics.bestWinnerBuckets} metric="winner" />
            <DiagnosticList title="勝負易錯" rows={result.diagnostics.worstWinnerBuckets} metric="winner" />
            <DiagnosticList title="大小分較準" rows={result.diagnostics.bestTotalBuckets} metric="total" />
            <DiagnosticList title="高誤差型態" rows={result.diagnostics.highErrorBuckets} metric="error" />
          </div>

          <div className="mt-5 rounded-lg border border-amber-100 bg-amber-50 p-4">
            <h3 className="text-base font-black text-amber-900">目前缺少的關鍵資料</h3>
            <ul className="mt-3 grid gap-2 text-sm leading-6 text-amber-900 lg:grid-cols-2">
              {result.diagnostics.missingData.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </section>

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
            <table className="min-w-[1540px] w-full text-left text-sm">
              <thead className="bg-sky-50 text-slate-700">
                <tr>
                  {[
                    "日期",
                    "對戰",
                    "預測比分",
                    "實際比分",
                    "勝負",
                    "大小分",
                    "總分誤差",
                    "穩定度",
                    "連勝連敗",
                    "火力趨勢",
                    "大小分型態",
                    "信心",
                    "風險"
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
                    <td className="px-4 py-8 text-center text-base font-bold text-amber-700" colSpan={13}>
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

function ModelRunCard({ title, run, highlight }: { title: string; run: BacktestModelRun; highlight?: boolean }) {
  return (
    <div className={`rounded-lg border p-4 ${highlight ? "border-blue-200 bg-blue-50" : "border-slate-100 bg-slate-50"}`}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-black text-ink">{title}</h3>
          <p className="mt-1 text-sm font-bold text-slate-600">{run.label}</p>
        </div>
        <div className="numeric rounded-md bg-white px-3 py-2 text-sm font-black text-blue-700">
          誤差 {run.stats.averageTotalError}
        </div>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <MiniMetric label="勝負" value={`${run.stats.winnerAccuracy}%`} />
        <MiniMetric label="大小分" value={`${run.stats.totalAccuracy}%`} />
        <MiniMetric label="場數" value={String(run.stats.games)} />
      </div>
      <div className="mt-4 grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
        <WeightBar label="近期得分" value={run.weights.scored} />
        <WeightBar label="對手失分" value={run.weights.opponentAllowed} />
        <WeightBar label="主客場" value={run.weights.venue} />
        <WeightBar label="聯盟均值" value={run.weights.leagueAverage} />
      </div>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-white p-3">
      <div className="text-xs font-bold text-slate-500">{label}</div>
      <div className="numeric mt-1 text-lg font-black text-ink">{value}</div>
    </div>
  );
}

function WeightBar({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="flex justify-between gap-3">
        <span className="font-bold">{label}</span>
        <span className="numeric">{Math.round(value * 100)}%</span>
      </div>
      <div className="mt-1 h-2 rounded-full bg-white">
        <div className="h-2 rounded-full bg-blue-600" style={{ width: `${Math.round(value * 100)}%` }} />
      </div>
    </div>
  );
}

function DiagnosticList({
  title,
  rows,
  metric
}: {
  title: string;
  rows: BacktestDiagnosticBucket[];
  metric: "winner" | "total" | "error";
}) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50 p-4">
      <h3 className="font-black text-ink">{title}</h3>
      <div className="mt-3 space-y-3">
        {rows.length ? (
          rows.map((row) => (
            <div key={`${title}-${row.label}`} className="rounded-md bg-white p-3 shadow-sm">
              <div className="font-bold text-slate-800">{row.label}</div>
              <div className="numeric mt-1 text-sm text-slate-500">
                {row.games} 場 · {metricLabel(row, metric)}
              </div>
            </div>
          ))
        ) : (
          <div className="rounded-md bg-white p-3 text-sm text-slate-500">樣本不足</div>
        )}
      </div>
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
      <td className="whitespace-nowrap px-4 py-3">
        <Badge ok={row.winnerCorrect} />
      </td>
      <td className="whitespace-nowrap px-4 py-3">
        <Badge ok={row.totalCorrect} />
      </td>
      <td className="numeric whitespace-nowrap px-4 py-3">{row.totalError}</td>
      <td className="whitespace-nowrap px-4 py-3">{row.volatilityLabel}</td>
      <td className="whitespace-nowrap px-4 py-3">{row.streakLabel}</td>
      <td className="whitespace-nowrap px-4 py-3">{row.trendLabel}</td>
      <td className="whitespace-nowrap px-4 py-3">{row.totalLeanLabel}</td>
      <td className="whitespace-nowrap px-4 py-3">{row.confidenceLabel}</td>
      <td className="min-w-[220px] px-4 py-3 text-slate-600">{row.riskFlags.join("、")}</td>
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

function metricLabel(row: BacktestDiagnosticBucket, metric: "winner" | "total" | "error") {
  if (metric === "winner") return `勝負 ${row.winnerAccuracy}%`;
  if (metric === "total") return `大小分 ${row.totalAccuracy}%`;
  return `平均誤差 ${row.averageTotalError}`;
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
