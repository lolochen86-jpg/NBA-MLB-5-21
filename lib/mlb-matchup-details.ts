import { prisma } from "@/lib/prisma";

export type MlbTeamDetail = {
  teamId: number;
  teamName: string;
  starter: PitcherDetail | null;
  bullpenEra: string | null;
  injuredHitters: InjuredHitterDetail[];
};

export type PitcherDetail = {
  id: string;
  name: string;
  era: string | null;
  whip: string | null;
  inningsPitched: string | null;
  gamesStarted: string | number | null;
  wins: string | number | null;
  losses: string | number | null;
  strikeOuts: string | number | null;
  baseOnBalls: string | number | null;
};

export type InjuredHitterDetail = {
  id: string;
  name: string;
  note: string;
  avg: string | null;
  ops: string | null;
  homeRuns: string | number | null;
  rbi: string | number | null;
  atBats: string | number | null;
};

type Side = "home" | "away";

const MLB_API = "https://statsapi.mlb.com/api/v1";
const MLB_LIVE_API = "https://statsapi.mlb.com/api/v1.1";

export async function getMlbMatchupDetails(input: {
  homeTeamId: number;
  awayTeamId: number;
  upcomingGameId?: string | string[];
  season: string;
}) {
  const [homeTeam, awayTeam] = await Promise.all([
    prisma.team.findUnique({ where: { id: input.homeTeamId } }),
    prisma.team.findUnique({ where: { id: input.awayTeamId } })
  ]);
  if (!homeTeam || !awayTeam) return null;

  const probablePitchers = await fetchProbablePitchers(String(input.upcomingGameId ?? ""));
  const [home, away] = await Promise.all([
    buildTeamDetail({
      side: "home",
      teamId: Number(homeTeam.externalId),
      teamName: homeTeam.name,
      probablePitcher: probablePitchers.home,
      season: input.season
    }),
    buildTeamDetail({
      side: "away",
      teamId: Number(awayTeam.externalId),
      teamName: awayTeam.name,
      probablePitcher: probablePitchers.away,
      season: input.season
    })
  ]);

  return { home, away };
}

async function buildTeamDetail(input: {
  side: Side;
  teamId: number;
  teamName: string;
  probablePitcher: { id: number; fullName: string } | null;
  season: string;
}): Promise<MlbTeamDetail> {
  const [starterStats, bullpenEra, injuredHitters] = await Promise.all([
    input.probablePitcher ? fetchPitcherDetail(input.probablePitcher, input.season) : null,
    fetchBullpenEra(input.teamId, input.probablePitcher?.id, input.season),
    fetchInjuredHitters(input.teamId, input.season)
  ]);

  return {
    teamId: input.teamId,
    teamName: input.teamName,
    starter: starterStats,
    bullpenEra,
    injuredHitters
  };
}

async function fetchProbablePitchers(gamePk: string) {
  if (!gamePk) return { home: null, away: null };
  try {
    const payload = await fetchJson(`${MLB_LIVE_API}/game/${gamePk}/feed/live`);
    return {
      home: pitcherFromPayload(payload.gameData?.probablePitchers?.home),
      away: pitcherFromPayload(payload.gameData?.probablePitchers?.away)
    };
  } catch {
    return { home: null, away: null };
  }
}

async function fetchPitcherDetail(pitcher: { id: number; fullName: string }, season: string): Promise<PitcherDetail> {
  const stats = await fetchPlayerStats(pitcher.id, season, "pitching");
  return {
    id: String(pitcher.id),
    name: pitcher.fullName,
    era: textValue(stats.era),
    whip: textValue(stats.whip),
    inningsPitched: textValue(stats.inningsPitched),
    gamesStarted: value(stats.gamesStarted),
    wins: value(stats.wins),
    losses: value(stats.losses),
    strikeOuts: value(stats.strikeOuts),
    baseOnBalls: value(stats.baseOnBalls)
  };
}

