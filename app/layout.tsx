import "./globals.css";
import type { Metadata } from "next";
import Script from "next/script";
import { Sora } from "next/font/google";
import { ReactNode } from "react";
import { devConsoleFilterInline } from "@/lib/devConsoleFilterScript";

const sora = Sora({
  subsets: ["latin"],
  variable: "--font-sora",
  display: "swap"
});

export const metadata: Metadata = {
  title: "RowtonRadar",
  description: "Studio weather radar: storms, wind, and real-time NWS data",
  icons: { icon: "/favicon.svg" }
};

const isDev = process.env.NODE_ENV === "development";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={sora.variable}>
      <body className={sora.className}>
        {isDev && (
          <Script
            id="dev-console-noise-filter"
            strategy="beforeInteractive"
            dangerouslySetInnerHTML={{ __html: devConsoleFilterInline }}
          />
        )}
        {children}
      </body>
    </html>
  );
}
