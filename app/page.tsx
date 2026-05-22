import Link from "next/link";
import { CurrentSeasonDownloads } from "@/components/CurrentSeasonDownloads";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { dict, getLang, withLang } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import { teamName } from "@/lib/team-names";

export const dynamic = "force-dynamic";

type Search = Record<string, string | string[] | undefined>;
type UpcomingGame = {
  id: number;
  gameDate: Date;
  homeTeam: { abbreviation: string; name: string };
  awayTeam: { abbreviation: string; name: string };
};
type SyncRow = {
  id: number;
  league: string;
  entity: string;
  status: string;
  fetchedAt: Date;
};

export default async function HomePage({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams;
  const lang = getLang(params.lang);
  const t = dict[lang];
  const data = await loadDashboardData();
  const query = new URLSearchParams();
  query.set("lang", lang);

  return (
    <main className="min-h-screen">
      <section className="border-b border-sky-100 bg-white">
        <div className="mx-auto max-w-7xl px-5 py-10 sm:py-14">
          <div className="flex items-start justify-between gap-4">
            <p className="text-base font-bold text-blue-700">Sports Data MVP</p>
            <LanguageSwitcher lang={lang} pathname="/" params={query} />
          </div>
          <h1 className="mt-3 text-4xl font-black tracking-normal text-ink sm:text-5xl">{t.title}</h1>
          <p className="mt-4 max-w-3xl text-xl leading-8 text-slate-600">{t.subtitle}</p>
          {data.error ? (
            <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-base font-bold text-amber-800">
              {t.unavailable}
            </div>
          ) : null}
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-5 px-5 py-8 sm:grid-cols-2 lg:grid-cols-4">
        {[
          [t.dashboard.nba, withLang("/matchup?league=NBA", lang), t.dashboard.nbaText],
          [t.dashboard.mlb, withLang("/matchup?league=MLB", lang), t.dashboard.mlbText],
          [t.dashboard.players, withLang("/players", lang), t.dashboard.playersText],
          [t.dashboard.downloads, withLang("/matchup?league=NBA", lang), t.dashboard.downloadsText]
        ].map(([title, href, text]) => (
          <Link key={title} href={href} className="rounded-lg border border-sky-100 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
            <div className="text-xl font-black text-ink">{title}</div>
            <div className="mt-3 text-base text-slate-600">{text}</div>
          </Link>
        ))}
      </section>

      <CurrentSeasonDownloads lang={lang} />

      <section className="mx-auto grid max-w-7xl gap-6 px-5 pb-12 lg:grid-cols-3">
        <ScheduleCard title={t.dashboard.nbaUpcoming} games={data.nbaUpcoming} unavailable={t.unavailable} lang={lang} />
        <ScheduleCard title={t.dashboard.mlbUpcoming} games={data.mlbUpcoming} unavailable={t.unavailable} lang={lang} />
        <div className="rounded-lg border border-sky-100 bg-white p-6 shadow-sm">
          <h2 className="text-2xl font-black text-ink">{t.dashboard.syncStatus}</h2>
          <div className="mt-4 space-y-3">
            {data.syncRows.length ? (
              data.syncRows.map((row) => (
                <div key={row.id} className="rounded-md bg-skySoft p-4">
                  <div className="font-bold">
                    {row.league} {row.entity}
                  </div>
                  <div className="text-sm text-slate-600">{row.status}</div>
                  <div className="numeric text-sm text-slate-500">
                    {t.dashboard.lastUpdated}: {row.fetchedAt.toLocaleString(lang === "zh" ? "zh-TW" : "en-US")}
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-md bg-amber-50 p-4 text-amber-800">{t.syncFirst}</div>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}

async function loadDashboardData(): Promise<{
  nbaUpcoming: UpcomingGame[];
  mlbUpcoming: UpcomingGame[];
  syncRows: SyncRow[];
  error: boolean;
}> {
  try {
    return await withTimeout(loadDashboardDataFromDb(), 2000);
  } catch (error) {
    console.error("Dashboard data unavailable", error);
    return { nbaUpcoming: [], mlbUpcoming: [], syncRows: [], error: true };
  }
}

async function loadDashboardDataFromDb(): Promise<{
  nbaUpcoming: UpcomingGame[];
  mlbUpcoming: UpcomingGame[];
  syncRows: SyncRow[];
  error: boolean;
}> {
    const now = new Date();
    const soon = new Date(now);
    soon.setUTCDate(soon.getUTCDate() + 7);
    const upcomingWhere = {
      gameDate: { gte: now, lte: soon },
      status: { notIn: ["FINAL", "Postponed"] }
    };
    const [nbaUpcoming, mlbUpcoming, syncRows] = await Promise.all([
      prisma.game.findMany({
        where: { league: "NBA", ...upcomingWhere },
        include: { homeTeam: true, awayTeam: true },
        orderBy: { gameDate: "asc" },
        take: 5
      }),
      prisma.game.findMany({
        where: { league: "MLB", ...upcomingWhere },
        include: { homeTeam: true, awayTeam: true },
        orderBy: { gameDate: "asc" },
        take: 5
      }),
      prisma.sourceSync.findMany({ orderBy: { fetchedAt: "desc" }, take: 6 })
    ]);
    return { nbaUpcoming, mlbUpcoming, syncRows, error: false };
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number) {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("Dashboard timed out")), timeoutMs))
  ]);
}

function ScheduleCard({ title, games, unavailable, lang }: { title: string; games: UpcomingGame[]; unavailable: string; lang: "zh" | "en" }) {
  return (
    <div className="rounded-lg border border-sky-100 bg-white p-6 shadow-sm">
      <h2 className="text-2xl font-black text-ink">{title}</h2>
      <div className="mt-4 space-y-3">
        {games.length ? (
          games.map((game) => (
            <div key={game.id} className="rounded-md border border-slate-100 p-4">
              <div className="font-bold">
                {game.awayTeam.abbreviation} {teamName(game.awayTeam.name, lang)} @ {game.homeTeam.abbreviation} {teamName(game.homeTeam.name, lang)}
              </div>
              <div className="numeric text-sm text-slate-500">{game.gameDate.toLocaleString("zh-TW")}</div>
            </div>
          ))
        ) : (
          <div className="rounded-md bg-amber-50 p-4 text-amber-800">{unavailable}</div>
        )}
      </div>
    </div>
  );
}
