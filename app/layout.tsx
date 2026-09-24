import type { Metadata } from "next";
import "./globals.css";
import { ToastProvider } from "@/components/Toast";

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
    <html lang="ko" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var p=JSON.parse(localStorage.getItem('finance-app-preferences')||'{}');var f=['small','medium','large'].includes(p.fontSize)?p.fontSize:'medium';var s=['compact','medium','wide'].includes(p.spacing)?p.spacing:'medium';document.documentElement.dataset.appFontSize=f;document.documentElement.dataset.appSpacing=s;}catch(e){document.documentElement.dataset.appFontSize='medium';document.documentElement.dataset.appSpacing='medium';}})();`,
          }}
        />
      </head>
      <body className="min-w-0">
        <ToastProvider>
          {children}
        </ToastProvider>
      </body>
    </html>
  );
}
