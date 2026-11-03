import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "hatsunichi — 減便を決める仕事の初日",
  description: "鳥取の大学生が申し込まずに開ける、実データで減便を決める仕事の初日",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
