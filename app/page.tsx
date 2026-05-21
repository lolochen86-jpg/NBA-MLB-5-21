import Link from "next/link";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [nbaUpcoming, mlbUpcoming, syncRows] = await Promise.all([
    prisma.game.findMany({
      where: { league: "NBA", gameDate: { gte: new Date() }, status: { not: "FINAL" } },
      include: { homeTeam: true, awayTeam: true },
      orderBy: { gameDate: "asc" },
      take: 5
    }),
    prisma.game.findMany({
      where: { league: "MLB", gameDate: { gte: new Date() }, status: { not: "FINAL" } },
      include: { homeTeam: true, awayTeam: true },
      orderBy: { gameDate: "asc" },
      take: 5
    }),
    prisma.sourceSync.findMany({ orderBy: { fetchedAt: "desc" }, take: 6 })
  ]);

  return (
    <main className="min-h-screen">
      <section className="border-b border-sky-100 bg-white">
        <div className="mx-auto max-w-7xl px-5 py-10 sm:py-14">
          <p className="text-base font-bold text-blue-700">Sports Data MVP</p>
          <h1 className="mt-3 text-4xl font-black tracking-normal text-ink sm:text-5xl">
            NBA / MLB 對戰數據下載中心
          </h1>
          <p className="mt-4 max-w-3xl text-xl leading-8 text-slate-600">
            即時整理球隊近況、球員數據、得失分平均。所有資料皆來自 API 或本地 SQLite 同步快取，抓不到就不編造。
          </p>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-5 px-5 py-8 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["NBA 對戰分析", "/matchup?league=NBA", "近 5 / 10 / 15 場或日"],
          ["MLB 對戰分析", "/matchup?league=MLB", "含延長賽與九局切換"],
          ["球員數據", "/players", "NBA / MLB 分頁查詢"],
          ["下載中心", "/matchup?league=NBA", "CSV、Excel、JSON"]
        ].map(([title, href, text]) => (
          <Link key={title} href={href} className="rounded-lg border border-sky-100 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
            <div className="text-xl font-black text-ink">{title}</div>
            <div className="mt-3 text-base text-slate-600">{text}</div>
          </Link>
        ))}
      </section>

      <section className="mx-auto grid max-w-7xl gap-6 px-5 pb-12 lg:grid-cols-3">
        <ScheduleCard title="NBA 今日 / 即將比賽" games={nbaUpcoming} />
        <ScheduleCard title="MLB 今日 / 即將比賽" games={mlbUpcoming} />
        <div className="rounded-lg border border-sky-100 bg-white p-6 shadow-sm">
          <h2 className="text-2xl font-black text-ink">資料同步狀態</h2>
          <div className="mt-4 space-y-3">
            {syncRows.length ? (
              syncRows.map((row) => (
                <div key={row.id} className="rounded-md bg-skySoft p-4">
                  <div className="font-bold">{row.league} {row.entity}</div>
                  <div className="text-sm text-slate-600">{row.status}</div>
                  <div className="numeric text-sm text-slate-500">最後更新時間：{row.fetchedAt.toLocaleString("zh-TW")}</div>
                </div>
              ))
            ) : (
              <div className="rounded-md bg-amber-50 p-4 text-amber-800">請先同步資料</div>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}

function ScheduleCard({ title, games }: { title: string; games: any[] }) {
  return (
    <div className="rounded-lg border border-sky-100 bg-white p-6 shadow-sm">
      <h2 className="text-2xl font-black text-ink">{title}</h2>
      <div className="mt-4 space-y-3">
        {games.length ? (
          games.map((game) => (
            <div key={game.id} className="rounded-md border border-slate-100 p-4">
              <div className="font-bold">{game.awayTeam.abbreviation} @ {game.homeTeam.abbreviation}</div>
              <div className="numeric text-sm text-slate-500">{game.gameDate.toLocaleString("zh-TW")}</div>
            </div>
          ))
        ) : (
          <div className="rounded-md bg-amber-50 p-4 text-amber-800">資料來源目前無法取得</div>
        )}
      </div>
    </div>
  );
}
