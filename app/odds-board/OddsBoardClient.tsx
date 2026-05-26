"use client";

import { useMemo, useState, useTransition } from "react";
import { oddsSideName } from "@/lib/odds-team-names";

export type OddsBoardRow = {
  id: string;
  gameKey: string;
  gameTime: string;
  league: "NBA" | "MLB";
  awayTeam: string;
  awayTeamZh: string;
  homeTeam: string;
  homeTeamZh: string;
  market: "h2h" | "spreads" | "totals";
  sportsbook: string;
  side: string;
  line: number | null;
  decimalOdds: number;
  impliedProbability: number;
  snapshotTime: string;
  finalScore?: {
    away: number;
    home: number;
    status: string;
  } | null;
};

type GameGroup = {
  key: string;
  league: "NBA" | "MLB";
  gameTime: string;
  awayTeam: string;
  awayTeamZh: string;
  homeTeam: string;
  homeTeamZh: string;
  finalScore?: OddsBoardRow["finalScore"];
  rows: OddsBoardRow[];
};

type SideAverage = {
  label: string;
  count: number;
  averageOdds: number | null;
  averageProbability: number | null;
  displayLine: number | null;
};

type MarketSummary = {
  market: OddsBoardRow["market"];
  sides: SideAverage[];
};

const MARKET_LABELS: Record<OddsBoardRow["market"], string> = {
  h2h: "不讓分",
  spreads: "讓分",
  totals: "大小分"
};

const ERROR_MESSAGES = new Set(["API key missing", "API limit exceeded", "network error", "invalid league"]);

export function OddsBoardClient({ rows, initialMessage }: { rows: OddsBoardRow[]; initialMessage?: string }) {
  const [dateFilter, setDateFilter] = useState<"today" | "tomorrow">("today");
  const [league, setLeague] = useState<"ALL" | "NBA" | "MLB">("ALL");
  const [market, setMarket] = useState<"ALL" | OddsBoardRow["market"]>("ALL");
  const [message, setMessage] = useState<string | null>(initialMessage ?? null);
  const [isPending, startTransition] = useTransition();

  const filteredRows = useMemo(
    () =>
      rows.filter((row) => {
        const leagueMatches = league === "ALL" || row.league === league;
        const marketMatches = market === "ALL" || row.market === market;
        const dateMatches = getDateBucket(row.gameTime) === dateFilter;
        return leagueMatches && marketMatches && dateMatches;
      }),
    [dateFilter, league, market, rows]
  );

  const gameGroups = useMemo(() => groupRowsByGame(filteredRows), [filteredRows]);

  function refreshOdds(nextLeague: "NBA" | "MLB" | "ALL") {
    setMessage(null);
    startTransition(async () => {
      try {
        const response = await fetch(`/api/odds/refresh?league=${nextLeague}`, { cache: "no-store" });
        const payload = (await response.json()) as { error?: string; totalSnapshots?: number };
        if (!response.ok) {
          setMessage(ERROR_MESSAGES.has(payload.error ?? "") ? payload.error! : "network error");
          return;
        }

        setMessage(`更新完成，新增 ${payload.totalSnapshots ?? 0} 筆盤口快照`);
        window.location.reload();
      } catch {
        setMessage("network error");
      }
    });
  }

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-sky-100 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2">
            <button className="rounded-md bg-blue-700 px-4 py-3 text-base font-black text-white disabled:opacity-60" disabled={isPending} onClick={() => refreshOdds("NBA")}>
              更新 NBA 國際盤
            </button>
            <button className="rounded-md bg-emerald-700 px-4 py-3 text-base font-black text-white disabled:opacity-60" disabled={isPending} onClick={() => refreshOdds("MLB")}>
              更新 MLB 國際盤
            </button>
            <button className="rounded-md bg-ink px-4 py-3 text-base font-black text-white disabled:opacity-60" disabled={isPending} onClick={() => refreshOdds("ALL")}>
              更新全部
            </button>
          </div>
          <div className="text-base font-bold text-slate-600">{isPending ? "更新中..." : `${gameGroups.length} 場比賽 / ${filteredRows.length} 筆盤口`}</div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <label className="text-base font-black text-ink">
            日期
            <select className="mt-2 w-full rounded-md border border-slate-200 bg-white px-4 py-3 text-lg" value={dateFilter} onChange={(event) => setDateFilter(event.target.value as typeof dateFilter)}>
              <option value="today">今天</option>
              <option value="tomorrow">明天</option>
            </select>
          </label>
          <label className="text-base font-black text-ink">
            聯盟
            <select className="mt-2 w-full rounded-md border border-slate-200 bg-white px-4 py-3 text-lg" value={league} onChange={(event) => setLeague(event.target.value as typeof league)}>
              <option value="ALL">全部</option>
              <option value="NBA">NBA</option>
              <option value="MLB">MLB</option>
            </select>
          </label>
          <label className="text-base font-black text-ink">
            玩法
            <select className="mt-2 w-full rounded-md border border-slate-200 bg-white px-4 py-3 text-lg" value={market} onChange={(event) => setMarket(event.target.value as typeof market)}>
              <option value="ALL">全部</option>
              <option value="h2h">不讓分</option>
              <option value="spreads">讓分</option>
              <option value="totals">大小分</option>
            </select>
          </label>
        </div>
      </div>

      {message ? <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-lg font-black text-amber-800">{message}</div> : null}

      <div className="space-y-4">
        {gameGroups.length ? (
          gameGroups.map((game) => <GameOddsCard key={game.key} game={game} />)
        ) : (
          <div className="rounded-lg border border-sky-100 bg-white p-8 text-center text-lg font-bold text-slate-500 shadow-sm">目前沒有盤口資料</div>
        )}
      </div>
    </div>
  );
}

