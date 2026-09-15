import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

// SuisseIntl and SuisseIntlMono are licensed faces; these are the documented
// substitutes and carry the same weight range.
const inter = Inter({ variable: "--font-inter", subsets: ["latin"], weight: ["300", "400", "500", "600"] });
const jetbrainsMono = JetBrains_Mono({ variable: "--font-jetbrains-mono", subsets: ["latin"], weight: ["400"] });

export const metadata: Metadata = {
  title: "Turnstile — Malaysia's public-transport ridership, checked daily",
  description: "A scheduled pipeline over data.gov.my's daily ridership file: ingested, validated with eleven checks, and published only when they pass.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
