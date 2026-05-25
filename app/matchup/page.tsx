import Link from "next/link";
import { DownloadButtons } from "@/components/DownloadButtons";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { StatCard } from "@/components/StatCard";
import { dict, getLang, withLang } from "@/lib/i18n";
import { getMatchupSummary } from "@/lib/matchup";
import { getMlbMatchupDetails } from "@/lib/mlb-matchup-details";
import { prisma } from "@/lib/prisma";
import { teamLabel, teamName } from "@/lib/team-names";
import { fetchCurrentSeasonGames } from "@/lib/current-season";
import { fetchUpcomingMatchups, type UpcomingMatchup } from "@/lib/upcoming-matchups";

type Search = Record<string, string | string[] | undefined>;
type TeamOption = { id: number; abbreviation: string; name: string; externalId?: string };
type MarketOdds = {
  internationalHomeOdds?: number;
  internationalAwayOdds?: number;
  taiwanHomeOdds?: number;
  taiwanAwayOdds?: number;
  bankroll: number;
};

export default async function MatchupPage({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams;
  const lang = getLang(params.lang);
  const t = dict[lang];
  const mt = t.matchup;
  const league = String(params.league ?? "NBA").toUpperCase();
  const [teamsResult, upcomingResult] = await Promise.all([loadTeams(league), loadUpcoming(league)]);
  const teams = teamsResult.teams.length ? teamsResult.teams : teamsFromUpcoming(upcomingResult.matchups);
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
  const marketOdds = {
    internationalHomeOdds: optionalNumber(params.internationalHomeOdds),
    internationalAwayOdds: optionalNumber(params.internationalAwayOdds),
    taiwanHomeOdds: optionalNumber(params.taiwanHomeOdds),
    taiwanAwayOdds: optionalNumber(params.taiwanAwayOdds),
    bankroll: optionalNumber(params.bankroll) ?? 3000
  };
  const shouldAnalyze = Boolean(params.analyze === "true" || params.upcomingGameId || params.homeTeamId || params.awayTeamId);
  const usesSyntheticTeams = homeTeamId < 0 || awayTeamId < 0;

  const summary: any =
    shouldAnalyze && usesSyntheticTeams && selectedUpcoming && league === "MLB"
      ? await getSafeExternalMlbSummary({
          matchup: selectedUpcoming,
          season,
          seasonType,
          rangeType,
          rangeValue,
          includeOvertime
        })
      : shouldAnalyze && homeTeamId && awayTeamId
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
    league === "MLB" && shouldAnalyze && homeTeamId && awayTeamId && !usesSyntheticTeams
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
    splitHomeAway: String(splitHomeAway),
    bankroll: String(marketOdds.bankroll)
  });
  if (marketOdds.internationalHomeOdds) query.set("internationalHomeOdds", String(marketOdds.internationalHomeOdds));
  if (marketOdds.internationalAwayOdds) query.set("internationalAwayOdds", String(marketOdds.internationalAwayOdds));
  if (marketOdds.taiwanHomeOdds) query.set("taiwanHomeOdds", String(marketOdds.taiwanHomeOdds));
  if (marketOdds.taiwanAwayOdds) query.set("taiwanAwayOdds", String(marketOdds.taiwanAwayOdds));
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
        <TextInput name="internationalHomeOdds" label={lang === "zh" ? "國際盤主隊賠率" : "Intl Home Odds"} value={inputValue(marketOdds.internationalHomeOdds)} />
        <TextInput name="internationalAwayOdds" label={lang === "zh" ? "國際盤客隊賠率" : "Intl Away Odds"} value={inputValue(marketOdds.internationalAwayOdds)} />
        <TextInput name="taiwanHomeOdds" label={lang === "zh" ? "台彩主隊賠率" : "Taiwan Home Odds"} value={inputValue(marketOdds.taiwanHomeOdds)} />
        <TextInput name="taiwanAwayOdds" label={lang === "zh" ? "台彩客隊賠率" : "Taiwan Away Odds"} value={inputValue(marketOdds.taiwanAwayOdds)} />
        <TextInput name="bankroll" label={lang === "zh" ? "本金" : "Bankroll"} value={String(marketOdds.bankroll)} />
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
          <MonteCarloPanel summary={summary} league={league} lang={lang} marketOdds={marketOdds} />
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
      select: { id: true, abbreviation: true, name: true, externalId: true }
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

