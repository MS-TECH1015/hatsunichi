import type { Metadata } from "next";
import { Zen_Maru_Gothic } from "next/font/google";
import "./globals.css";

// 町の画面の丸ゴシック。ビルド時に取り込み、閲覧時に Google へは問い合わせない
const maru = Zen_Maru_Gothic({ weight: ["500", "700", "900"], subsets: ["latin"], variable: "--font-maru", display: "swap" });

export const metadata: Metadata = {
  title: "hatsunichi — 鳥取の町で、仕事の初日",
  description: "鳥取の大学生が模型の町を歩き、住民に話しかけ、人手不足の依頼に一言で案を出す。数字は公開データの出典つき",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja" className={maru.variable}>
      <body>{children}</body>
    </html>
  );
}
