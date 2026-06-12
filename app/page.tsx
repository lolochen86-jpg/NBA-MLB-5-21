import Link from "next/link";
import { CurrentSeasonDownloads } from "@/components/CurrentSeasonDownloads";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { getLang, withLang } from "@/lib/i18n";
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

type HealthRow = {
  label: string;
  status: "ok" | "warn" | "bad";
  detail: string;
};

type DashboardData = {
  nbaUpcoming: UpcomingGame[];
  mlbUpcoming: UpcomingGame[];
  healthRows: HealthRow[];
  dbOk: boolean;
};

export default async function HomePage({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams;
  const lang = getLang(params.lang);
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
          <h1 className="mt-3 text-4xl font-black tracking-normal text-ink sm:text-5xl">NBA / MLB 數據分析中心</h1>
          <p className="mt-4 max-w-3xl text-xl leading-8 text-slate-600">
            對戰分析、回測紀錄、球員資料、賠率看板與完整賽季下載。資料缺漏會明確標示，不自行編造。
          </p>
          {!data.dbOk ? (
            <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-base font-bold text-amber-800">
              Supabase 目前無法連線；部分資料會暫時顯示為未取得。
            </div>
          ) : null}
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-5 px-5 py-8 sm:grid-cols-2 lg:grid-cols-3">
        {[
          ["NBA 對戰分析", withLang("/matchup?league=NBA", lang), "季後賽 / 例行賽近期得失分與對戰查詢"],
          ["MLB 對戰分析", withLang("/matchup?league=MLB", lang), "先發投手、牛棚、傷兵與左右投拆分"],
          ["球員數據", withLang("/players", lang), "NBA / MLB 球員資料與下載入口"],
          ["賠率看板", "/odds-board", "國際盤、自動轉台灣十進位格式與賽果對照"],
          ["回測紀錄", withLang("/backtest", lang), "本季預測 vs 實際比分、大小分與模型診斷"],
          ["下載中心", withLang("/matchup?league=NBA", lang), "CSV、Excel、JSON 與完整賽季資料"]
        ].map(([title, href, text]) => (
          <Link
            key={title}
            href={href}
            className="rounded-lg border border-sky-100 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
          >
            <div className="text-xl font-black text-ink">{title}</div>
            <div className="mt-3 text-base text-slate-600">{text}</div>
          </Link>
        ))}
      </section>

      <CurrentSeasonDownloads lang={lang} />

      <section className="mx-auto grid max-w-7xl gap-6 px-5 pb-12 lg:grid-cols-3">
        <ScheduleCard
          title="NBA 今日 / 即將比賽"
          games={data.nbaUpcoming}
          fallbackHref={withLang("/matchup?league=NBA", lang)}
          lang={lang}
        />
        <ScheduleCard
          title="MLB 今日 / 即將比賽"
          games={data.mlbUpcoming}
          fallbackHref={withLang("/matchup?league=MLB", lang)}
          lang={lang}
        />
        <HealthCard rows={data.healthRows} />
      </section>
    </main>
  );
}

async function loadDashboardData(): Promise<DashboardData> {
  try {
    return await withTimeout(loadDashboardDataFromDb(), 2500);
  } catch (error) {
    console.error("Dashboard data unavailable", error);
    return {
      nbaUpcoming: [],
      mlbUpcoming: [],
      dbOk: false,
      healthRows: [
        {
          label: "Supabase",
          status: "bad",
          detail: "目前無法連線"
        },
        {
          label: "官方賽程",
          status: "warn",
          detail: "請從對戰分析頁讀取"
        }
      ]
    };
  }
}

