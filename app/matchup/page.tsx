import Link from "next/link";
import { DownloadButtons } from "@/components/DownloadButtons";
import { StatCard } from "@/components/StatCard";
import { getMatchupSummary } from "@/lib/matchup";
import { prisma } from "@/lib/prisma";

type Search = Record<string, string | string[] | undefined>;
type TeamOption = { id: number; abbreviation: string; name: string };

export default async function MatchupPage({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams;
  const league = String(params.league ?? "NBA").toUpperCase();
  const teamsResult = await loadTeams(league);
  const teams = teamsResult.teams;
  const homeTeamId = Number(params.homeTeamId ?? teams[0]?.id ?? 0);
  const awayTeamId = Number(params.awayTeamId ?? teams[1]?.id ?? 0);
  const season = String(params.season ?? (league === "NBA" ? "2025-26" : "2026"));
  const seasonType = String(params.seasonType ?? "Regular Season");
  const rangeType = String(params.rangeType ?? "games") as "games" | "days";
  const rangeValue = Number(params.rangeValue ?? 5);
  const includeOvertime = String(params.includeOvertime ?? "true") === "true";
  const splitHomeAway = String(params.splitHomeAway ?? "false") === "true";

  const summary: any =
    homeTeamId && awayTeamId
      ? await getSafeSummary({
          league,
          homeTeamId,
          awayTeamId,
          season,
          seasonType,
          rangeType,
          rangeValue,
          includeOvertime,
          splitHomeAway
        })
      : null;

  const query = new URLSearchParams({
    league,
    homeTeamId: String(homeTeamId),
    awayTeamId: String(awayTeamId),
    season,
    seasonType,
    rangeType,
    rangeValue: String(rangeValue),
    includeOvertime: String(includeOvertime),
    splitHomeAway: String(splitHomeAway)
  });

  return (
    <main className="mx-auto min-h-screen max-w-7xl px-5 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link href="/" className="text-base font-bold text-blue-700">
            首頁
          </Link>
          <h1 className="mt-2 text-4xl font-black text-ink">{league} 對戰分析</h1>
          <p className="mt-2 text-lg text-slate-600">
            每個數字都來自資料庫同步快取；沒有資料時不會產生假結果。
          </p>
        </div>
        {summary && !summary.error ? <DownloadButtons queryString={query.toString()} /> : null}
      </div>

      <form className="grid gap-4 rounded-lg border border-sky-100 bg-white p-5 shadow-sm lg:grid-cols-4" action="/matchup">
        <Select name="league" label="聯盟" value={league} options={[["NBA", "NBA"], ["MLB", "MLB"]]} />
        <TextInput name="season" label="賽季" value={season} />
        <Select name="seasonType" label="賽制" value={seasonType} options={[["Regular Season", "例行賽"], ["Playoffs", "季後賽"]]} />
        <Select name="rangeType" label="區間類型" value={rangeType} options={[["games", "最近場數"], ["days", "最近日數"]]} />
        <Select name="homeTeamId" label="主隊" value={String(homeTeamId)} options={teams.map((team) => [String(team.id), `${team.abbreviation} ${team.name}`])} />
        <Select name="awayTeamId" label="客隊" value={String(awayTeamId)} options={teams.map((team) => [String(team.id), `${team.abbreviation} ${team.name}`])} />
        <Select name="rangeValue" label="5 / 10 / 15" value={String(rangeValue)} options={[["5", "5"], ["10", "10"], ["15", "15"]]} />
        <Select name="includeOvertime" label="是否包含延長賽" value={String(includeOvertime)} options={[["true", "是"], ["false", "否"]]} />
        <Select name="splitHomeAway" label="主客場" value={String(splitHomeAway)} options={[["false", "不分主客場"], ["true", "主客場分開"]]} />
        <div className="flex items-end">
          <button className="w-full rounded-md bg-blue-600 px-5 py-3 text-lg font-black text-white hover:bg-blue-700">查詢</button>
        </div>
      </form>

      {teamsResult.error ? (
        <Notice text="資料來源目前無法取得" />
      ) : !teams.length ? (
        <Notice text="請先同步資料" />
      ) : summary?.error ? (
        <Notice text="資料來源目前無法取得" />
      ) : summary ? (
        <section className="mt-6 space-y-6">
          {summary.homeTeamSummary.unavailableReason || summary.awayTeamSummary.unavailableReason ? (
            <Notice text={summary.homeTeamSummary.unavailableReason ?? summary.awayTeamSummary.unavailableReason ?? "資料來源目前無法取得"} />
          ) : null}

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <StatCard title="主隊平均得分" value={fmt(summary.homeTeamSummary.averageScored)} helper={summary.homeTeamSummary.team} />
            <StatCard title="主隊平均失分" value={fmt(summary.homeTeamSummary.averageAllowed)} helper={`${summary.homeTeamSummary.wins}-${summary.homeTeamSummary.losses}`} />
            <StatCard title="客隊平均得分" value={fmt(summary.awayTeamSummary.averageScored)} helper={summary.awayTeamSummary.team} />
            <StatCard title="客隊平均失分" value={fmt(summary.awayTeamSummary.averageAllowed)} helper={`${summary.awayTeamSummary.wins}-${summary.awayTeamSummary.losses}`} />
          </div>

          <SummaryTable rows={[summary.homeTeamSummary, summary.awayTeamSummary]} />
          <GameLogTable rows={summary.gameLogs} />
        </section>
      ) : (
        <Notice text="資料來源目前無法取得" />
      )}
    </main>
  );
}

async function loadTeams(league: string): Promise<{ teams: TeamOption[]; error: boolean }> {
  try {
    const teams = await prisma.team.findMany({
      where: { league },
      orderBy: [{ city: "asc" }, { name: "asc" }],
      select: { id: true, abbreviation: true, name: true }
    });
    return { teams, error: false };
  } catch (error) {
    console.error("Teams unavailable", error);
    return { teams: [], error: true };
  }
}

async function getSafeSummary(input: Parameters<typeof getMatchupSummary>[0]) {
  try {
    return { ...(await getMatchupSummary(input)), error: false };
  } catch (error) {
    console.error("Matchup summary unavailable", error);
    return { error: true };
  }
}

function TextInput({ name, label, value }: { name: string; label: string; value: string }) {
  return (
    <label className="block">
      <span className="text-sm font-bold text-slate-600">{label}</span>
      <input className="mt-2 w-full rounded-md border border-slate-200 bg-white px-3 py-3 text-lg" name={name} defaultValue={value} />
    </label>
  );
}

function Select({ name, label, value, options }: { name: string; label: string; value: string; options: string[][] }) {
  return (
    <label className="block">
      <span className="text-sm font-bold text-slate-600">{label}</span>
      <select className="mt-2 w-full rounded-md border border-slate-200 bg-white px-3 py-3 text-lg" name={name} defaultValue={value}>
        {options.map(([optionValue, text]) => (
          <option key={optionValue} value={optionValue}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
}

function SummaryTable({ rows }: { rows: any[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-sky-100 bg-white shadow-sm">
      <table className="w-full min-w-[920px] text-left text-base">
        <thead className="bg-skySoft text-slate-700">
          <tr>
            {["球隊", "場數", "平均得分", "平均失分", "平均分差", "最高", "最低", "勝敗", "主場平均", "客場平均", "含延長賽", "最後更新時間"].map((h) => (
              <th key={h} className="px-4 py-3">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.teamId} className="border-t border-slate-100">
              <td className="px-4 py-3 font-bold">{row.team}</td>
              <td className="numeric px-4 py-3 text-right">{row.games}</td>
              <td className="numeric px-4 py-3 text-right">{fmt(row.averageScored)}</td>
              <td className="numeric px-4 py-3 text-right">{fmt(row.averageAllowed)}</td>
              <td className="numeric px-4 py-3 text-right">{fmt(row.averageMargin)}</td>
              <td className="numeric px-4 py-3 text-right">{fmt(row.highestScored)}</td>
              <td className="numeric px-4 py-3 text-right">{fmt(row.lowestScored)}</td>
              <td className="numeric px-4 py-3 text-right">
                {row.wins}-{row.losses}
              </td>
              <td className="numeric px-4 py-3 text-right">{fmt(row.homeAverageScored)}</td>
              <td className="numeric px-4 py-3 text-right">{fmt(row.awayAverageScored)}</td>
              <td className="px-4 py-3">{row.includeOvertime ? "是" : "否"}</td>
              <td className="numeric px-4 py-3">{row.lastUpdatedAt ? new Date(row.lastUpdatedAt).toLocaleString("zh-TW") : "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function GameLogTable({ rows }: { rows: any[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-sky-100 bg-white shadow-sm">
      <table className="w-full min-w-[780px] text-left text-base">
        <thead className="bg-skySoft text-slate-700">
          <tr>
            {["日期", "球隊", "對手", "主客", "得分", "失分", "分差", "勝敗", "含延長", "資料來源"].map((h) => (
              <th key={h} className="px-4 py-3">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows.map((row) => (
              <tr key={`${row.gameId}-${row.team}`} className="border-t border-slate-100">
                <td className="numeric px-4 py-3">{new Date(row.date).toLocaleDateString("zh-TW")}</td>
                <td className="px-4 py-3 font-bold">{row.team}</td>
                <td className="px-4 py-3">{row.opponent}</td>
                <td className="px-4 py-3">{row.homeAway}</td>
                <td className="numeric px-4 py-3 text-right">{row.scored}</td>
                <td className="numeric px-4 py-3 text-right">{row.allowed}</td>
                <td className="numeric px-4 py-3 text-right">{row.margin}</td>
                <td className="px-4 py-3">{row.result}</td>
                <td className="px-4 py-3">{row.wentOvertime ? "是" : "否"}</td>
                <td className="px-4 py-3">{row.source}</td>
              </tr>
            ))
          ) : (
            <tr>
              <td className="px-4 py-5 text-amber-800" colSpan={10}>
                資料來源目前無法取得
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function Notice({ text }: { text: string }) {
  return <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-5 text-lg font-bold text-amber-800">{text}</div>;
}

function fmt(value: number | null | undefined) {
  return value === null || value === undefined ? "-" : value.toFixed(2);
}
