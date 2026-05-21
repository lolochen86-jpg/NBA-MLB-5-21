import Link from "next/link";
import { prisma } from "@/lib/prisma";

export default async function PlayersPage() {
  const [nbaCount, mlbCount] = await Promise.all([
    prisma.player.count({ where: { league: "NBA" } }),
    prisma.player.count({ where: { league: "MLB" } })
  ]);

  return (
    <main className="mx-auto min-h-screen max-w-7xl px-5 py-8">
      <Link href="/" className="text-base font-bold text-blue-700">首頁</Link>
      <h1 className="mt-2 text-4xl font-black text-ink">球員數據</h1>
      <p className="mt-2 text-lg text-slate-600">MVP 已建立 API 架構與頁面入口；球員 box score 需等真實同步後顯示。</p>

      <div className="mt-6 grid gap-5 md:grid-cols-2">
        <Panel title="NBA 球員數據" count={nbaCount} fields="PTS、REB、AST、STL、BLK、FG%、3P%、FT%、MIN、TOV、PLUS_MINUS" />
        <Panel title="MLB 球員數據" count={mlbCount} fields="打者 AB/R/H/HR/RBI/BB/SO 與投手 IP/H/R/ER/BB/SO/HR/ERA/WHIP" />
      </div>
    </main>
  );
}

function Panel({ title, count, fields }: { title: string; count: number; fields: string }) {
  return (
    <section className="rounded-lg border border-sky-100 bg-white p-6 shadow-sm">
      <h2 className="text-2xl font-black text-ink">{title}</h2>
      <div className="numeric mt-4 text-4xl font-black text-blue-700">{count}</div>
      <p className="mt-3 text-base text-slate-600">目前已同步球員數：{count ? count : "請先同步資料"}</p>
      <p className="mt-3 text-base leading-7 text-slate-600">{fields}</p>
    </section>
  );
}
