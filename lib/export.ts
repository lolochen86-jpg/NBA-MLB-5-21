import * as XLSX from "xlsx";

export type ExportFormat = "csv" | "xlsx" | "json";

export function jsonResponse(data: unknown, filename: string) {
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}.json"`
    }
  });
}

export function csvResponse(rows: Record<string, unknown>[], filename: string) {
  const csv = toCsv(rows);
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}.csv"`
    }
  });
}

export function xlsxResponse(rows: Record<string, unknown>[], filename: string) {
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(workbook, worksheet, "data");
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

  return new Response(buffer, {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="${filename}.xlsx"`
    }
  });
}

export function flattenMatchupExport(payload: any) {
  const fetchedAt = new Date().toISOString();
  return payload.gameLogs.map((log: any) => ({
    league: payload.league,
    season: payload.season,
    seasonType: payload.seasonType,
    team: log.team,
    opponent: log.opponent,
    date: log.date,
    homeAway: log.homeAway,
    scored: log.scored,
    allowed: log.allowed,
    margin: log.margin,
    result: log.result,
    wentOvertime: log.wentOvertime,
    includeOvertime: payload.includeOvertime,
    fetchedAt,
    lastUpdatedAt: payload.lastUpdatedAt,
    dataSource: payload.dataSource
  }));
}

function toCsv(rows: Record<string, unknown>[]) {
  if (!rows.length) return "message\r\n資料來源目前無法取得\r\n";
  const headers = Object.keys(rows[0]);
  const lines = [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(","))
  ];
  return `${lines.join("\r\n")}\r\n`;
}

function csvCell(value: unknown) {
  if (value === null || value === undefined) return "";
  const text = String(value).replace(/"/g, '""');
  return /[",\n\r]/.test(text) ? `"${text}"` : text;
}
