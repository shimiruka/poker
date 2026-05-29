import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Online Poker Table",
  description: "Realtime Texas Hold'em poker table",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