function GameOddsCard({ game }: { game: GameGroup }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const newestUpdate = game.rows.reduce((latest, row) => (row.snapshotTime > latest ? row.snapshotTime : latest), game.rows[0]?.snapshotTime ?? game.gameTime);
  const summaries = getMarketSummaries(game);

  return (
    <article className="overflow-hidden rounded-lg border border-sky-100 bg-white shadow-sm">
      <div className="border-b border-slate-100 bg-white px-4 py-4 sm:px-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="w-full">
            <div className="flex flex-wrap items-center gap-2 text-sm font-black text-slate-500">
              <span className="rounded bg-slate-100 px-2 py-1">{game.league}</span>
              <span className="numeric">{formatFullDate(game.gameTime)}</span>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
              <TeamBlock label="客隊" zhName={game.awayTeamZh} originalName={game.awayTeam} align="left" />
              <div className="hidden text-xl font-black text-slate-400 sm:block">@</div>
              <TeamBlock label="主隊" zhName={game.homeTeamZh} originalName={game.homeTeam} align="right" />
            </div>
            <div className="mt-4 grid gap-3 lg:grid-cols-3">
              {summaries.map((summary) => (
                <MarketSummaryCard key={summary.market} summary={summary} />
              ))}
            </div>
          </div>
          <div className="shrink-0 text-sm font-bold text-slate-500">
            最後更新 <span className="numeric">{formatDate(newestUpdate)}</span>
          </div>
        </div>
        <button
          className="mt-4 w-full rounded-md border border-slate-200 bg-white px-4 py-3 text-base font-black text-blue-700 transition hover:bg-blue-50 sm:w-auto"
          type="button"
          onClick={() => setIsExpanded((value) => !value)}
          aria-expanded={isExpanded}
        >
          {isExpanded ? "收合各莊家盤口" : `展開各莊家盤口（${game.rows.length} 筆）`}
        </button>
      </div>

      {isExpanded ? (
        <div className="overflow-x-auto">
          <table className="min-w-[820px] w-full border-collapse text-left text-base">
            <thead className="bg-skySoft text-sm font-black text-slate-600">
              <tr>
                {["玩法", "莊家", "下注方", "盤口", "台灣格式賠率", "隱含機率", "更新時間"].map((heading) => (
                  <th key={heading} className="whitespace-nowrap px-4 py-3">
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {game.rows.map((row) => (
                <tr key={row.id} className="border-t border-slate-100">
                  <td className="whitespace-nowrap px-4 py-4 font-bold">{MARKET_LABELS[row.market]}</td>
                  <td className="whitespace-nowrap px-4 py-4">{row.sportsbook}</td>
                  <td className="whitespace-nowrap px-4 py-4 font-black text-ink">{oddsSideName(row.side)}</td>
                  <td className="whitespace-nowrap px-4 py-4 numeric">{formatLine(row.line)}</td>
                  <td className="whitespace-nowrap px-4 py-4 numeric text-xl font-black text-blue-700">{row.decimalOdds.toFixed(2)}</td>
                  <td className="whitespace-nowrap px-4 py-4 numeric">{formatPercent(row.impliedProbability)}</td>
                  <td className="whitespace-nowrap px-4 py-4 numeric text-slate-500">{formatDate(row.snapshotTime)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {game.finalScore ? (
        <div className="border-t border-slate-100 bg-slate-50 px-4 py-4 sm:px-5">
          <div className="text-sm font-black text-slate-500">已完賽比分</div>
          <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
            <ScoreBlock name={game.awayTeamZh} score={game.finalScore.away} align="left" />
            <div className="hidden text-lg font-black text-slate-400 sm:block">-</div>
            <ScoreBlock name={game.homeTeamZh} score={game.finalScore.home} align="right" />
          </div>
          <div className="mt-2 text-xs font-bold text-slate-500">{game.finalScore.status}</div>
        </div>
      ) : null}
    </article>
  );
}

function ScoreBlock({ name, score, align }: { name: string; score: number; align: "left" | "right" }) {
  const alignment = align === "right" ? "sm:text-right" : "";

  return (
    <div className={alignment}>
      <div className="text-base font-black text-ink">{name}</div>
      <div className="numeric text-3xl font-black text-blue-700">{score}</div>
    </div>
  );
}

function MarketSummaryCard({ summary }: { summary: MarketSummary }) {
  return (
    <div className="rounded-md border border-slate-100 bg-skySoft px-3 py-3">
      <div className="text-sm font-black text-slate-600">{MARKET_LABELS[summary.market]}</div>
      <div className="mt-2 space-y-2">
        {summary.sides.map((side) => (
          <div key={side.label} className="rounded bg-white px-3 py-2">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-black leading-tight text-ink">{side.label}</div>
                <div className="mt-1 numeric text-xs font-black text-slate-500">{side.count} 筆</div>
              </div>
              <div className="numeric text-2xl font-black text-blue-700">{side.averageOdds ? side.averageOdds.toFixed(2) : "-"}</div>
            </div>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm font-bold text-slate-500">
              <span>機率 {side.averageProbability ? formatPercent(side.averageProbability) : "-"}</span>
              <span>盤口 {side.displayLine === null ? "-" : formatLine(side.displayLine)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TeamBlock({ label, zhName, originalName, align }: { label: string; zhName: string; originalName: string; align: "left" | "right" }) {
  const alignment = align === "right" ? "sm:text-right" : "";

  return (
    <div className={alignment}>
      <div className="text-sm font-black text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-black leading-tight text-ink">{zhName}</div>
      <div className="mt-1 text-sm font-bold text-slate-500">{originalName}</div>
    </div>
  );
}

function groupRowsByGame(rows: OddsBoardRow[]) {
  const groups = new Map<string, GameGroup>();

  for (const row of rows) {
    const existing = groups.get(row.gameKey);
    if (existing) {
      existing.rows.push(row);
      continue;
    }

    groups.set(row.gameKey, {
      key: row.gameKey,
      league: row.league,
      gameTime: row.gameTime,
      awayTeam: row.awayTeam,
      awayTeamZh: row.awayTeamZh,
      homeTeam: row.homeTeam,
      homeTeamZh: row.homeTeamZh,
      finalScore: row.finalScore,
      rows: [row]
    });
  }

  return Array.from(groups.values()).sort((a, b) => a.gameTime.localeCompare(b.gameTime));
}

function getMarketSummaries(game: GameGroup): MarketSummary[] {
  return (["h2h", "spreads", "totals"] as const).map((market) => {
    const marketRows = game.rows.filter((row) => row.market === market);
    const preferredOrder = getPreferredSideOrder(market, game);
    const labels = Array.from(new Set([...preferredOrder, ...marketRows.map((row) => row.side)])).filter((label) => marketRows.some((row) => row.side === label));

    return {
      market,
      sides: labels.map((label) => {
        const sideRows = marketRows.filter((row) => row.side === label);
        const lineRows = sideRows.filter((row) => row.line !== null);
        return {
          label: oddsSideName(label),
          count: sideRows.length,
          averageOdds: average(sideRows.map((row) => row.decimalOdds)),
          averageProbability: average(sideRows.map((row) => row.impliedProbability)),
          displayLine: lineRows.length ? mostCommonLine(lineRows.map((row) => row.line ?? 0)) : null
        };
      })
    };
  });
}

function getPreferredSideOrder(market: OddsBoardRow["market"], game: GameGroup) {
  if (market === "totals") return ["Over", "Under"];
  return [game.awayTeam, game.homeTeam];
}

function average(values: number[]) {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function mostCommonLine(values: number[]) {
  const counts = new Map<string, { value: number; count: number }>();

  for (const value of values) {
    const rounded = Math.round(value * 100) / 100;
    const key = rounded.toFixed(2);
    const current = counts.get(key);
    counts.set(key, { value: rounded, count: (current?.count ?? 0) + 1 });
  }

  return Array.from(counts.values()).sort((a, b) => b.count - a.count || Math.abs(b.value) - Math.abs(a.value))[0]?.value ?? null;
}

function formatFullDate(value: string) {
  return new Date(value).toLocaleString("zh-TW", {
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatDate(value: string) {
  return new Date(value).toLocaleString("zh-TW", {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatLine(value: number | null) {
  if (value === null) return "-";
  return value > 0 ? `+${roundDisplay(value)}` : `${roundDisplay(value)}`;
}

function roundDisplay(value: number) {
  return Math.round(value * 100) / 100;
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}


function getDateBucket(value: string): "today" | "tomorrow" | "other" {
  const gameDate = new Date(value);
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrowStart = new Date(todayStart);
  tomorrowStart.setDate(tomorrowStart.getDate() + 1);
  const dayAfterTomorrowStart = new Date(tomorrowStart);
  dayAfterTomorrowStart.setDate(dayAfterTomorrowStart.getDate() + 1);

  if (gameDate >= todayStart && gameDate < tomorrowStart) return "today";
  if (gameDate >= tomorrowStart && gameDate < dayAfterTomorrowStart) return "tomorrow";
  return "other";
}
