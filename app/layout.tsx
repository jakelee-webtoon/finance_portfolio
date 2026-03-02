import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Finance Portfolio Dashboard",
  description: "부부 공동 자산 관리 대시보드",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
