import { prisma } from "@/lib/prisma";

export type MlbTeamDetail = {
  teamId: number;
  teamName: string;
  starter: PitcherDetail | null;
  bullpenEra: string | null;
  bullpenUsage: BullpenUsageDetail | null;
  injuredHitters: InjuredHitterDetail[];
  handednessSplit: HandednessSplitDetail | null;
};

export type PitcherDetail = {
  id: string;
  name: string;
  pitchHand: string | null;
  era: string | null;
  whip: string | null;
  inningsPitched: string | null;
  gamesStarted: string | number | null;
  wins: string | number | null;
  losses: string | number | null;
  strikeOuts: string | number | null;
  baseOnBalls: string | number | null;
};

export type BullpenUsageDetail = {
  inningsLast3Days: string;
  inningsLast7Days: string;
  appearancesLast3Days: number;
  appearancesLast7Days: number;
  pitchesLast3Days: number | null;
  pitchesLast7Days: number | null;
  highUseRelievers: string[];
  note: string;
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

export type HandednessSplitDetail = {
  vsLeftOps: string | null;
  vsRightOps: string | null;
  vsLeftAvg: string | null;
  vsRightAvg: string | null;
  source: string;
  note: string;
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
  probablePitcher: { id: number; fullName: string; pitchHand: string | null } | null;
  season: string;
}): Promise<MlbTeamDetail> {
  const [starterStats, bullpenEra, injuredHitters] = await Promise.all([
    input.probablePitcher ? fetchPitcherDetail(input.probablePitcher, input.season) : null,
    fetchBullpenEra(input.teamId, input.probablePitcher?.id, input.season),
    fetchInjuredHitters(input.teamId, input.season)
  ]);
  const [bullpenUsage, handednessSplit] = await Promise.all([
    fetchBullpenUsage(input.teamId),
    fetchHandednessSplit(input.teamId, input.season)
  ]);

  return {
    teamId: input.teamId,
    teamName: input.teamName,
    starter: starterStats,
    bullpenEra,
    bullpenUsage,
    injuredHitters,
    handednessSplit
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

async function fetchPitcherDetail(pitcher: { id: number; fullName: string; pitchHand: string | null }, season: string): Promise<PitcherDetail> {
  const [stats, pitchHand] = await Promise.all([
    fetchPlayerStats(pitcher.id, season, "pitching"),
    pitcher.pitchHand ? Promise.resolve(pitcher.pitchHand) : fetchPlayerPitchHand(pitcher.id)
  ]);
  return {
    id: String(pitcher.id),
    name: pitcher.fullName,
    pitchHand,
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

async function fetchBullpenUsage(teamId: number): Promise<BullpenUsageDetail | null> {
  try {
    const endDate = todayIsoDate();
    const startDate = addDaysIsoDate(-7);
    const payload = await fetchJson(
      `${MLB_API}/schedule?sportId=1&teamId=${teamId}&startDate=${startDate}&endDate=${endDate}&hydrate=boxscore&gameTypes=R,P`
    );
    const games = (payload.dates ?? [])
      .flatMap((date: any) => date.games ?? [])
      .filter((game: any) => isFinalGame(game))
      .slice(-2);
    const boxscores = await Promise.all(
      games.map(async (game: any) => ({
        gamePk: game.gamePk,
        boxscore: game.boxscore ?? (game.gamePk ? await fetchGameBoxscore(game.gamePk) : null)
      }))
    );
    const boxscoreByGame = new Map(boxscores.map((item) => [String(item.gamePk), item.boxscore]));

    const cutoff3 = new Date(`${addDaysIsoDate(-3)}T00:00:00.000Z`);
    const usage = {
      innings3: 0,
      innings7: 0,
      appearances3: 0,
      appearances7: 0,
      pitches3: 0,
      pitches7: 0,
      hasPitches: false,
      relieverPitches: new Map<string, { name: string; pitches: number; appearances: number }>()
    };

    for (const game of games) {
      const side = Number(game.teams?.home?.team?.id) === teamId ? "home" : "away";
      const boxscore = boxscoreByGame.get(String(game.gamePk));
      const teamBox = boxscore?.teams?.[side];
      if (!teamBox) continue;
      const pitcherIds = (teamBox.pitchers ?? []).map((id: any) => Number(id)).filter(Boolean);
      const relieverIds = pitcherIds.slice(1);
      const isLast3 = new Date(`${game.officialDate ?? game.gameDate}T00:00:00.000Z`) >= cutoff3;

      for (const pitcherId of relieverIds) {
        const player = teamBox.players?.[`ID${pitcherId}`];
        const stat = player?.stats?.pitching ?? {};
        const innings = inningsToNumber(stat.inningsPitched);
        const pitches = Number(stat.pitchesThrown);
        usage.innings7 += innings;
        usage.appearances7 += 1;
        if (Number.isFinite(pitches)) {
          usage.pitches7 += pitches;
          usage.hasPitches = true;
        }
        if (isLast3) {
          usage.innings3 += innings;
          usage.appearances3 += 1;
          if (Number.isFinite(pitches)) usage.pitches3 += pitches;
        }
        if (Number.isFinite(pitches) && pitches >= 25) {
          const key = String(pitcherId);
          const current = usage.relieverPitches.get(key) ?? {
            name: player?.person?.fullName ?? `#${pitcherId}`,
            pitches: 0,
            appearances: 0
          };
          current.pitches += pitches;
          current.appearances += 1;
          usage.relieverPitches.set(key, current);
        }
      }
    }

    return {
      inningsLast3Days: usage.innings3.toFixed(1),
      inningsLast7Days: usage.innings7.toFixed(1),
      appearancesLast3Days: usage.appearances3,
      appearancesLast7Days: usage.appearances7,
      pitchesLast3Days: usage.hasPitches ? usage.pitches3 : null,
      pitchesLast7Days: usage.hasPitches ? usage.pitches7 : null,
      highUseRelievers: Array.from(usage.relieverPitches.values())
        .sort((a, b) => b.pitches - a.pitches)
        .slice(0, 3)
        .map((reliever) => `${reliever.name} ${reliever.pitches}P/${reliever.appearances}G`),
      note: games.length ? "最近 3/7 天非先發投手累計" : "最近 7 天沒有可用 boxscore"
    };
  } catch {
    return null;
  }
}

async function fetchGameBoxscore(gamePk: string | number) {
  try {
    return await fetchJson(`${MLB_API}/game/${gamePk}/boxscore`, 2500);
  } catch {
    return null;
  }
}

async function fetchPlayerPitchHand(playerId: number) {
  try {
    const payload = await fetchJson(`${MLB_API}/people/${playerId}`);
    return textValue(payload.people?.[0]?.pitchHand?.code ?? payload.people?.[0]?.pitchHand?.description);
  } catch {
    return null;
  }
}

async function fetchHandednessSplit(teamId: number, season: string): Promise<HandednessSplitDetail | null> {
  const [vsLeft, vsRight] = await Promise.all([
    fetchTeamSplit(teamId, season, "vl"),
    fetchTeamSplit(teamId, season, "vr")
  ]);
  if (!vsLeft && !vsRight) {
    return {
      vsLeftOps: null,
      vsRightOps: null,
      vsLeftAvg: null,
      vsRightAvg: null,
      source: "MLB StatsAPI statSplits",
      note: "官方分拆資料暫時無法取得"
    };
  }
  return {
    vsLeftOps: textValue(vsLeft?.ops),
    vsRightOps: textValue(vsRight?.ops),
    vsLeftAvg: textValue(vsLeft?.avg),
    vsRightAvg: textValue(vsRight?.avg),
    source: "MLB StatsAPI statSplits",
    note: "打線對左投 / 右投球季分拆"
  };
}

async function fetchTeamSplit(teamId: number, season: string, sitCode: "vl" | "vr") {
  try {
    const payload = await fetchJson(
      `${MLB_API}/teams/${teamId}/stats?stats=statSplits&group=hitting&season=${season}&sitCodes=${sitCode}`,
      2500
    );
    return payload.stats?.[0]?.splits?.[0]?.stat ?? null;
  } catch {
    return null;
  }
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

async function fetchJson(url: string, timeoutMs = 2500) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
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
  return {
    id: Number(value.id),
    fullName: String(value.fullName ?? ""),
    pitchHand: textValue(value.pitchHand?.code ?? value.pitchHand?.description)
  };
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

function inningsToNumber(value: unknown) {
  const text = String(value ?? "");
  const [wholeText, outsText] = text.split(".");
  const whole = Number(wholeText);
  const outs = Number(outsText ?? 0);
  if (!Number.isFinite(whole)) return 0;
  return whole + (Number.isFinite(outs) ? outs / 3 : 0);
}

function isFinalGame(game: any) {
  const status = `${game.status?.abstractGameState ?? ""} ${game.status?.detailedState ?? ""}`.toLowerCase();
  return status.includes("final") || status.includes("completed");
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function addDaysIsoDate(days: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