async function getSafeExternalMlbSummary(input: {
  matchup: UpcomingMatchup;
  season: string;
  seasonType: string;
  rangeType: "games" | "days";
  rangeValue: number;
  includeOvertime: boolean;
}) {
  try {
    const games = await withTimeout(
      fetchCurrentSeasonGames({
        league: "MLB",
        season: input.season,
        seasonType: input.seasonType
      }),
      4500
    );
    const awaySummary = summarizeExternalMlbTeam(games, input.matchup.awayTeam, input);
    const homeSummary = summarizeExternalMlbTeam(games, input.matchup.homeTeam, input);
    return {
      dataSource: "MLB StatsAPI schedule fallback",
      sourceStatus: "Using upcoming matchup team names",
      homeTeamSummary: homeSummary,
      awayTeamSummary: awaySummary,
      comparison: {
        averageScoredDiff: diffValues(homeSummary.averageScored, awaySummary.averageScored),
        averageAllowedDiff: diffValues(homeSummary.averageAllowed, awaySummary.averageAllowed),
        averageMarginDiff: diffValues(homeSummary.averageMargin, awaySummary.averageMargin)
      },
      gameLogs: [...homeSummary.logs, ...awaySummary.logs],
      error: false
    };
  } catch (error) {
    if (!(error instanceof Error && error.message === "Timed out")) {
      console.error("External MLB summary unavailable", error);
    }
    return { error: true };
  }
}

function summarizeExternalMlbTeam(
  games: Awaited<ReturnType<typeof fetchCurrentSeasonGames>>,
  team: string,
  input: { rangeType: "games" | "days"; rangeValue: number; includeOvertime: boolean }
) {
  const cutoff = new Date(Date.now() - input.rangeValue * 24 * 60 * 60 * 1000);
  const logs = games
    .filter((game) => game.awayTeam === team || game.homeTeam === team)
    .filter((game) => input.rangeType === "games" || new Date(game.gameDate) >= cutoff)
    .sort((a, b) => Date.parse(b.gameDate) - Date.parse(a.gameDate))
    .slice(0, input.rangeType === "games" ? input.rangeValue : undefined)
    .map((game) => {
      const isHome = game.homeTeam === team;
      const scored = input.includeOvertime
        ? isHome
          ? game.homeScoreFinal
          : game.awayScoreFinal
        : isHome
          ? game.homeScoreRegulation
          : game.awayScoreRegulation;
      const allowed = input.includeOvertime
        ? isHome
          ? game.awayScoreFinal
          : game.homeScoreFinal
        : isHome
          ? game.awayScoreRegulation
          : game.homeScoreRegulation;
      return {
        gameId: game.externalGameId,
        date: game.gameDate,
        team,
        opponent: isHome ? game.awayTeam : game.homeTeam,
        homeAway: isHome ? "HOME" : "AWAY",
        scored: scored ?? 0,
        allowed: allowed ?? 0,
        margin: (scored ?? 0) - (allowed ?? 0),
        result: (scored ?? 0) > (allowed ?? 0) ? "W" : "L",
        wentOvertime: Boolean(game.wentOvertime),
        missingPeriodScoring: scored === null || allowed === null,
        source: game.dataSource
      };
    });

  if (!logs.length) {
    return {
      teamId: stableSyntheticId(team),
      team,
      games: 0,
      averageScored: null,
      averageAllowed: null,
      averageMargin: null,
      highestScored: null,
      lowestScored: null,
      wins: 0,
      losses: 0,
      homeAverageScored: null,
      awayAverageScored: null,
      streak: null,
      includeOvertime: input.includeOvertime,
      lastUpdatedAt: null,
      unavailableReason: "資料來源目前無法取得",
      logs
    };
  }

  const scored = logs.map((log) => log.scored);
  const allowed = logs.map((log) => log.allowed);
  const homeLogs = logs.filter((log) => log.homeAway === "HOME");
  const awayLogs = logs.filter((log) => log.homeAway === "AWAY");
  const wins = logs.filter((log) => log.result === "W").length;

  return {
    teamId: stableSyntheticId(team),
    team,
    games: logs.length,
    averageScored: average(scored),
    averageAllowed: average(allowed),
    averageMargin: diffValues(average(scored), average(allowed)),
    highestScored: Math.max(...scored),
    lowestScored: Math.min(...scored),
    wins,
    losses: logs.length - wins,
    homeAverageScored: average(homeLogs.map((log) => log.scored)),
    awayAverageScored: average(awayLogs.map((log) => log.scored)),
    streak: null,
    includeOvertime: input.includeOvertime,
    lastUpdatedAt: new Date().toISOString(),
    logs
  };
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number) {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("Timed out")), timeoutMs))
  ]);
}

