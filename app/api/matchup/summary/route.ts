import { NextResponse } from "next/server";
import { apiError, parseBoolean, requiredParam } from "@/lib/http";
import { getMatchupSummary } from "@/lib/matchup";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const league = requiredParam(url, "league").toUpperCase();
    const rangeType = requiredParam(url, "rangeType");
    const rangeValue = Number(requiredParam(url, "rangeValue"));

    if (!["NBA", "MLB"].includes(league)) return apiError("league 必須是 NBA 或 MLB");
    if (!["games", "days"].includes(rangeType)) return apiError("rangeType 必須是 games 或 days");
    if (![5, 10, 15].includes(rangeValue)) return apiError("rangeValue 必須是 5、10 或 15");

    const summary = await getMatchupSummary({
      league,
      homeTeamId: Number(requiredParam(url, "homeTeamId")),
      awayTeamId: Number(requiredParam(url, "awayTeamId")),
      season: requiredParam(url, "season"),
      seasonType: url.searchParams.get("seasonType") ?? "Regular Season",
      rangeType: rangeType as "games" | "days",
      rangeValue,
      includeOvertime: parseBoolean(url.searchParams.get("includeOvertime"), true),
      splitHomeAway: parseBoolean(url.searchParams.get("splitHomeAway"), false)
    });

    return NextResponse.json(summary);
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "無法計算對戰資料", 500);
  }
}
