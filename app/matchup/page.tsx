import Link from "next/link";
import { DownloadButtons } from "@/components/DownloadButtons";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { StatCard } from "@/components/StatCard";
import { dict, getLang, withLang } from "@/lib/i18n";
import { getMatchupSummary } from "@/lib/matchup";
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
  const homeTeamId = Number(params.homeTeamId ?? selectedTeams?.homeTeamId ?? teams[0]?.id ?? 0);
  const awayTeamId = Number(params.awayTeamId ?? selectedTeams?.awayTeamId ?? teams[1]?.id ?? 0);
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
          <GameLogTable rows={summary.gameLogs} headers={mt.logHeaders} yes={mt.yes} no={mt.no} unavailable={t.unavailable} lang={lang} />
        </section>
      ) : (
        <Notice text={t.unavailable} />
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

function formatDate(value: string, lang: "zh" | "en") {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(lang === "zh" ? "zh-TW" : "en-US");
}
