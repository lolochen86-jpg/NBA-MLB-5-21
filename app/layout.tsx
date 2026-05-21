import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NBA / MLB 對戰數據下載中心",
  description: "下載 NBA 與 MLB 對戰、球隊與球員資料"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-Hant">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
