"use client";

import { useMemo, useState } from "react";

type OcrWord = {
  text: string;
  bbox?: { x0: number; y0: number; x1: number; y1: number };
};

type OddsPair = {
  awayOdds: number;
  homeOdds: number;
  awayTeam?: string;
  homeTeam?: string;
  time?: string;
  label: string;
};

export function TaiwanOddsOcr({ lang }: { lang: "zh" | "en" }) {
  const [status, setStatus] = useState("");
  const [rawText, setRawText] = useState("");
  const [pairs, setPairs] = useState<OddsPair[]>([]);
  const [previewUrl, setPreviewUrl] = useState("");
  const [isReading, setIsReading] = useState(false);

  const labels = useMemo(
    () =>
      lang === "zh"
        ? {
            title: "台灣運彩截圖 OCR",
            subtitle: "上傳台彩盤口截圖後，系統會辨識隊名與小數賠率；點選該場即可填入台彩客隊/主隊欄位。",
            upload: "上傳截圖",
            reading: "辨識中，請稍候...",
            found: "辨識到的賽事與賠率",
            fill: "填入台彩賠率",
            swapFill: "反向填入",
            raw: "OCR 原文",
            empty: "尚未辨識到完整賽事，請換一張更清楚的截圖或手動輸入。",
            leftRight: "左欄視為客隊賠率，右欄視為主隊賠率；若順序相反請按反向填入。",
            away: "客隊",
            home: "主隊",
            odds: "賠率"
          }
        : {
            title: "Taiwan Sports Lottery Screenshot OCR",
            subtitle: "Upload a Taiwan Sports Lottery screenshot. Team names and decimal odds are recognized in your browser.",
            upload: "Upload Screenshot",
            reading: "Reading image...",
            found: "Detected games and odds",
            fill: "Fill Taiwan Odds",
            swapFill: "Fill Reversed",
            raw: "OCR Text",
            empty: "No complete games were detected. Try a clearer screenshot or enter odds manually.",
            leftRight: "Left column is treated as away odds, right column as home odds. Use reverse if the order is opposite.",
            away: "Away",
            home: "Home",
            odds: "Odds"
          },
    [lang]
  );

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setIsReading(true);
    setStatus(labels.reading);
    setRawText("");
    setPairs([]);
    setPreviewUrl(URL.createObjectURL(file));

    try {
      const { recognize } = await import("tesseract.js");
      const result = await recognize(file, "chi_tra+eng", {
        logger: (message: any) => {
          if (message?.status) setStatus(`${message.status}${message.progress ? ` ${(message.progress * 100).toFixed(0)}%` : ""}`);
        }
      });
      const text = result.data.text ?? "";
      const words = ((result.data as any).words ?? []) as OcrWord[];
      setRawText(text);
      const detected = extractGamesAndOdds(text, words);
      setPairs(detected);
      setStatus(detected.length ? `${labels.found}: ${detected.length}` : labels.empty);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : labels.empty);
    } finally {
      setIsReading(false);
    }
  }

  return (
    <section className="mt-6 rounded-lg border border-sky-100 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-lg font-black text-ink">{labels.title}</div>
          <p className="mt-1 max-w-3xl text-sm text-slate-600">{labels.subtitle}</p>
        </div>
        <label className="inline-flex cursor-pointer items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-black text-white hover:bg-blue-700">
          {labels.upload}
          <input className="hidden" type="file" accept="image/*" onChange={(event) => handleFile(event.currentTarget.files?.[0])} />
        </label>
      </div>

      {status ? <div className="mt-4 rounded-md bg-skySoft p-3 text-sm font-bold text-slate-700">{status}</div> : null}

      <div className="mt-4 grid gap-4 lg:grid-cols-[0.85fr_1.15fr]">
        {previewUrl ? (
          <div className="overflow-hidden rounded-md border border-slate-100 bg-slate-50">
            <img src={previewUrl} alt="" className="max-h-[520px] w-full object-contain" />
          </div>
        ) : null}

        <div className="space-y-4">
          {pairs.length ? (
            <div>
              <div className="mb-2 text-sm font-black text-slate-700">{labels.found}</div>
              <div className="mb-2 text-xs font-bold text-amber-700">{labels.leftRight}</div>
              <div className="overflow-x-auto rounded-md border border-slate-100">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead className="bg-skySoft text-slate-700">
                    <tr>
                      <th className="px-3 py-2">{lang === "zh" ? "時間" : "Time"}</th>
                      <th className="px-3 py-2">{labels.away}</th>
                      <th className="px-3 py-2">{labels.home}</th>
                      <th className="px-3 py-2 text-right">{labels.odds}</th>
                      <th className="px-3 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {pairs.map((pair, index) => (
                      <tr key={`${pair.label}-${index}`} className="border-t border-slate-100 align-top">
                        <td className="numeric px-3 py-2">{pair.time ?? "-"}</td>
                        <td className="px-3 py-2 font-bold">{pair.awayTeam ?? "-"}</td>
                        <td className="px-3 py-2 font-bold">{pair.homeTeam ?? "-"}</td>
                        <td className="numeric px-3 py-2 text-right text-lg font-black text-ink">{pair.awayOdds.toFixed(2)} / {pair.homeOdds.toFixed(2)}</td>
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap justify-end gap-2">
                            <button type="button" className="rounded-md bg-blue-600 px-3 py-2 text-xs font-black text-white" onClick={() => fillTaiwanOdds(pair.awayOdds, pair.homeOdds)}>
                              {labels.fill}
                            </button>
                            <button type="button" className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700" onClick={() => fillTaiwanOdds(pair.homeOdds, pair.awayOdds)}>
                              {labels.swapFill}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {rawText ? (
            <details className="rounded-md border border-slate-100 bg-slate-50 p-3">
              <summary className="cursor-pointer text-sm font-black text-slate-700">{labels.raw}</summary>
              <pre className="mt-3 max-h-56 overflow-auto whitespace-pre-wrap text-xs text-slate-600">{rawText}</pre>
            </details>
          ) : null}

          {isReading ? <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full w-2/3 animate-pulse bg-blue-500" /></div> : null}
        </div>
      </div>
    </section>
  );
}

function fillTaiwanOdds(awayOdds: number, homeOdds: number) {
  setInputValue("taiwanAwayOdds", awayOdds.toFixed(2));
  setInputValue("taiwanHomeOdds", homeOdds.toFixed(2));
}

function setInputValue(name: string, value: string) {
  const input = document.querySelector<HTMLInputElement>(`input[name="${name}"]`);
  if (!input) return;
  input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function extractGamesAndOdds(text: string, words: OcrWord[]): OddsPair[] {
  const fromWords = extractFromWordPositions(words);
  if (fromWords.length >= 4) return fromWords;
  return mergePairs(fromWords, extractFromText(text));
}

function extractFromWordPositions(words: OcrWord[]): OddsPair[] {
  const usableWords = words.filter((word) => word.bbox && cleanText(word.text));
  if (!usableWords.length) return [];

  const rows = groupRows(usableWords);
  const out: OddsPair[] = [];

  for (const row of rows) {
    const oddsWords = row
      .map((word) => ({ ...word, value: parseOdd(word.text) }))
      .filter((word) => word.value !== null)
      .sort((a, b) => (a.bbox?.x0 ?? 0) - (b.bbox?.x0 ?? 0));

    if (oddsWords.length < 2) continue;
    const leftText = row
      .filter((word) => (word.bbox?.x1 ?? 0) < (oddsWords[0].bbox?.x0 ?? 0) - 20)
      .sort((a, b) => (a.bbox?.x0 ?? 0) - (b.bbox?.x0 ?? 0))
      .map((word) => cleanText(word.text))
      .filter(Boolean)
      .join(" ");

    const teams = extractTeams(leftText);
    out.push({
      awayOdds: oddsWords[0].value as number,
      homeOdds: oddsWords[1].value as number,
      awayTeam: teams.awayTeam,
      homeTeam: teams.homeTeam,
      time: teams.time,
      label: `${leftText}-${oddsWords[0].text}-${oddsWords[1].text}`
    });
  }

  return dedupePairs(out).slice(0, 30);
}

function groupRows(words: OcrWord[]) {
  const sorted = [...words].sort((a, b) => centerY(a) - centerY(b));
  const rows: OcrWord[][] = [];

  for (const word of sorted) {
    const y = centerY(word);
    const row = rows.find((candidate) => Math.abs(averageY(candidate) - y) <= 12);
    if (row) row.push(word);
    else rows.push([word]);
  }

  return rows
    .map((row) => row.sort((a, b) => (a.bbox?.x0 ?? 0) - (b.bbox?.x0 ?? 0)))
    .filter((row) => row.length >= 2);
}

function extractFromText(text: string): OddsPair[] {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const out: OddsPair[] = [];
  let pendingInfo = "";

  for (const line of lines) {
    const odds = Array.from(line.matchAll(/\b\d[.,]\d{2}\b/g)).map((match) => Number(match[0].replace(",", ".")));
    if (odds.length >= 2) {
      const teams = extractTeams(pendingInfo);
      out.push({
        awayOdds: odds[0],
        homeOdds: odds[1],
        awayTeam: teams.awayTeam,
        homeTeam: teams.homeTeam,
        time: teams.time,
        label: `${pendingInfo}-${odds[0]}-${odds[1]}`
      });
      pendingInfo = "";
    } else if (!/\b\d[.,]\d{2}\b/.test(line)) {
      pendingInfo = [pendingInfo, line].filter(Boolean).join(" ");
    }
  }

  if (!out.length) {
    const odds = Array.from(text.replace(/[Oo]/g, "0").matchAll(/\b\d[.,]\d{2}\b/g))
      .map((match) => Number(match[0].replace(",", ".")))
      .filter((value) => Number.isFinite(value) && value >= 1.01 && value <= 9.99);
    for (let index = 0; index + 1 < odds.length; index += 2) {
      out.push({
        awayOdds: odds[index],
        homeOdds: odds[index + 1],
        label: `${odds[index].toFixed(2)}-${odds[index + 1].toFixed(2)}`
      });
    }
  }

  return dedupePairs(out).slice(0, 30);
}

function extractTeams(value: string) {
  const cleaned = value
    .replace(/\b\d{2,3}\b/g, " ")
    .replace(/\b26\s*5月\b/g, " ")
    .replace(/[+＋]\d+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const time = cleaned.match(/\b\d{1,2}:\d{2}\b/)?.[0];
  const withoutTime = cleaned.replace(/\b\d{1,2}:\d{2}\b/g, " ").replace(/\s+/g, " ").trim();
  const chunks = withoutTime
    .split(/\s{2,}|\/|@|vs\.?|VS|對|,|，/)
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length >= 2 && !/^\d+$/.test(chunk));

  if (chunks.length >= 2) {
    return { time, awayTeam: chunks[chunks.length - 2], homeTeam: chunks[chunks.length - 1] };
  }

  const compact = withoutTime.replace(/\s/g, "");
  const guessed = splitCompactTeams(compact);
  return { time, awayTeam: guessed[0], homeTeam: guessed[1] };
}

function splitCompactTeams(value: string) {
  if (!value || value.length < 4) return [undefined, undefined];
  const middle = Math.ceil(value.length / 2);
  return [value.slice(0, middle), value.slice(middle)];
}

function mergePairs(primary: OddsPair[], fallback: OddsPair[]) {
  return dedupePairs([...primary, ...fallback]).slice(0, 30);
}

function dedupePairs(pairs: OddsPair[]) {
  const seen = new Set<string>();
  return pairs.filter((pair) => {
    const key = `${pair.awayTeam ?? ""}:${pair.homeTeam ?? ""}:${pair.awayOdds}:${pair.homeOdds}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return pair.awayOdds >= 1.01 && pair.homeOdds >= 1.01;
  });
}

function parseOdd(value: string) {
  const normalized = value.replace(/[Oo]/g, "0").replace(",", ".");
  if (!/^\d\.\d{2}$/.test(normalized)) return null;
  const number = Number(normalized);
  return Number.isFinite(number) && number >= 1.01 && number <= 9.99 ? number : null;
}

function cleanText(value: string) {
  return value.replace(/[|[\]{}]/g, "").trim();
}

function centerY(word: OcrWord) {
  return ((word.bbox?.y0 ?? 0) + (word.bbox?.y1 ?? 0)) / 2;
}

function averageY(words: OcrWord[]) {
  return words.reduce((sum, word) => sum + centerY(word), 0) / words.length;
}
