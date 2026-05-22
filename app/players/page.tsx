import Link from "next/link";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function PlayersPage() {
  const counts = await loadPlayerCounts();

  return (
    <main className="mx-auto min-h-screen max-w-7xl px-5 py-8">
      <Link href="/" className="text-base font-bold text-blue-700">
        首頁
      </Link>
      <h1 className="mt-2 text-4xl font-black text-ink">球員數據</h1>
      <p className="mt-2 text-lg text-slate-600">
        MVP 已建立 API 架構與頁面入口；球員 box score 會隨每日同步更新。
      </p>
      {counts.error ? (
        <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-base font-bold text-amber-800">
          資料來源目前無法取得
        </div>
      ) : null}

      <div className="mt-6 grid gap-5 md:grid-cols-2">
        <Panel
          league="NBA"
          title="NBA 球員數據"
          count={counts.nbaCount}
          fields="PTS、REB、AST、STL、BLK、FG%、3P%、FT%、MIN、TOV、PLUS_MINUS"
        />
        <Panel
          league="MLB"
          title="MLB 球員數據"
          count={counts.mlbCount}
          fields="打者 AB/R/H/HR/RBI/BB/SO 與投手 IP/H/R/ER/BB/SO/HR/ERA/WHIP"
        />
      </div>
    </main>
  );
}

async function loadPlayerCounts() {
  try {
    const [nbaCount, mlbCount] = await Promise.all([
      prisma.player.count({ where: { league: "NBA" } }),
      prisma.player.count({ where: { league: "MLB" } })
    ]);
    return { nbaCount, mlbCount, error: false };
  } catch (error) {
    console.error("Player counts unavailable", error);
    return { nbaCount: 0, mlbCount: 0, error: true };
  }
}

function Panel({ league, title, count, fields }: { league: "NBA" | "MLB"; title: string; count: number; fields: string }) {
  return (
    <section className="rounded-lg border border-sky-100 bg-white p-6 shadow-sm">
      <h2 className="text-2xl font-black text-ink">{title}</h2>
      <div className="numeric mt-4 text-4xl font-black text-blue-700">{count}</div>
      <p className="mt-3 text-base text-slate-600">
        目前已同步球員數：{count ? count : "請先同步資料"}
      </p>
      <p className="mt-3 text-base leading-7 text-slate-600">{fields}</p>
      {count > 0 ? <PlayerDownloadLinks league={league} /> : null}
    </section>
  );
}

function PlayerDownloadLinks({ league }: { league: "NBA" | "MLB" }) {
  const hrefFor = (format: "csv" | "xlsx" | "json") => `/api/export?type=players&league=${league}&format=${format}`;
  return (
    <div className="mt-5 flex flex-wrap gap-3">
      <a className="rounded-md bg-blue-600 px-4 py-3 text-base font-bold text-white hover:bg-blue-700" href={hrefFor("csv")}>
        下載 CSV
      </a>
      <a className="rounded-md bg-emerald-600 px-4 py-3 text-base font-bold text-white hover:bg-emerald-700" href={hrefFor("xlsx")}>
        下載 Excel
      </a>
      <a className="rounded-md bg-slate-800 px-4 py-3 text-base font-bold text-white hover:bg-slate-900" href={hrefFor("json")}>
        下載 JSON
      </a>
    </div>
  );
}
