"use client";

import { useMemo, useState } from "react";

type OddsPair = {
  awayOdds: number;
  homeOdds: number;
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
            subtitle: "上傳台彩盤口截圖後，系統會在瀏覽器辨識小數賠率；點選一組賠率即可填入台彩客隊/主隊欄位。",
            upload: "上傳截圖",
            reading: "辨識中，請稍候...",
            found: "辨識到的賠率配對",
            fill: "填入台彩賠率",
            swapFill: "反向填入",
            raw: "OCR 原文",
            empty: "尚未辨識到 1.50 這類小數賠率，請換一張更清楚的截圖或手動輸入。",
            leftRight: "左欄視為客隊，右欄視為主隊；若順序相反請按反向填入。"
          }
        : {
            title: "Taiwan Sports Lottery Screenshot OCR",
            subtitle: "Upload a Taiwan Sports Lottery screenshot. Odds are recognized in your browser; click a pair to fill Taiwan away/home odds.",
            upload: "Upload Screenshot",
            reading: "Reading image...",
            found: "Detected odds pairs",
            fill: "Fill Taiwan Odds",
            swapFill: "Fill Reversed",
            raw: "OCR Text",
            empty: "No decimal odds like 1.50 were detected. Try a clearer screenshot or enter odds manually.",
            leftRight: "Left column is treated as away, right column as home. Use reverse if the order is opposite."
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
      setRawText(text);
      const detected = extractOddsPairs(text);
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
          <input
            className="hidden"
            type="file"
            accept="image/*"
            onChange={(event) => handleFile(event.currentTarget.files?.[0])}
          />
        </label>
      </div>

      {status ? <div className="mt-4 rounded-md bg-skySoft p-3 text-sm font-bold text-slate-700">{status}</div> : null}

      <div className="mt-4 grid gap-4 lg:grid-cols-[0.85fr_1.15fr]">
        {previewUrl ? (
          <div className="overflow-hidden rounded-md border border-slate-100 bg-slate-50">
            <img src={previewUrl} alt="" className="max-h-[420px] w-full object-contain" />
          </div>
        ) : null}

        <div className="space-y-4">
          {pairs.length ? (
            <div>
              <div className="mb-2 text-sm font-black text-slate-700">{labels.found}</div>
              <div className="mb-2 text-xs font-bold text-amber-700">{labels.leftRight}</div>
              <div className="grid gap-2 sm:grid-cols-2">
                {pairs.map((pair, index) => (
                  <div key={`${pair.label}-${index}`} className="rounded-md border border-slate-100 bg-slate-50 p-3">
                    <div className="numeric text-xl font-black text-ink">{pair.awayOdds.toFixed(2)} / {pair.homeOdds.toFixed(2)}</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button type="button" className="rounded-md bg-blue-600 px-3 py-2 text-xs font-black text-white" onClick={() => fillTaiwanOdds(pair.awayOdds, pair.homeOdds)}>
                        {labels.fill}
                      </button>
                      <button type="button" className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700" onClick={() => fillTaiwanOdds(pair.homeOdds, pair.awayOdds)}>
                        {labels.swapFill}
                      </button>
                    </div>
                  </div>
                ))}
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

function extractOddsPairs(text: string): OddsPair[] {
  const cleaned = text.replace(/[Oo]/g, "0").replace(/，/g, ".").replace(/,/g, ".");
  const odds = Array.from(cleaned.matchAll(/\b\d\.\d{2}\b/g))
    .map((match) => Number(match[0]))
    .filter((value) => Number.isFinite(value) && value >= 1.01 && value <= 9.99);

  const pairs: OddsPair[] = [];
  for (let index = 0; index + 1 < odds.length; index += 2) {
    pairs.push({
      awayOdds: odds[index],
      homeOdds: odds[index + 1],
      label: `${odds[index].toFixed(2)}-${odds[index + 1].toFixed(2)}`
    });
  }
  return pairs.slice(0, 20);
}