function findTeamsForUpcoming(teams: TeamOption[], matchup: UpcomingMatchup) {
  const home = findTeamForMatchup(teams, matchup, "home");
  const away = findTeamForMatchup(teams, matchup, "away");
  if (!home || !away) return null;
  return { homeTeamId: home.id, awayTeamId: away.id };
}

function findTeamForMatchup(teams: TeamOption[], matchup: UpcomingMatchup, side: "home" | "away") {
  const abbreviation = side === "home" ? matchup.homeAbbreviation : matchup.awayAbbreviation;
  const name = side === "home" ? matchup.homeTeam : matchup.awayTeam;
  const externalId = side === "home" ? matchup.homeExternalId : matchup.awayExternalId;
  return teams.find(
    (team) =>
      team.externalId === externalId ||
      team.abbreviation === abbreviation ||
      team.name === name ||
      team.name.toLowerCase().includes(String(name).toLowerCase()) ||
      String(name).toLowerCase().includes(team.name.toLowerCase())
  );
}

function teamsFromUpcoming(matchups: UpcomingMatchup[]): TeamOption[] {
  const teams = new Map<string, TeamOption>();
  for (const matchup of matchups) {
    addUpcomingTeam(teams, matchup.homeExternalId ?? matchup.homeAbbreviation, matchup.homeAbbreviation, matchup.homeTeam);
    addUpcomingTeam(teams, matchup.awayExternalId ?? matchup.awayAbbreviation, matchup.awayAbbreviation, matchup.awayTeam);
  }
  return Array.from(teams.values());
}

function addUpcomingTeam(teams: Map<string, TeamOption>, key: string | undefined, abbreviation: string, name: string) {
  if (!key || teams.has(key)) return;
  teams.set(key, {
    id: stableSyntheticId(key),
    externalId: key,
    abbreviation: abbreviation || name,
    name
  });
}

function stableSyntheticId(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) % 100000;
  }
  return -Math.max(1, hash);
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

