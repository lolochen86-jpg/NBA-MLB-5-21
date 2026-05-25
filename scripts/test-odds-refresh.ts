import fs from "node:fs";
import path from "node:path";
import { GET } from "../app/api/odds/refresh/route";

for (const line of fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf8").replace(/^\uFEFF/, "").split(/\r?\n/)) {
  const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (!match) continue;
  process.env[match[1]] = match[2].replace(/^"|"$/g, "");
}

async function main() {
  const league = (process.argv[2] ?? "NBA").toUpperCase();
  const response = await GET(new Request(`http://localhost/api/odds/refresh?league=${league}`));
  const payload = await response.json();

  console.log(`status=${response.status}`);
  console.log(JSON.stringify(payload));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
