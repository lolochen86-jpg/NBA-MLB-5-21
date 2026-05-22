import Link from "next/link";
import { DownloadButtons } from "@/components/DownloadButtons";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { StatCard } from "@/components/StatCard";
import { dict, getLang, withLang } from "@/lib/i18n";
import { getMatchupSummary } from "@/lib/matchup";
import { getMlbMatchupDetails } from "@/lib/mlb-matchup-details";
import { prisma } from "@/lib/prisma";
import { teamLabel, teamName } from "@/lib/team-names";
import { fetchUpcomingMatchups, type UpcomingMatchup } from "@/lib/upcoming-matchups";

type Search = Record<string, string | string[] | undefined>;
type TeamOption = { id: number; abbreviation: string; name: string };

export default async function MatchupPage({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams;
  const lang = getLang(params.lang);
  const t = dict[lang];
  const mt = t.matchup;
  const league = String(params.league ?? "NBA").toUpperCase();
  const [teamsResult, upcomingResult] = await Promise.all([loadTeams(league), loadUpcoming(league)]);
  const teams = teamsResult.teams;
  const selectedUpcoming = upcomingResult.matchups.find((matchup) => matchup.id === String(params.upcomingGameId ?? ""));
  const selectedTeams = selectedUpcoming ? findTeamsForUpcoming(teams, selectedUpcoming) : null;
  const homeTeamId = Number(selectedTeams?.homeTeamId ?? params.homeTeamId ?? teams[0]?.id ?? 0);
  const awayTeamId = Number(selectedTeams?.awayTeamId ?? params.awayTeamId ?? teams[1]?.id ?? 0);
  const season = String(params.season ?? (league === "NBA" ? "2025-26" : "2026"));
  const defaultSeasonType = league === "NBA" && upcomingResult.matchups.some((matchup) => matchup.seasonType === "Playoffs") ? "Playoffs" : "Regular Season";
  const hasManualTeams = Boolean(params.homeTeamId || params.awayTeamId);
  const shouldPreferPlayoffs = league === "NBA" && !hasManualTeams && defaultSeasonType === "Playoffs";
  const seasonType = selectedUpcoming?.seasonType ?? (shouldPreferPlayoffs ? "Playoffs" : String(params.seasonType ?? defaultSeasonType));
  const rangeType = String(params.rangeType ?? "games") as "games" | "days";
  const rangeValue = Number(params.rangeValue ?? 5);
  const includeOvertime = String(params.includeOvertime ?? "true") === "true";
  const splitHomeAway = String(params.splitHomeAway ?? "false") === "true";
  const shouldAnalyze = Boolean(params.analyze === "true" || params.upcomingGameId || params.homeTeamId || params.awayTeamId);

  const summary: any =
    shouldAnalyze && homeTeamId && awayTeamId
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
  const mlbDetails =
    league === "MLB" && shouldAnalyze && homeTeamId && awayTeamId
      ? await getSafeMlbDetails({ homeTeamId, awayTeamId, upcomingGameId: params.upcomingGameId, season })
      : null;

  const query = new URLSearchParams({
    lang,
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
  if (params.upcomingGameId) query.set("upcomingGameId", String(params.upcomingGameId));
  if (shouldAnalyze) query.set("analyze", "true");

  return (
    <main className="mx-auto min-h-screen max-w-7xl px-5 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link href={withLang("/", lang)} className="text-base font-bold text-blue-700">
            {t.home}
          </Link>
          <h1 className="mt-2 text-4xl font-black text-ink">
            {league} {mt.title}
          </h1>
          <p className="mt-2 text-lg text-slate-600">{mt.subtitle}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <LanguageSwitcher lang={lang} pathname="/matchup" params={query} />
          {summary && !summary.error ? <DownloadButtons queryString={query.toString()} /> : null}
        </div>
      </div>

      <form className="grid gap-4 rounded-lg border border-sky-100 bg-white p-5 shadow-sm lg:grid-cols-4" action="/matchup">
        <input type="hidden" name="lang" value={lang} />
        <input type="hidden" name="analyze" value="true" />
        <Select name="league" label="League" value={league} options={[["NBA", "NBA"], ["MLB", "MLB"]]} />
        <Select
          name="upcomingGameId"
          label={mt.upcoming}
          value={String(params.upcomingGameId ?? "")}
          options={[
            ["", upcomingResult.error ? t.unavailable : mt.manual],
            ...upcomingResult.matchups.map((matchup) => [
              matchup.id,
              `${formatDate(matchup.gameDate, lang)} ${matchup.awayAbbreviation || matchup.awayTeam} ${teamName(matchup.awayTeam, lang)} @ ${matchup.homeAbbreviation || matchup.homeTeam} ${teamName(matchup.homeTeam, lang)}`
            ])
          ]}
        />
        <TextInput name="season" label={mt.season} value={season} />
        <Select name="seasonType" label={mt.seasonType} value={seasonType} options={[["Regular Season", mt.regular], ["Playoffs", mt.playoffs]]} />
        <Select name="homeTeamId" label={mt.homeTeam} value={String(homeTeamId)} options={teams.map((team) => [String(team.id), teamLabel(team, lang)])} />
        <Select name="awayTeamId" label={mt.awayTeam} value={String(awayTeamId)} options={teams.map((team) => [String(team.id), teamLabel(team, lang)])} />
        <Select name="rangeType" label={mt.rangeType} value={rangeType} options={[["games", mt.recentGames], ["days", mt.recentDays]]} />
        <Select name="rangeValue" label="5 / 10 / 15" value={String(rangeValue)} options={[["5", "5"], ["10", "10"], ["15", "15"]]} />
        <Select name="includeOvertime" label={mt.includeOt} value={String(includeOvertime)} options={[["true", mt.yes], ["false", mt.no]]} />
        <Select name="splitHomeAway" label={mt.splitHomeAway} value={String(splitHomeAway)} options={[["false", mt.noSplit], ["true", mt.split]]} />
        <div className="flex items-end">
          <button className="w-full rounded-md bg-blue-600 px-5 py-3 text-lg font-black text-white hover:bg-blue-700">{mt.submit}</button>
        </div>
      </form>

      {selectedUpcoming ? <UpcomingCard matchup={selectedUpcoming} label={mt.selected} lang={lang} /> : null}

      {teamsResult.error ? (
        <Notice text={t.unavailable} />
      ) : !teams.length ? (
        <Notice text={t.syncFirst} />
      ) : summary?.error ? (
        <Notice text={t.unavailable} />
      ) : summary ? (
        <section className="mt-6 space-y-6">
          {summary.homeTeamSummary.unavailableReason || summary.awayTeamSummary.unavailableReason ? (
            <Notice text={summary.homeTeamSummary.unavailableReason ?? summary.awayTeamSummary.unavailableReason ?? t.unavailable} />
          ) : null}

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <StatCard title={mt.homeAvgScored} value={fmt(summary.homeTeamSummary.averageScored)} helper={teamName(summary.homeTeamSummary.team, lang)} />
            <StatCard title={mt.homeAvgAllowed} value={fmt(summary.homeTeamSummary.averageAllowed)} helper={`${summary.homeTeamSummary.wins}-${summary.homeTeamSummary.losses}`} />
            <StatCard title={mt.awayAvgScored} value={fmt(summary.awayTeamSummary.averageScored)} helper={teamName(summary.awayTeamSummary.team, lang)} />
            <StatCard title={mt.awayAvgAllowed} value={fmt(summary.awayTeamSummary.averageAllowed)} helper={`${summary.awayTeamSummary.wins}-${summary.awayTeamSummary.losses}`} />
          </div>

          <SummaryTable rows={[summary.homeTeamSummary, summary.awayTeamSummary]} headers={mt.tableHeaders} yes={mt.yes} no={mt.no} lang={lang} />
          {mlbDetails ? <MlbDetailPanel details={mlbDetails} lang={lang} /> : null}
          {mlbDetails ? <MlbPredictionPanel summary={summary} details={mlbDetails} lang={lang} /> : null}
          <GameLogTable rows={summary.gameLogs} headers={mt.logHeaders} yes={mt.yes} no={mt.no} unavailable={t.unavailable} lang={lang} />
        </section>
      ) : (
        <Notice text={lang === "zh" ? "請選擇球隊或最新未開賽對戰後按查詢。" : "Choose teams or an upcoming matchup, then run the query."} />
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

async function loadUpcoming(league: string): Promise<{ matchups: UpcomingMatchup[]; error: boolean }> {
  try {
    const matchups = await fetchUpcomingMatchups(league);
    return { matchups, error: false };
  } catch (error) {
    console.error("Upcoming matchups unavailable", error);
    return { matchups: [], error: true };
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

async function getSafeMlbDetails(input: Parameters<typeof getMlbMatchupDetails>[0]) {
  try {
    return await withTimeout(getMlbMatchupDetails(input), 2500);
  } catch (error) {
    if (!(error instanceof Error && error.message === "Timed out")) {
      console.error("MLB matchup details unavailable", error);
    }
    return null;
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number) {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("Timed out")), timeoutMs))
  ]);
}

function findTeamsForUpcoming(teams: TeamOption[], matchup: UpcomingMatchup) {
  const home = teams.find((team) => team.abbreviation === matchup.homeAbbreviation || team.name === matchup.homeTeam);
  const away = teams.find((team) => team.abbreviation === matchup.awayAbbreviation || team.name === matchup.awayTeam);
  if (!home || !away) return null;
  return { homeTeamId: home.id, awayTeamId: away.id };
}

function UpcomingCard({ matchup, label, lang }: { matchup: UpcomingMatchup; label: string; lang: "zh" | "en" }) {
  return (
    <div className="mt-6 rounded-lg border border-blue-100 bg-white p-5 shadow-sm">
      <div className="text-sm font-bold text-blue-700">{label}</div>
      <div className="mt-2 text-2xl font-black text-ink">
        {teamName(matchup.awayTeam, lang)} @ {teamName(matchup.homeTeam, lang)}
      </div>
      <div className="mt-2 text-base text-slate-600">
        {formatDate(matchup.gameDate, lang)} · {matchup.status} · {matchup.dataSource}
      </div>
    </div>
  );
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
          <option key={optionValue} value={optionValue}>{text}</option>
        ))}
      </select>
    </label>
  );
}

function SummaryTable({ rows, headers, yes, no, lang }: { rows: any[]; headers: readonly string[]; yes: string; no: string; lang: "zh" | "en" }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-sky-100 bg-white shadow-sm">
      <table className="w-full min-w-[920px] text-left text-base">
        <thead className="bg-skySoft text-slate-700">
          <tr>{headers.map((h) => <th key={h} className="px-4 py-3">{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.teamId} className="border-t border-slate-100">
              <td className="px-4 py-3 font-bold">{teamName(row.team, lang)}</td>
              <td className="numeric px-4 py-3 text-right">{row.games}</td>
              <td className="numeric px-4 py-3 text-right">{fmt(row.averageScored)}</td>
              <td className="numeric px-4 py-3 text-right">{fmt(row.averageAllowed)}</td>
              <td className="numeric px-4 py-3 text-right">{fmt(row.averageMargin)}</td>
              <td className="numeric px-4 py-3 text-right">{fmt(row.highestScored)}</td>
              <td className="numeric px-4 py-3 text-right">{fmt(row.lowestScored)}</td>
              <td className="numeric px-4 py-3 text-right">{row.wins}-{row.losses}</td>
              <td className="numeric px-4 py-3 text-right">{fmt(row.homeAverageScored)}</td>
              <td className="numeric px-4 py-3 text-right">{fmt(row.awayAverageScored)}</td>
              <td className="px-4 py-3">{row.includeOvertime ? yes : no}</td>
              <td className="numeric px-4 py-3">{row.lastUpdatedAt ? new Date(row.lastUpdatedAt).toLocaleString(lang === "zh" ? "zh-TW" : "en-US") : "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MlbDetailPanel({ details, lang }: { details: any; lang: "zh" | "en" }) {
  const labels =
    lang === "zh"
      ? {
          title: "先發投手、牛棚與傷兵野手",
          team: "球隊",
          starter: "先發投手",
          starterStats: "先發基本數據",
          bullpenEra: "牛棚防禦率",
          injuredHitters: "傷病重要野手",
          unavailable: "目前無法取得"
        }
      : {
          title: "Starting Pitchers, Bullpen and Injured Hitters",
          team: "Team",
          starter: "Starter",
          starterStats: "Starter Stats",
          bullpenEra: "Bullpen ERA",
          injuredHitters: "Key Injured Hitters",
          unavailable: "Unavailable"
        };
  const rows = [details.away, details.home].filter(Boolean);

  return (
    <section className="rounded-lg border border-sky-100 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-4 py-3 text-lg font-black text-ink">{labels.title}</div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] text-left text-base">
          <thead className="bg-skySoft text-slate-700">
            <tr>
              <th className="px-4 py-3">{labels.team}</th>
              <th className="px-4 py-3">{labels.starter}</th>
              <th className="px-4 py-3">{labels.starterStats}</th>
              <th className="px-4 py-3">{labels.bullpenEra}</th>
              <th className="px-4 py-3">{labels.injuredHitters}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row: any) => (
              <tr key={row.teamId} className="border-t border-slate-100 align-top">
                <td className="px-4 py-3 font-bold">{teamName(row.teamName, lang)}</td>
                <td className="px-4 py-3">{row.starter?.name ?? labels.unavailable}</td>
                <td className="px-4 py-3">
                  {row.starter ? (
                    <div className="space-y-1">
                      <div>ERA {textOrDash(row.starter.era)} / WHIP {textOrDash(row.starter.whip)} / IP {textOrDash(row.starter.inningsPitched)}</div>
                      <div>GS {textOrDash(row.starter.gamesStarted)} / W-L {textOrDash(row.starter.wins)}-{textOrDash(row.starter.losses)} / SO-BB {textOrDash(row.starter.strikeOuts)}-{textOrDash(row.starter.baseOnBalls)}</div>
                    </div>
                  ) : (
                    labels.unavailable
                  )}
                </td>
                <td className="numeric px-4 py-3 text-right">{textOrDash(row.bullpenEra)}</td>
                <td className="px-4 py-3">
                  {row.injuredHitters?.length ? (
                    <div className="space-y-2">
                      {row.injuredHitters.map((hitter: any) => (
                        <div key={hitter.id}>
                          <div className="font-bold">{hitter.name}</div>
                          <div className="text-sm text-slate-600">
                            AVG {textOrDash(hitter.avg)} / OPS {textOrDash(hitter.ops)} / HR {textOrDash(hitter.homeRuns)} / RBI {textOrDash(hitter.rbi)} / AB {textOrDash(hitter.atBats)}
                          </div>
                          <div className="text-xs text-amber-700">{hitter.note}</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    labels.unavailable
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function MlbPredictionPanel({ summary, details, lang }: { summary: any; details: any; lang: "zh" | "en" }) {
  const away = buildMlbPrediction(summary.awayTeamSummary, summary.homeTeamSummary, details.away, details.home, "AWAY");
  const home = buildMlbPrediction(summary.homeTeamSummary, summary.awayTeamSummary, details.home, details.away, "HOME");
  const confidence = predictionConfidence([away, home], details);
  const labels =
    lang === "zh"
      ? {
          title: "預測比分",
          team: "球隊",
          projected: "預估得分",
          range: "建議區間",
          factors: "主要依據",
          confidence: "信心",
          note: "這是依近期得失分、主客場、先發投手、牛棚與傷兵做出的估算，僅供比賽分析參考。"
        }
      : {
          title: "Projected Score",
          team: "Team",
          projected: "Projected Runs",
          range: "Range",
          factors: "Main Factors",
          confidence: "Confidence",
          note: "Estimate based on recent scoring, venue split, starters, bullpen and injuries. Use as analysis context only."
        };
  const rows = [away, home];

  return (
    <section className="rounded-lg border border-sky-100 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <div className="text-lg font-black text-ink">{labels.title}</div>
        <div className="rounded-md bg-blue-50 px-3 py-1 text-sm font-bold text-blue-700">
          {labels.confidence}: {confidence}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-base">
          <thead className="bg-skySoft text-slate-700">
            <tr>
              <th className="px-4 py-3">{labels.team}</th>
              <th className="px-4 py-3 text-right">{labels.projected}</th>
              <th className="px-4 py-3">{labels.range}</th>
              <th className="px-4 py-3">{labels.factors}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.team} className="border-t border-slate-100">
                <td className="px-4 py-3 font-bold">{teamName(row.team, lang)}</td>
                <td className="numeric px-4 py-3 text-right text-xl font-black">{row.projected.toFixed(1)}</td>
                <td className="numeric px-4 py-3">{row.low}-{row.high}</td>
                <td className="px-4 py-3 text-sm text-slate-600">{row.factors.join(" / ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="border-t border-slate-100 px-4 py-3 text-sm text-slate-500">{labels.note}</div>
    </section>
  );
}

function buildMlbPrediction(team: any, opponent: any, teamDetails: any, opponentDetails: any, side: "HOME" | "AWAY") {
  const recentOffense = numberOr(team.averageScored, 4.2);
  const opponentDefense = numberOr(opponent.averageAllowed, 4.2);
  const venueAverage = side === "HOME" ? numberOr(team.homeAverageScored, recentOffense) : numberOr(team.awayAverageScored, recentOffense);
  const opponentStarterEra = numberOr(opponentDetails?.starter?.era, opponentDefense);
  const opponentBullpenEra = numberOr(opponentDetails?.bullpenEra, opponentDefense);
  const injuryPenalty = Math.min(0.8, (teamDetails?.injuredHitters?.length ?? 0) * 0.25);

  const raw =
    recentOffense * 0.28 +
    opponentDefense * 0.22 +
    venueAverage * 0.18 +
    opponentStarterEra * 0.18 +
    opponentBullpenEra * 0.14 -
    injuryPenalty;
  const projected = clamp(roundOne(raw), 0.5, 12);
  const spread = predictionSpread(team.games, opponentDetails);

  return {
    team: team.team,
    projected,
    low: Math.max(0, Math.floor(projected - spread)),
    high: Math.ceil(projected + spread),
    factors: [
      `近況 ${fmt(team.averageScored)}`,
      `${side === "HOME" ? "主場" : "客場"} ${fmt(venueAverage)}`,
      `對方先發 ERA ${textOrDash(opponentDetails?.starter?.era)}`,
      `對方牛棚 ERA ${textOrDash(opponentDetails?.bullpenEra)}`
    ]
  };
}

function predictionSpread(games: number, opponentDetails: any) {
  let spread = games >= 10 ? 1.5 : 2;
  if (!opponentDetails?.starter) spread += 0.4;
  if (!opponentDetails?.bullpenEra) spread += 0.3;
  return spread;
}

function predictionConfidence(rows: Array<{ high: number; low: number }>, details: any) {
  const hasStarters = Boolean(details.home?.starter && details.away?.starter);
  const hasBullpens = Boolean(details.home?.bullpenEra && details.away?.bullpenEra);
  const averageRange = rows.reduce((sum, row) => sum + (row.high - row.low), 0) / rows.length;
  if (hasStarters && hasBullpens && averageRange <= 4) return "中";
  return "低";
}

function GameLogTable({ rows, headers, yes, no, unavailable, lang }: { rows: any[]; headers: readonly string[]; yes: string; no: string; unavailable: string; lang: "zh" | "en" }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-sky-100 bg-white shadow-sm">
      <table className="w-full min-w-[780px] text-left text-base">
        <thead className="bg-skySoft text-slate-700">
          <tr>{headers.map((h) => <th key={h} className="px-4 py-3">{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.length ? rows.map((row) => (
            <tr key={`${row.gameId}-${row.team}`} className="border-t border-slate-100">
              <td className="numeric px-4 py-3">{new Date(row.date).toLocaleDateString(lang === "zh" ? "zh-TW" : "en-US")}</td>
              <td className="px-4 py-3 font-bold">{teamName(row.team, lang)}</td>
              <td className="px-4 py-3">{teamName(row.opponent, lang)}</td>
              <td className="px-4 py-3">{row.homeAway}</td>
              <td className="numeric px-4 py-3 text-right">{row.scored}</td>
              <td className="numeric px-4 py-3 text-right">{row.allowed}</td>
              <td className="numeric px-4 py-3 text-right">{row.margin}</td>
              <td className="px-4 py-3">{row.result}</td>
              <td className="px-4 py-3">{row.wentOvertime ? yes : no}</td>
              <td className="px-4 py-3">{row.source}</td>
            </tr>
          )) : (
            <tr><td className="px-4 py-5 text-amber-800" colSpan={10}>{unavailable}</td></tr>
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

function textOrDash(value: string | number | null | undefined) {
  return value === null || value === undefined || value === "" ? "-" : value;
}

function numberOr(value: unknown, fallback: number) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function roundOne(value: number) {
  return Math.round(value * 10) / 10;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function formatDate(value: string, lang: "zh" | "en") {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(lang === "zh" ? "zh-TW" : "en-US");
}
