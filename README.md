# NBA / MLB 對戰數據下載中心

這是一個 Next.js + Prisma 的運動數據 MVP，用來下載與分析 NBA / MLB 球隊、對戰、球員資料。

核心原則：

- 不使用假資料。
- 所有比賽與球員資料必須來自 API 或已同步進資料庫的真實資料。
- API 抓不到資料時顯示「資料來源目前無法取得」。
- 尚未同步資料時顯示「請先同步資料」。
- 每個匯出檔案會標明資料來源、抓取時間、最後更新時間、是否包含延長賽。

## 架構

```text
Frontend：Next.js + TypeScript + Tailwind CSS
Backend：Next.js API Routes
Database：Supabase PostgreSQL
ORM：Prisma
Export：CSV / Excel XLSX / JSON
```

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
  import-games.ts
  sync-mlb.ts
  sync-nba.ts
```

## 已完成 MVP

- Next.js + TypeScript + Tailwind CSS 專案
- Prisma schema
- Supabase PostgreSQL datasource
- Team、Game、GamePeriodScore、Player、PlayerGameStat、SourceSync
- 真實 NBA / MLB 球隊 seed
- 首頁 Dashboard
- NBA / MLB 對戰分析頁
- includeOvertime 切換
- CSV / Excel XLSX / JSON 匯出
- API routes 架構
- 手動匯入真實 API 快照 script

## 環境變數

建立 `.env`，填入 Supabase PostgreSQL 連線字串：

```bash
DATABASE_URL="postgresql://postgres:你的密碼@db.ltooojixxhvmpjrhfufd.supabase.co:5432/postgres"
NEXT_PUBLIC_SUPABASE_URL="https://ltooojixxhvmpjrhfufd.supabase.co"
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="你的 Supabase publishable key"
```

不要把 `.env` 上傳到 GitHub。

`NEXT_PUBLIC_SUPABASE_*` 是前端可公開設定，之後做登入或 Supabase client 查詢會用到。`DATABASE_URL` 是伺服器資料庫密碼，不能公開。

## 本機啟動

```bash
npm install
npm run prisma:generate
npm run prisma:push
npm run seed
npm run dev
```

網站預設在：

```text
http://localhost:3000
```

## Supabase 建表

第一次使用 Supabase 時，請在有正確 `DATABASE_URL` 的環境執行：

```bash
npm run prisma:push
npm run seed
```

`seed` 只會匯入真實 NBA / MLB 球隊清單，不會建立假比賽。

## 匯入真實比賽快照

可以用真實 API 快照 JSON 匯入比賽與分節資料：

```bash
npm run import:games -- path/to/real-api-snapshot.json
```

匯入檔必須包含：

- `source`
- `fetchedAt`
- `games`
- 每場比賽的 period scoring / linescore

缺少分節資料會拒絕匯入。

## API

- `GET /api/teams?league=NBA`
- `GET /api/teams?league=MLB`
- `GET /api/games/upcoming?league=NBA`
- `GET /api/games/upcoming?league=MLB`
- `GET /api/matchup/summary`
- `GET /api/players/stats`
- `GET /api/export?type=matchup&format=csv`
- `GET /api/export?type=players&format=xlsx`
- `GET /api/export?type=games&format=json`

## 延長賽邏輯

NBA：

- `includeOvertime=true` 使用 final score。
- `includeOvertime=false` 只計算 Q1 + Q2 + Q3 + Q4。
- 若缺少 period scoring，顯示「此場缺少分節資料」。

MLB：

- `includeOvertime=true` 使用 final R。
- `includeOvertime=false` 只計算 1 到 9 局。
- 若缺少 linescore，不自行估算。

## 部署建議

建議使用：

```text
GitHub：放程式碼
Vercel：部署網站
Supabase PostgreSQL：存放 NBA / MLB 資料
```

Vercel 需要設定環境變數：

```text
DATABASE_URL=Supabase PostgreSQL connection string
```
