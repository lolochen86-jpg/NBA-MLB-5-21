import { readFile } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type ImportGame = {
  league: "NBA" | "MLB";
  externalGameId: string;
  season: string;
  seasonType: string;
  gameDate: string;
  homeTeamExternalId: string;
  awayTeamExternalId: string;
  homeScoreFinal: number;
  awayScoreFinal: number;
  homeScoreRegulation: number;
  awayScoreRegulation: number;
  wentOvertime: boolean;
  status: string;
  periods: Array<{
    teamExternalId: string;
    periodNumber: number;
    periodType: "Q1" | "Q2" | "Q3" | "Q4" | "OT" | "INNING";
    runsOrPoints: number;
    isOvertimeOrExtra: boolean;
  }>;
  rawJson?: unknown;
};

type ImportFile = {
  source: string;
  fetchedAt: string;
  games: ImportGame[];
};

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    throw new Error("Usage: npm run import:games -- path/to/real-api-snapshot.json");
  }

  const payload = JSON.parse(await readFile(filePath, "utf8")) as ImportFile;
  if (!payload.source || !payload.fetchedAt || !Array.isArray(payload.games)) {
    throw new Error("匯入檔必須包含 source、fetchedAt、games，避免寫入無來源資料");
  }

  for (const game of payload.games) {
    const [homeTeam, awayTeam] = await Promise.all([
      prisma.team.findUnique({ where: { league_externalId: { league: game.league, externalId: game.homeTeamExternalId } } }),
      prisma.team.findUnique({ where: { league_externalId: { league: game.league, externalId: game.awayTeamExternalId } } })
    ]);

    if (!homeTeam || !awayTeam) {
      throw new Error(`找不到球隊：${game.externalGameId}`);
    }
    if (!game.periods?.length) {
      throw new Error(`缺少分節資料，拒絕匯入：${game.externalGameId}`);
    }

    const saved = await prisma.game.upsert({
      where: { league_externalGameId: { league: game.league, externalGameId: game.externalGameId } },
      update: {
        season: game.season,
        seasonType: game.seasonType,
        gameDate: new Date(game.gameDate),
        homeTeamId: homeTeam.id,
        awayTeamId: awayTeam.id,
        homeScoreFinal: game.homeScoreFinal,
        awayScoreFinal: game.awayScoreFinal,
        homeScoreRegulation: game.homeScoreRegulation,
        awayScoreRegulation: game.awayScoreRegulation,
        wentOvertime: game.wentOvertime,
        status: game.status,
        rawJson: game.rawJson ? JSON.stringify(game.rawJson) : null
      },
      create: {
        league: game.league,
        externalGameId: game.externalGameId,
        season: game.season,
        seasonType: game.seasonType,
        gameDate: new Date(game.gameDate),
        homeTeamId: homeTeam.id,
        awayTeamId: awayTeam.id,
        homeScoreFinal: game.homeScoreFinal,
        awayScoreFinal: game.awayScoreFinal,
        homeScoreRegulation: game.homeScoreRegulation,
        awayScoreRegulation: game.awayScoreRegulation,
        wentOvertime: game.wentOvertime,
        status: game.status,
        rawJson: game.rawJson ? JSON.stringify(game.rawJson) : null
      }
    });

    await prisma.gamePeriodScore.deleteMany({ where: { gameId: saved.id } });
    for (const period of game.periods) {
      const team = await prisma.team.findUnique({
        where: { league_externalId: { league: game.league, externalId: period.teamExternalId } }
      });
      if (!team) throw new Error(`找不到分節球隊：${game.externalGameId}`);
      await prisma.gamePeriodScore.create({
        data: {
          gameId: saved.id,
          teamId: team.id,
          periodNumber: period.periodNumber,
          periodType: period.periodType,
          runsOrPoints: period.runsOrPoints,
          isOvertimeOrExtra: period.isOvertimeOrExtra
        }
      });
    }

    await prisma.sourceSync.upsert({
      where: { league_source_entity: { league: game.league, source: payload.source, entity: "games" } },
      update: { status: "OK", message: `manual import from ${filePath}`, fetchedAt: new Date(payload.fetchedAt) },
      create: { league: game.league, source: payload.source, entity: "games", status: "OK", message: `manual import from ${filePath}`, fetchedAt: new Date(payload.fetchedAt) }
    });
  }

  console.log(`Imported ${payload.games.length} real games from ${payload.source}`);
}

main()
  .finally(async () => prisma.$disconnect());
