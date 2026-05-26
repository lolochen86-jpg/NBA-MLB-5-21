export type Lang = "zh" | "en";

export function getLang(value: unknown): Lang {
  return value === "en" ? "en" : "zh";
}

export function withLang(href: string, lang: Lang) {
  const [path, query = ""] = href.split("?");
  const params = new URLSearchParams(query);
  params.set("lang", lang);
  return `${path}?${params.toString()}`;
}

export const dict = {
  zh: {
    home: "首頁",
    title: "NBA / MLB 對戰數據下載中心",
    subtitle: "即時整理球隊近況、球員數據、得失分平均。所有資料皆來自 API 或資料庫同步快取，抓不到就不編造。",
    unavailable: "資料來源目前無法取得",
    syncFirst: "請先同步資料",
    dashboard: {
      nba: "NBA 對戰分析",
      mlb: "MLB 對戰分析",
      players: "球員數據",
      downloads: "下載中心",
      nbaText: "近 5 / 10 / 15 場或日",
      mlbText: "含延長賽與九局切換",
      playersText: "NBA / MLB 分頁查詢",
      odds: "國際盤賠率",
      oddsText: "NBA / MLB 國際盤自動轉台灣十進位格式",
      downloadsText: "CSV、Excel、JSON",
      nbaUpcoming: "NBA 今日 / 即將比賽",
      mlbUpcoming: "MLB 今日 / 即將比賽",
      syncStatus: "資料同步狀態",
      lastUpdated: "最後更新時間"
    },
    downloads: {
      title: "本季完整對戰數據下載",
      subtitle: "先下載完整 final score、regulation score、分節/每局得分與延長賽標記；後續分析時再選擇是否包含延長賽。",
      nbaCsv: "NBA 完整 CSV",
      nbaXlsx: "NBA 完整 Excel",
      mlbCsv: "MLB 完整 CSV",
      mlbXlsx: "MLB 完整 Excel"
    },
    matchup: {
      title: "對戰分析",
      subtitle: "選擇最新未開賽對戰或手動挑球隊，分析雙方近期得失分。資料缺漏會明確顯示，不自行編造。",
      upcoming: "最新未開賽對戰",
      manual: "手動選擇球隊",
      season: "賽季",
      seasonType: "賽事類型",
      regular: "例行賽",
      playoffs: "季後賽",
      homeTeam: "主隊",
      awayTeam: "客隊",
      rangeType: "資料區間",
      recentGames: "最近場數",
      recentDays: "最近日數",
      includeOt: "是否包含延長賽",
      splitHomeAway: "主客場",
      noSplit: "不分主客場",
      split: "主客場分開",
      yes: "是",
      no: "否",
      submit: "查詢",
      selected: "已選擇未開賽對戰",
      homeAvgScored: "主隊平均得分",
      homeAvgAllowed: "主隊平均失分",
      awayAvgScored: "客隊平均得分",
      awayAvgAllowed: "客隊平均失分",
      tableHeaders: ["球隊", "場數", "平均得分", "平均失分", "平均分差", "最高", "最低", "勝敗", "主場平均", "客場平均", "含延長賽", "最後更新"],
      logHeaders: ["日期", "球隊", "對手", "主客", "得分", "失分", "分差", "結果", "延長賽", "資料來源"]
    }
  },
  en: {
    home: "Home",
    title: "NBA / MLB Matchup Data Download Center",
    subtitle: "Track team form, player stats, and scoring averages. Data comes from APIs or database sync only. No fake data is generated.",
    unavailable: "Data source is currently unavailable",
    syncFirst: "Please sync data first",
    dashboard: {
      nba: "NBA Matchup Analysis",
      mlb: "MLB Matchup Analysis",
      players: "Player Stats",
      downloads: "Download Center",
      nbaText: "Last 5 / 10 / 15 games or days",
      mlbText: "Overtime and 9-inning toggle",
      playersText: "NBA / MLB tabbed lookup",
      odds: "Odds Board",
      oddsText: "NBA / MLB international odds converted to Taiwan decimal format",
      downloadsText: "CSV, Excel, JSON",
      nbaUpcoming: "NBA Today / Upcoming",
      mlbUpcoming: "MLB Today / Upcoming",
      syncStatus: "Data Sync Status",
      lastUpdated: "Last updated"
    },
    downloads: {
      title: "Complete Current Season Matchup Downloads",
      subtitle: "Download full final scores, regulation scores, period/inning scoring, and overtime flags first; choose overtime inclusion later during analysis.",
      nbaCsv: "NBA Complete CSV",
      nbaXlsx: "NBA Complete Excel",
      mlbCsv: "MLB Complete CSV",
      mlbXlsx: "MLB Complete Excel"
    },
    matchup: {
      title: "Matchup Analysis",
      subtitle: "Pick an upcoming matchup and analyze both teams' recent form. Missing data is shown clearly and never fabricated.",
      upcoming: "Latest Upcoming Matchup",
      manual: "Choose teams manually",
      season: "Season",
      seasonType: "Season Type",
      regular: "Regular Season",
      playoffs: "Playoffs",
      homeTeam: "Home Team",
      awayTeam: "Away Team",
      rangeType: "Range Type",
      recentGames: "Recent Games",
      recentDays: "Recent Days",
      includeOt: "Include Overtime",
      splitHomeAway: "Home / Away",
      noSplit: "Combined",
      split: "Split Home / Away",
      yes: "Yes",
      no: "No",
      submit: "Search",
      selected: "Selected upcoming matchup",
      homeAvgScored: "Home Avg Scored",
      homeAvgAllowed: "Home Avg Allowed",
      awayAvgScored: "Away Avg Scored",
      awayAvgAllowed: "Away Avg Allowed",
      tableHeaders: ["Team", "Games", "Avg Scored", "Avg Allowed", "Avg Margin", "High", "Low", "W-L", "Home Avg", "Away Avg", "Includes OT", "Last Updated"],
      logHeaders: ["Date", "Team", "Opponent", "H/A", "Scored", "Allowed", "Margin", "Result", "OT", "Source"]
    }
  }
} as const;
