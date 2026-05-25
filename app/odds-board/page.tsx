import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { oddsTeamName } from "@/lib/odds-team-names";
import { OddsBoardClient, type OddsBoardRow } from "./OddsBoardClient";

export const dynamic = "force-dynamic";

export default async function OddsBoardPage() {
  const { rows, error } = await loadOddsRows();

  return (
    <main className="min-h-screen bg-skySoft">
      <section className="border-b border-sky-100 bg-white">
        <div className="mx-auto max-w-7xl px-5 py-7">
          <Link className="text-base font-black text-blue-700" href="/">
            返回首頁
          </Link>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-3xl font-black tracking-normal text-ink sm:text-5xl">NBA / MLB 國際盤賽程表</h1>
              <p className="mt-3 max-w-3xl text-lg leading-8 text-slate-600">
                依比賽賽程分組顯示國際盤，隊名以中文呈現，已完賽比賽會在卡片最下方顯示比分。
              </p>
            </div>
            <div className="rounded-md bg-blue-50 px-4 py-3 text-base font-black text-blue-800">
              最新 {rows.length} 筆盤口
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-6">
        <OddsBoardClient rows={rows} initialMessage={error} />
      </section>
    </main>
  );
}

async function loadOddsRows(): Promise<{ rows: OddsBoardRow[]; error?: string }> {
  try {
    const snapshots = await prisma.oddsSnapshot.findMany({
      include: { game: true },
      orderBy: [{ snapshotTime: "desc" }, { id: "desc" }],
      take: 1000
    });
    const scores = await loadFinalScores();

    return {
      rows: snapshots.map((snapshot) => {
        const gameDate = snapshot.game.commenceTime.toISOString();
        const score = scores.get(scoreKey(snapshot.league, snapshot.game.awayTeam, snapshot.game.homeTeam, gameDate));

        return {
          id: snapshot.id,
          gameKey: snapshot.game.id,
          gameTime: gameDate,
          league: snapshot.league as "NBA" | "MLB",
          awayTeam: snapshot.game.awayTeam,
          awayTeamZh: oddsTeamName(snapshot.game.awayTeam),
          homeTeam: snapshot.game.homeTeam,
          homeTeamZh: oddsTeamName(snapshot.game.homeTeam),
          market: snapshot.market as OddsBoardRow["market"],
          sportsbook: snapshot.sportsbook,
          side: snapshot.side,
          line: snapshot.line,
          decimalOdds: snapshot.decimalOdds,
          impliedProbability: snapshot.impliedProbability,
          snapshotTime: snapshot.snapshotTime.toISOString(),
          finalScore: score ?? null
        };
      })
    };
  } catch (error) {
    console.error("Odds board data unavailable", error);
    return {
      rows: [],
      error: "資料庫尚未連線，請先確認 Supabase DATABASE_URL 與 games / odds_snapshots 資料表"
    };
  }
}

async function loadFinalScores() {
  const completedGames = await prisma.game.findMany({
    where: {
      league: { in: ["NBA", "MLB"] },
      status: { in: ["FINAL", "Final"] },
      awayScoreFinal: { not: null },
      homeScoreFinal: { not: null }
    },
    include: { awayTeam: true, homeTeam: true },
    orderBy: { gameDate: "desc" },
    take: 500
  });

  const scores = new Map<string, NonNullable<OddsBoardRow["finalScore"]>>();

  for (const game of completedGames) {
    if (game.awayScoreFinal === null || game.homeScoreFinal === null) continue;
    scores.set(scoreKey(game.league, game.awayTeam.name, game.homeTeam.name, game.gameDate.toISOString()), {
      away: game.awayScoreFinal,
      home: game.homeScoreFinal,
      status: game.status
    });
  }

  return scores;
}

function scoreKey(league: string, awayTeam: string, homeTeam: string, date: string) {
  return `${league}|${awayTeam}|${homeTeam}|${date.slice(0, 10)}`;
}
