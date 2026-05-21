import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const nbaTeams = [
  ["1610612737", "Atlanta Hawks", "ATL", "Atlanta", "Eastern", "Southeast"],
  ["1610612738", "Boston Celtics", "BOS", "Boston", "Eastern", "Atlantic"],
  ["1610612751", "Brooklyn Nets", "BKN", "Brooklyn", "Eastern", "Atlantic"],
  ["1610612766", "Charlotte Hornets", "CHA", "Charlotte", "Eastern", "Southeast"],
  ["1610612741", "Chicago Bulls", "CHI", "Chicago", "Eastern", "Central"],
  ["1610612739", "Cleveland Cavaliers", "CLE", "Cleveland", "Eastern", "Central"],
  ["1610612742", "Dallas Mavericks", "DAL", "Dallas", "Western", "Southwest"],
  ["1610612743", "Denver Nuggets", "DEN", "Denver", "Western", "Northwest"],
  ["1610612765", "Detroit Pistons", "DET", "Detroit", "Eastern", "Central"],
  ["1610612744", "Golden State Warriors", "GSW", "Golden State", "Western", "Pacific"],
  ["1610612745", "Houston Rockets", "HOU", "Houston", "Western", "Southwest"],
  ["1610612754", "Indiana Pacers", "IND", "Indiana", "Eastern", "Central"],
  ["1610612746", "LA Clippers", "LAC", "LA", "Western", "Pacific"],
  ["1610612747", "Los Angeles Lakers", "LAL", "Los Angeles", "Western", "Pacific"],
  ["1610612763", "Memphis Grizzlies", "MEM", "Memphis", "Western", "Southwest"],
  ["1610612748", "Miami Heat", "MIA", "Miami", "Eastern", "Southeast"],
  ["1610612749", "Milwaukee Bucks", "MIL", "Milwaukee", "Eastern", "Central"],
  ["1610612750", "Minnesota Timberwolves", "MIN", "Minnesota", "Western", "Northwest"],
  ["1610612740", "New Orleans Pelicans", "NOP", "New Orleans", "Western", "Southwest"],
  ["1610612752", "New York Knicks", "NYK", "New York", "Eastern", "Atlantic"],
  ["1610612760", "Oklahoma City Thunder", "OKC", "Oklahoma City", "Western", "Northwest"],
  ["1610612753", "Orlando Magic", "ORL", "Orlando", "Eastern", "Southeast"],
  ["1610612755", "Philadelphia 76ers", "PHI", "Philadelphia", "Eastern", "Atlantic"],
  ["1610612756", "Phoenix Suns", "PHX", "Phoenix", "Western", "Pacific"],
  ["1610612757", "Portland Trail Blazers", "POR", "Portland", "Western", "Northwest"],
  ["1610612758", "Sacramento Kings", "SAC", "Sacramento", "Western", "Pacific"],
  ["1610612759", "San Antonio Spurs", "SAS", "San Antonio", "Western", "Southwest"],
  ["1610612761", "Toronto Raptors", "TOR", "Toronto", "Eastern", "Atlantic"],
  ["1610612762", "Utah Jazz", "UTA", "Utah", "Western", "Northwest"],
  ["1610612764", "Washington Wizards", "WAS", "Washington", "Eastern", "Southeast"]
];

const mlbTeams = [
  ["109", "Arizona Diamondbacks", "ARI", "Arizona", "National", "West"],
  ["144", "Atlanta Braves", "ATL", "Atlanta", "National", "East"],
  ["110", "Baltimore Orioles", "BAL", "Baltimore", "American", "East"],
  ["111", "Boston Red Sox", "BOS", "Boston", "American", "East"],
  ["112", "Chicago Cubs", "CHC", "Chicago", "National", "Central"],
  ["145", "Chicago White Sox", "CWS", "Chicago", "American", "Central"],
  ["113", "Cincinnati Reds", "CIN", "Cincinnati", "National", "Central"],
  ["114", "Cleveland Guardians", "CLE", "Cleveland", "American", "Central"],
  ["115", "Colorado Rockies", "COL", "Colorado", "National", "West"],
  ["116", "Detroit Tigers", "DET", "Detroit", "American", "Central"],
  ["117", "Houston Astros", "HOU", "Houston", "American", "West"],
  ["118", "Kansas City Royals", "KC", "Kansas City", "American", "Central"],
  ["108", "Los Angeles Angels", "LAA", "Los Angeles", "American", "West"],
  ["119", "Los Angeles Dodgers", "LAD", "Los Angeles", "National", "West"],
  ["146", "Miami Marlins", "MIA", "Miami", "National", "East"],
  ["158", "Milwaukee Brewers", "MIL", "Milwaukee", "National", "Central"],
  ["142", "Minnesota Twins", "MIN", "Minnesota", "American", "Central"],
  ["121", "New York Mets", "NYM", "New York", "National", "East"],
  ["147", "New York Yankees", "NYY", "New York", "American", "East"],
  ["133", "Athletics", "ATH", "Athletics", "American", "West"],
  ["143", "Philadelphia Phillies", "PHI", "Philadelphia", "National", "East"],
  ["134", "Pittsburgh Pirates", "PIT", "Pittsburgh", "National", "Central"],
  ["135", "San Diego Padres", "SD", "San Diego", "National", "West"],
  ["137", "San Francisco Giants", "SF", "San Francisco", "National", "West"],
  ["136", "Seattle Mariners", "SEA", "Seattle", "American", "West"],
  ["138", "St. Louis Cardinals", "STL", "St. Louis", "National", "Central"],
  ["139", "Tampa Bay Rays", "TB", "Tampa Bay", "American", "East"],
  ["140", "Texas Rangers", "TEX", "Texas", "American", "West"],
  ["141", "Toronto Blue Jays", "TOR", "Toronto", "American", "East"],
  ["120", "Washington Nationals", "WSH", "Washington", "National", "East"]
];

async function upsertTeams(league: "NBA" | "MLB", rows: string[][]) {
  for (const [externalId, name, abbreviation, city, conference, division] of rows) {
    await prisma.team.upsert({
      where: { league_externalId: { league, externalId } },
      update: { name, abbreviation, city, conference, division },
      create: { league, externalId, name, abbreviation, city, conference, division }
    });
  }
}

async function main() {
  await upsertTeams("NBA", nbaTeams);
  await upsertTeams("MLB", mlbTeams);

  const fetchedAt = new Date();
  await prisma.sourceSync.upsert({
    where: { league_source_entity: { league: "NBA", source: "NBA.com Stats API", entity: "teams" } },
    update: { status: "SEEDED_TEAMS_ONLY", message: "已匯入真實球隊清單，尚未同步比賽資料", fetchedAt },
    create: { league: "NBA", source: "NBA.com Stats API", entity: "teams", status: "SEEDED_TEAMS_ONLY", message: "已匯入真實球隊清單，尚未同步比賽資料", fetchedAt }
  });
  await prisma.sourceSync.upsert({
    where: { league_source_entity: { league: "MLB", source: "MLB StatsAPI", entity: "teams" } },
    update: { status: "SEEDED_TEAMS_ONLY", message: "已匯入真實球隊清單，尚未同步比賽資料", fetchedAt },
    create: { league: "MLB", source: "MLB StatsAPI", entity: "teams", status: "SEEDED_TEAMS_ONLY", message: "已匯入真實球隊清單，尚未同步比賽資料", fetchedAt }
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
    console.log("Seed completed: real NBA/MLB teams only, no fake games.");
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
