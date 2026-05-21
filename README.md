# NBA / MLB 對戰數據下載中心

明亮、清楚、手機與桌機可讀的 Next.js MVP。資料原則是：不使用假資料；API 或本地 SQLite 沒有同步到資料時，畫面顯示「請先同步資料」或「資料來源目前無法取得」。

## 檔案架構

```text
app/
  api/
    export/route.ts
    games/upcoming/route.ts
    matchup/summary/route.ts
    players/stats/route.ts
    teams/route.ts
  matchup/page.tsx
  players/page.tsx
  globals.css
  layout.tsx
  page.tsx
components/
  DownloadButtons.tsx
  StatCard.tsx
lib/
  export.ts
  http.ts
  matchup.ts
  prisma.ts
prisma/
  schema.prisma
  seed.ts
scripts/
  sync-mlb.ts
  sync-nba.ts
```

## MVP 已完成

- Next.js + TypeScript + Tailwind CSS 專案架構
- Prisma Schema + SQLite datasource
- Team、Game、GamePeriodScore、Player、PlayerGameStat、SourceSync
- 真實 NBA / MLB 球隊 seed，不建立任何虛構比賽
- 手動匯入真實 API 快照的 game import script
- 首頁 Dashboard
- NBA / MLB 對戰分析頁
- `includeOvertime` 計算切換
- CSV / Excel XLSX / JSON 匯出 API
- API routes 架構
- 同步腳本入口，失敗會寫入 SourceSync，不會編造資料

## 啟動

```bash
cp .env.example .env
npm install
npm run prisma:generate
npm run prisma:push
npm run seed
npm run import:games -- path/to/real-api-snapshot.json
npm run dev
```

## API

- `GET /api/teams?league=NBA`
- `GET /api/teams?league=MLB`
- `GET /api/games/upcoming?league=NBA`
- `GET /api/games/upcoming?league=MLB`
- `GET /api/matchup/summary`
- `GET /api/players/stats`
- `GET /api/export?type=matchup&format=csv`

## 延長賽邏輯

NBA：

- `includeOvertime=true` 使用 final score。
- `includeOvertime=false` 使用 Q1 到 Q4 的 regulation score。
- 若缺少 period scoring，API 回傳錯誤訊息，畫面顯示「此場缺少分節資料」。

MLB：

- `includeOvertime=true` 使用 final R。
- `includeOvertime=false` 使用 1 到 9 局 regulation score。
- 若缺少 linescore，API 不會自行估算。

## 資料來源

- NBA：NBA.com Stats API / local SQLite cache
- MLB：MLB StatsAPI / local SQLite cache

匯出檔案會包含資料來源、抓取時間、最後更新時間、是否包含延長賽。
