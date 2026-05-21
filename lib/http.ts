import { NextResponse } from "next/server";

export function apiError(message: string, status = 400, detail?: unknown) {
  return NextResponse.json({ error: message, detail }, { status });
}

export function parseBoolean(value: string | null, fallback = false) {
  if (value === null) return fallback;
  return value === "true" || value === "1" || value.toLowerCase() === "yes";
}

export function requiredParam(url: URL, key: string) {
  const value = url.searchParams.get(key);
  if (!value) throw new Error(`缺少必要參數：${key}`);
  return value;
}
