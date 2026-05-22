import Link from "next/link";
import { type Lang } from "@/lib/i18n";

export function LanguageSwitcher({ lang, pathname, params }: { lang: Lang; pathname: string; params?: URLSearchParams }) {
  const query = new URLSearchParams(params?.toString());
  query.set("lang", lang === "zh" ? "en" : "zh");

  return (
    <Link className="rounded-md border border-blue-200 bg-white px-4 py-2 text-sm font-bold text-blue-700 hover:bg-blue-50" href={`${pathname}?${query.toString()}`}>
      {lang === "zh" ? "English" : "中文"}
    </Link>
  );
}