async function loadDashboardDataFromDb(): Promise<DashboardData> {
  const now = new Date();
  const soon = new Date(now);
  soon.setUTCDate(soon.getUTCDate() + 7);
  const upcomingWhere = {
    gameDate: { gte: now, lte: soon },
    status: { notIn: ["FINAL", "Final", "Postponed", "Cancelled"] }
  };

  const [nbaUpcoming, mlbUpcoming, latestSync, nbaPlayers, mlbPlayers, nbaGames, mlbGames] = await Promise.all([
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
    prisma.sourceSync.findMany({ orderBy: { fetchedAt: "desc" }, take: 4 }),
    prisma.player.count({ where: { league: "NBA" } }),
    prisma.player.count({ where: { league: "MLB" } }),
    prisma.game.count({ where: { league: "NBA" } }),
    prisma.game.count({ where: { league: "MLB" } })
  ]);

  const lastSync = latestSync[0]?.fetchedAt;
  return {
    nbaUpcoming,
    mlbUpcoming,
    dbOk: true,
    healthRows: [
      {
        label: "Supabase",
        status: "ok",
        detail: lastSync ? `已連線，最後同步 ${lastSync.toLocaleString("zh-TW")}` : "已連線，尚無同步紀錄"
      },
      {
        label: "比賽資料",
        status: nbaGames + mlbGames > 0 ? "ok" : "warn",
        detail: `NBA ${nbaGames} 場，MLB ${mlbGames} 場`
      },
      {
        label: "球員資料",
        status: nbaPlayers + mlbPlayers > 0 ? "ok" : "warn",
        detail: `NBA ${nbaPlayers} 人，MLB ${mlbPlayers} 人`
      },
      {
        label: "官方賽程",
        status: "ok",
        detail: "對戰分析頁會即時讀取 NBA / MLB 官方賽程"
      }
    ]
  };
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number) {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("Dashboard timed out")), timeoutMs))
  ]);
}

function ScheduleCard({
  title,
  games,
  fallbackHref,
  lang
}: {
  title: string;
  games: UpcomingGame[];
  fallbackHref: string;
  lang: "zh" | "en";
}) {
  return (
    <div className="rounded-lg border border-sky-100 bg-white p-6 shadow-sm">
      <h2 className="text-2xl font-black text-ink">{title}</h2>
      <div className="mt-4 space-y-3">
        {games.length ? (
          games.map((game) => (
            <Link key={game.id} href={fallbackHref} className="block rounded-md border border-slate-100 p-4 transition hover:border-blue-200 hover:bg-blue-50">
              <div className="font-bold">
                {game.awayTeam.abbreviation} {teamName(game.awayTeam.name, lang)} @ {game.homeTeam.abbreviation} {teamName(game.homeTeam.name, lang)}
              </div>
              <div className="numeric text-sm text-slate-500">{game.gameDate.toLocaleString("zh-TW")}</div>
            </Link>
          ))
        ) : (
          <Link href={fallbackHref} className="block rounded-md bg-blue-50 p-4 font-bold text-blue-800 transition hover:bg-blue-100">
            目前資料庫沒有即將比賽，前往對戰分析選擇官方最新賽程
          </Link>
        )}
      </div>
    </div>
  );
}

function HealthCard({ rows }: { rows: HealthRow[] }) {
  return (
    <div className="rounded-lg border border-sky-100 bg-white p-6 shadow-sm">
      <h2 className="text-2xl font-black text-ink">資料來源狀態</h2>
      <div className="mt-4 space-y-3">
        {rows.map((row) => (
          <div key={row.label} className="rounded-md bg-skySoft p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="font-bold">{row.label}</div>
              <StatusPill status={row.status} />
            </div>
            <div className="mt-1 text-sm text-slate-600">{row.detail}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: HealthRow["status"] }) {
  const labels = {
    ok: "可用",
    warn: "注意",
    bad: "異常"
  };
  const classes = {
    ok: "bg-emerald-50 text-emerald-700",
    warn: "bg-amber-50 text-amber-700",
    bad: "bg-rose-50 text-rose-700"
  };
  return <span className={`rounded-full px-3 py-1 text-xs font-black ${classes[status]}`}>{labels[status]}</span>;
}
