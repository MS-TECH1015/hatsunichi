import type { Metadata } from "next";
import { Zen_Maru_Gothic } from "next/font/google";
import "./globals.css";

// 町の画面の丸ゴシック。ビルド時に取り込み、閲覧時に Google へは問い合わせない
const maru = Zen_Maru_Gothic({ weight: ["500", "700", "900"], subsets: ["latin"], variable: "--font-maru", display: "swap" });

export const metadata: Metadata = {
  title: "hatsunichi — 鳥取の町を歩いて、困りごとを見つける",
  description: "鳥取市の模型の町を歩き、町の困りごとと公的な数字を見つけ、出典つきの案を市の提案窓口へ出せる形にする。歩くだけでもよい",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja" className={maru.variable}>
      <body>{children}</body>
    </html>
  );
}
