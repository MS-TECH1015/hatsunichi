import type { Metadata } from "next";
import { Zen_Maru_Gothic } from "next/font/google";
import "./globals.css";

// 町の画面の丸ゴシック。ビルド時に取り込み、閲覧時に Google へは問い合わせない
// 日本語は字の範囲ごとに 120 の小さなファイルに分かれる。先読みすると全部落ちるので、画面に出た字の分だけ読ませる
const maru = Zen_Maru_Gothic({ weight: ["700", "900"], subsets: ["latin"], variable: "--font-maru", display: "swap", preload: false });

export const metadata: Metadata = {
  title: "hatsunichi — 鳥取の町を歩いて、困りごとを見つける",
  description: "鳥取市の模型の町を歩き、町の困りごとと公的な数字を見つけ、出典つきの案を市の提案窓口へ出せる形にする。歩くだけでもよい",
  // LINE や X にリンクを貼ったとき、町の絵と一文が出るようにする
  metadataBase: new URL("https://ms-tech1015.github.io/hatsunichi/"),
  openGraph: {
    title: "はつにち 鳥取の町のむかしといま",
    description: "自分の地元を探して、町のむかしと今の数字を見る。困りごとに出典つきの案を出せる",
    images: [{ url: "og.png", width: 1200, height: 630 }],
    locale: "ja_JP",
    type: "website",
  },
  twitter: { card: "summary_large_image" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja" className={maru.variable}>
      <body>{children}</body>
    </html>
  );
}