function MonteCarloPanel({ summary, league, lang, marketOdds }: { summary: any; league: string; lang: "zh" | "en"; marketOdds: MarketOdds }) {
  const result = runMonteCarlo(summary, league);
  if (!result) return null;
  const marketRows = buildMarketRows(result, marketOdds, lang);
  const labels =
    lang === "zh"
      ? {
          title: "Monte Carlo 10,000 次對戰模擬",
          subtitle: "根據兩隊近期平均得分、失分與主客場資料估算。結果僅供數據分析，不代表保證賽果。",
          homeWin: "主隊勝率",
          awayWin: "客隊勝率",
          avgScore: "平均比分",
          avgMargin: "平均主隊分差",
          likelyScores: "最常見比分",
          model: "模型參數",
          fairOdds: "模擬換算公平賠率",
          oddsCompare: "國際盤 / 台灣運彩賠率對比",
          noMarketOdds: "輸入國際盤或台灣運彩賠率後，這裡會直接計算 Edge、EV 與 Kelly 建議金額。"
        }
      : {
          title: "Monte Carlo 10,000 Matchup Simulations",
          subtitle: "Estimated from recent scoring, allowed points/runs, and venue splits. For analysis only.",
          homeWin: "Home Win",
          awayWin: "Away Win",
          avgScore: "Average Score",
          avgMargin: "Average Home Margin",
          likelyScores: "Most Common Scores",
          model: "Model Inputs",
          fairOdds: "Simulation Fair Odds",
          oddsCompare: "International / Taiwan Odds Comparison",
          noMarketOdds: "Enter international or Taiwan odds to calculate Edge, EV, and Kelly stake."
        };

  return (
    <section className="rounded-lg border border-sky-100 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-4 py-4">
        <div className="text-xl font-black text-ink">{labels.title}</div>
        <p className="mt-1 text-sm text-slate-600">{labels.subtitle}</p>
      </div>
      <div className="grid gap-4 p-4 md:grid-cols-4">
        <StatTile label={labels.homeWin} value={`${result.homeWinPct.toFixed(1)}%`} helper={teamName(result.homeTeam, lang)} tone="blue" />
        <StatTile label={labels.awayWin} value={`${result.awayWinPct.toFixed(1)}%`} helper={teamName(result.awayTeam, lang)} tone="emerald" />
        <StatTile label={labels.avgScore} value={`${result.awayAvgScore.toFixed(1)} - ${result.homeAvgScore.toFixed(1)}`} helper={`${teamName(result.awayTeam, lang)} @ ${teamName(result.homeTeam, lang)}`} />
        <StatTile label={labels.avgMargin} value={signed(result.averageHomeMargin)} helper={result.averageHomeMargin >= 0 ? teamName(result.homeTeam, lang) : teamName(result.awayTeam, lang)} />
      </div>
      <div className="grid gap-4 border-t border-slate-100 p-4 md:grid-cols-2">
        <div className="rounded-md border border-slate-100 bg-slate-50 p-4">
          <div className="text-sm font-black text-slate-700">{labels.fairOdds}</div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <OddsTile
              team={teamName(result.homeTeam, lang)}
              probability={result.homeWinPct / 100}
              fairOdds={result.homeFairOdds}
              lang={lang}
            />
            <OddsTile
              team={teamName(result.awayTeam, lang)}
              probability={result.awayWinPct / 100}
              fairOdds={result.awayFairOdds}
              lang={lang}
            />
          </div>
        </div>
        <div className="rounded-md border border-slate-100 bg-slate-50 p-4">
          <div className="text-sm font-black text-slate-700">{labels.oddsCompare}</div>
          {marketRows.length ? (
            <div className="mt-3 overflow-x-auto rounded-md border border-slate-100 bg-white">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="bg-skySoft text-slate-700">
                  <tr>
                    <th className="px-3 py-2">{lang === "zh" ? "來源" : "Source"}</th>
                    <th className="px-3 py-2">{lang === "zh" ? "隊伍" : "Team"}</th>
                    <th className="px-3 py-2 text-right">{lang === "zh" ? "盤口賠率" : "Book Odds"}</th>
                    <th className="px-3 py-2 text-right">{lang === "zh" ? "模型公平賠率" : "Fair Odds"}</th>
                    <th className="px-3 py-2 text-right">Edge</th>
                    <th className="px-3 py-2 text-right">EV</th>
                    <th className="px-3 py-2 text-right">Kelly</th>
                    <th className="px-3 py-2 text-right">{lang === "zh" ? "建議金額" : "Stake"}</th>
                  </tr>
                </thead>
                <tbody>
                  {marketRows.map((row) => (
                    <tr key={`${row.source}-${row.side}`} className="border-t border-slate-100">
                      <td className="px-3 py-2 font-bold">{row.source}</td>
                      <td className="px-3 py-2">{teamName(row.team, lang)}</td>
                      <td className="numeric px-3 py-2 text-right">{row.bookOdds.toFixed(2)}</td>
                      <td className="numeric px-3 py-2 text-right">{row.fairOdds.toFixed(2)}</td>
                      <td className={`numeric px-3 py-2 text-right font-black ${row.edge >= 0 ? "text-emerald-700" : "text-red-600"}`}>{pct(row.edge)}</td>
                      <td className={`numeric px-3 py-2 text-right font-black ${row.ev >= 0 ? "text-emerald-700" : "text-red-600"}`}>{pct(row.ev)}</td>
                      <td className="numeric px-3 py-2 text-right">{pct(row.kellyFraction)}</td>
                      <td className="numeric px-3 py-2 text-right font-bold">{money(row.stake, lang)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="mt-3 rounded-md bg-white p-4 text-sm text-slate-600">{labels.noMarketOdds}</div>
          )}
        </div>
      </div>
      <div className="grid gap-4 border-t border-slate-100 p-4 lg:grid-cols-[1.2fr_0.8fr]">
        <div>
          <div className="mb-2 text-sm font-black text-slate-700">{labels.likelyScores}</div>
          <div className="overflow-x-auto rounded-md border border-slate-100">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead className="bg-skySoft text-slate-700">
                <tr>
                  <th className="px-3 py-2">{lang === "zh" ? "比分" : "Score"}</th>
                  <th className="px-3 py-2">{lang === "zh" ? "勝隊" : "Winner"}</th>
                  <th className="px-3 py-2 text-right">{lang === "zh" ? "次數" : "Count"}</th>
                  <th className="px-3 py-2 text-right">{lang === "zh" ? "機率" : "Probability"}</th>
                </tr>
              </thead>
              <tbody>
                {result.commonScores.map((row) => (
                  <tr key={`${row.awayScore}-${row.homeScore}`} className="border-t border-slate-100">
                    <td className="numeric px-3 py-2 font-bold">
                      {row.awayScore} - {row.homeScore}
                    </td>
                    <td className="px-3 py-2">{teamName(row.winner, lang)}</td>
                    <td className="numeric px-3 py-2 text-right">{row.count.toLocaleString(lang === "zh" ? "zh-TW" : "en-US")}</td>
                    <td className="numeric px-3 py-2 text-right">{((row.count / result.simulations) * 100).toFixed(2)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="rounded-md bg-skySoft p-4 text-sm text-slate-700">
          <div className="font-black text-ink">{labels.model}</div>
          <dl className="mt-3 space-y-2">
            <div className="flex justify-between gap-3">
              <dt>{lang === "zh" ? "模擬次數" : "Simulations"}</dt>
              <dd className="numeric font-bold">{result.simulations.toLocaleString(lang === "zh" ? "zh-TW" : "en-US")}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt>{teamName(result.homeTeam, lang)} xScore</dt>
              <dd className="numeric font-bold">{result.homeExpected.toFixed(2)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt>{teamName(result.awayTeam, lang)} xScore</dt>
              <dd className="numeric font-bold">{result.awayExpected.toFixed(2)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt>{lang === "zh" ? "分布" : "Distribution"}</dt>
              <dd className="font-bold">{league === "MLB" ? "Poisson" : "Normal"}</dd>
            </div>
          </dl>
        </div>
      </div>
    </section>
  );
}

function StatTile({ label, value, helper, tone = "slate" }: { label: string; value: string; helper?: string; tone?: "blue" | "emerald" | "slate" }) {
  const toneClass = tone === "blue" ? "text-blue-700" : tone === "emerald" ? "text-emerald-700" : "text-ink";
  return (
    <div className="rounded-md border border-slate-100 bg-slate-50 p-4">
      <div className="text-xs font-black uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`numeric mt-2 text-3xl font-black ${toneClass}`}>{value}</div>
      {helper ? <div className="mt-1 text-sm font-bold text-slate-600">{helper}</div> : null}
    </div>
  );
}

function OddsTile({ team, probability, fairOdds, lang }: { team: string; probability: number; fairOdds: number; lang: "zh" | "en" }) {
  return (
    <div className="rounded-md bg-white p-4">
      <div className="text-sm font-black text-ink">{team}</div>
      <dl className="mt-3 space-y-2 text-sm text-slate-700">
        <div className="flex justify-between gap-3">
          <dt>{lang === "zh" ? "模擬勝率" : "Simulation Win Prob"}</dt>
          <dd className="numeric font-bold">{pct(probability)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt>{lang === "zh" ? "公平賠率" : "Fair Odds"}</dt>
          <dd className="numeric text-xl font-black text-blue-700">{fairOdds.toFixed(2)}</dd>
        </div>
      </dl>
    </div>
  );
}

function buildMarketRows(result: any, marketOdds: MarketOdds, lang: "zh" | "en") {
  const rows = [
    marketRow(lang === "zh" ? "國際盤" : "International", "home", result.homeTeam, result.homeWinPct / 100, result.homeFairOdds, marketOdds.internationalHomeOdds, marketOdds.bankroll),
    marketRow(lang === "zh" ? "國際盤" : "International", "away", result.awayTeam, result.awayWinPct / 100, result.awayFairOdds, marketOdds.internationalAwayOdds, marketOdds.bankroll),
    marketRow(lang === "zh" ? "台灣運彩" : "Taiwan Sports Lottery", "home", result.homeTeam, result.homeWinPct / 100, result.homeFairOdds, marketOdds.taiwanHomeOdds, marketOdds.bankroll),
    marketRow(lang === "zh" ? "台灣運彩" : "Taiwan Sports Lottery", "away", result.awayTeam, result.awayWinPct / 100, result.awayFairOdds, marketOdds.taiwanAwayOdds, marketOdds.bankroll)
  ];
  return rows.filter(Boolean) as Array<NonNullable<ReturnType<typeof marketRow>>>;
}

function marketRow(source: string, side: "home" | "away", team: string, modelProb: number, fairOdds: number, bookOdds: number | undefined, bankroll: number) {
  if (!bookOdds || bookOdds <= 1) return null;
  const marketProb = 1 / bookOdds;
  const edge = modelProb - marketProb;
  const ev = modelProb * bookOdds - 1;
  const b = bookOdds - 1;
  const fullKelly = b > 0 ? (b * modelProb - (1 - modelProb)) / b : 0;
  const kellyFraction = clamp(Math.max(0, fullKelly) * 0.25, 0, 0.08);
  return {
    source,
    side,
    team,
    modelProb,
    fairOdds,
    bookOdds,
    marketProb,
    edge,
    ev,
    kellyFraction,
    stake: bankroll * kellyFraction
  };
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

function inputValue(value: number | undefined) {
  return value === undefined ? "" : String(value);
}

function optionalNumber(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === undefined || raw === "") return undefined;
  const number = Number(raw);
  return Number.isFinite(number) && number > 0 ? number : undefined;
}

function textOrDash(value: string | number | null | undefined) {
  return value === null || value === undefined || value === "" ? "-" : value;
}

function runMonteCarlo(summary: any, league: string) {
  const home = summary.homeTeamSummary;
  const away = summary.awayTeamSummary;
  if (!home || !away || home.unavailableReason || away.unavailableReason) return null;

  const homeExpected = expectedScore(home, away, "HOME", league);
  const awayExpected = expectedScore(away, home, "AWAY", league);
  if (!Number.isFinite(homeExpected) || !Number.isFinite(awayExpected)) return null;

  const simulations = 10000;
  const rng = seededRandom(`${league}:${home.team}:${away.team}:${homeExpected}:${awayExpected}:${home.games}:${away.games}`);
  const scoreCounts = new Map<string, { awayScore: number; homeScore: number; winner: string; count: number }>();
  let homeWins = 0;
  let awayWins = 0;
  let homeScoreTotal = 0;
  let awayScoreTotal = 0;
  let marginTotal = 0;

  for (let index = 0; index < simulations; index += 1) {
    let homeScore = league === "MLB" ? poisson(homeExpected, rng) : Math.round(normal(homeExpected, scoreDeviation(home, away, league), rng));
    let awayScore = league === "MLB" ? poisson(awayExpected, rng) : Math.round(normal(awayExpected, scoreDeviation(away, home, league), rng));
    homeScore = Math.max(0, homeScore);
    awayScore = Math.max(0, awayScore);

    while (homeScore === awayScore) {
      if (league === "MLB") {
        homeScore += poisson(0.49, rng);
        awayScore += poisson(0.46, rng);
      } else {
        homeScore += Math.round(Math.max(0, normal(2.1, 1.2, rng)));
        awayScore += Math.round(Math.max(0, normal(1.8, 1.2, rng)));
      }
      if (homeScore !== awayScore) break;
      homeScore += rng() >= 0.5 ? 1 : 0;
      awayScore += homeScore === awayScore ? 1 : 0;
    }

    const winner = homeScore > awayScore ? home.team : away.team;
    if (winner === home.team) homeWins += 1;
    else awayWins += 1;
    homeScoreTotal += homeScore;
    awayScoreTotal += awayScore;
    marginTotal += homeScore - awayScore;

    const key = `${awayScore}-${homeScore}`;
    const current = scoreCounts.get(key);
    if (current) current.count += 1;
    else scoreCounts.set(key, { awayScore, homeScore, winner, count: 1 });
  }

  return {
    simulations,
    homeTeam: home.team,
    awayTeam: away.team,
    homeExpected,
    awayExpected,
    homeWinPct: (homeWins / simulations) * 100,
    awayWinPct: (awayWins / simulations) * 100,
    homeFairOdds: fairOdds(homeWins / simulations),
    awayFairOdds: fairOdds(awayWins / simulations),
    homeAvgScore: homeScoreTotal / simulations,
    awayAvgScore: awayScoreTotal / simulations,
    averageHomeMargin: marginTotal / simulations,
    commonScores: Array.from(scoreCounts.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 8)
  };
}

function expectedScore(team: any, opponent: any, side: "HOME" | "AWAY", league: string) {
  const leagueFallback = league === "MLB" ? 4.4 : 112;
  const recentScored = numberOr(team.averageScored, leagueFallback);
  const opponentAllowed = numberOr(opponent.averageAllowed, leagueFallback);
  const venue = side === "HOME" ? numberOr(team.homeAverageScored, recentScored) : numberOr(team.awayAverageScored, recentScored);
  const formMargin = numberOr(team.averageMargin, 0) - numberOr(opponent.averageMargin, 0);
  const homeEdge = side === "HOME" ? (league === "MLB" ? 0.12 : 1.8) : 0;
  const raw = recentScored * 0.45 + opponentAllowed * 0.35 + venue * 0.2 + formMargin * 0.08 + homeEdge;
  return clamp(raw, league === "MLB" ? 1.2 : 75, league === "MLB" ? 9.5 : 155);
}

function scoreDeviation(team: any, opponent: any, league: string) {
  if (league === "MLB") return 0;
  const teamRange = numberOr(team.highestScored, 130) - numberOr(team.lowestScored, 95);
  const opponentRange = numberOr(opponent.highestScored, 130) - numberOr(opponent.lowestScored, 95);
  return clamp((teamRange + opponentRange) / 6, 8.5, 17);
}

function seededRandom(seedInput: string) {
  let seed = 2166136261;
  for (let index = 0; index < seedInput.length; index += 1) {
    seed ^= seedInput.charCodeAt(index);
    seed = Math.imul(seed, 16777619);
  }
  return () => {
    seed += 0x6d2b79f5;
    let value = seed;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function normal(mean: number, sd: number, rng: () => number) {
  const u1 = Math.max(Number.EPSILON, rng());
  const u2 = rng();
  return mean + Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2) * sd;
}

function poisson(lambda: number, rng: () => number) {
  const limit = Math.exp(-lambda);
  let product = 1;
  let k = 0;
  do {
    k += 1;
    product *= rng();
  } while (product > limit);
  return k - 1;
}

function signed(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}`;
}

function fairOdds(probability: number) {
  return probability <= 0 ? 999 : Math.round((1 / probability) * 100) / 100;
}

function pct(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function money(value: number, lang: "zh" | "en") {
  return value.toLocaleString(lang === "zh" ? "zh-TW" : "en-US", {
    maximumFractionDigits: 0
  });
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

function average(values: number[]) {
  if (!values.length) return null;
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 100) / 100;
}

function diffValues(a: number | null, b: number | null) {
  if (a === null || b === null) return null;
  return Math.round((a - b) * 100) / 100;
}

function formatDate(value: string, lang: "zh" | "en") {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(lang === "zh" ? "zh-TW" : "en-US");
}