async function fetchBullpenEra(teamId: number, starterId: number | undefined, season: string) {
  try {
    const payload = await fetchJson(
      `${MLB_API}/teams/${teamId}/roster?rosterType=active&hydrate=person(stats(type=season,group=[pitching],season=${season}))`
    );
    const pitcherStats = (payload.roster ?? [])
      .filter((row: any) => row.position?.type === "Pitcher")
      .filter((row: any) => Number(row.person?.id) !== starterId)
      .map((row: any) => statByGroup(row.person, "pitching"))
      .filter(Boolean);

    const totals = pitcherStats.reduce(
      (sum: { earnedRuns: number; outs: number }, stat: any) => ({
        earnedRuns: sum.earnedRuns + numberValue(stat.earnedRuns),
        outs: sum.outs + numberValue(stat.outs)
      }),
      { earnedRuns: 0, outs: 0 }
    );
    if (!totals.outs) return null;
    return ((totals.earnedRuns * 27) / totals.outs).toFixed(2);
  } catch {
    return null;
  }
}

async function fetchInjuredHitters(teamId: number, season: string) {
  try {
    const endDate = todayIsoDate();
    const startDate = addDaysIsoDate(-120);
    const payload = await fetchJson(`${MLB_API}/transactions?teamId=${teamId}&startDate=${startDate}&endDate=${endDate}`);
    const latestByPlayer = new Map<string, any>();

    for (const transaction of payload.transactions ?? []) {
      const personId = String(transaction.person?.id ?? "");
      if (!personId || !mentionsInjury(transaction.description)) continue;
      const current = latestByPlayer.get(personId);
      if (!current || new Date(transaction.effectiveDate ?? transaction.date) > new Date(current.effectiveDate ?? current.date)) {
        latestByPlayer.set(personId, transaction);
      }
    }

    const injured = Array.from(latestByPlayer.values()).filter((transaction: any) => isInjuredListPlacement(transaction.description));
    const details = await Promise.all(
      injured.slice(0, 8).map(async (transaction: any) => {
        const stats = await fetchPlayerStats(transaction.person.id, season, "hitting");
        if (!isMeaningfulHitter(stats)) return null;
        return {
          id: String(transaction.person.id),
          name: transaction.person.fullName,
          note: cleanInjuryNote(transaction.description),
          avg: textValue(stats.avg),
          ops: textValue(stats.ops),
          homeRuns: value(stats.homeRuns),
          rbi: value(stats.rbi),
          atBats: value(stats.atBats)
        } satisfies InjuredHitterDetail;
      })
    );

    return details.filter(Boolean).slice(0, 4) as InjuredHitterDetail[];
  } catch {
    return [];
  }
}

async function fetchPlayerStats(playerId: number, season: string, group: "pitching" | "hitting") {
  const payload = await fetchJson(`${MLB_API}/people/${playerId}/stats?stats=season&group=${group}&season=${season}`);
  return payload.stats?.[0]?.splits?.[0]?.stat ?? {};
}

async function fetchJson(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, { signal: controller.signal, next: { revalidate: 60 * 15 } });
    if (!response.ok) throw new Error(`MLB request failed: ${response.status}`);
    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function pitcherFromPayload(value: any) {
  if (!value?.id) return null;
  return { id: Number(value.id), fullName: String(value.fullName ?? "") };
}

function statByGroup(person: any, group: "pitching" | "hitting") {
  return person?.stats?.find((entry: any) => String(entry.group?.displayName).toLowerCase() === group)?.splits?.[0]?.stat;
}

function isMeaningfulHitter(stats: any) {
  return numberValue(stats.atBats) >= 30 || numberValue(stats.homeRuns) >= 1 || numberValue(stats.rbi) >= 10;
}

function mentionsInjury(description: string) {
  return /injur|IL|disabled list/i.test(description);
}

function isInjuredListPlacement(description: string) {
  return /placed .* injured list|transferred .* injured list/i.test(description) && !/reinstated|activated/i.test(description);
}

function cleanInjuryNote(description: string) {
  return description.replace(/\s+/g, " ").trim();
}

function value(input: unknown) {
  return input === undefined || input === null || input === "" ? null : (input as string | number);
}

function textValue(input: unknown) {
  return input === undefined || input === null || input === "" ? null : String(input);
}

function numberValue(input: unknown) {
  const number = Number(input);
  return Number.isFinite(number) ? number : 0;
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function addDaysIsoDate(days: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
