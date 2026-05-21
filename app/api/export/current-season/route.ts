import { csvResponse, jsonResponse, xlsxResponse } from "@/lib/export";
import { fetchCurrentSeasonGames } from "@/lib/current-season";

export const maxDuration = 60;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const league = (url.searchParams.get("league") ?? "MLB").toUpperCase();
  const format = (url.searchParams.get("format") ?? "csv") as "csv" | "xlsx" | "json";
  const season = url.searchParams.get("season");
  const seasonType = url.searchParams.get("seasonType") ?? "Regular Season";

  if (!["csv", "xlsx", "json"].includes(format)) {
    return Response.json({ error: "format 必須是 csv、xlsx 或 json" }, { status: 400 });
  }

  try {
    const rows = await fetchCurrentSeasonGames({ league, season, seasonType });
    const filename = `${league.toLowerCase()}-current-season-games-${Date.now()}`;
    const payload = {
      league,
      season: season ?? null,
      seasonType,
      fetchedAt: new Date().toISOString(),
      rows,
      message: rows.length ? null : "資料來源目前無法取得"
    };

    if (format === "json") return jsonResponse(payload, filename);
    if (format === "xlsx") return xlsxResponse(rows, filename);
    return csvResponse(rows, filename);
  } catch (error) {
    const rows = [
      {
        league,
        season: season ?? "",
        seasonType,
        message: "資料來源目前無法取得",
        error: error instanceof Error ? error.message : "unknown error",
        fetchedAt: new Date().toISOString()
      }
    ];
    const filename = `${league.toLowerCase()}-current-season-unavailable-${Date.now()}`;
    if (format === "json") return jsonResponse({ rows }, filename);
    if (format === "xlsx") return xlsxResponse(rows, filename);
    return csvResponse(rows, filename);
  }
}
