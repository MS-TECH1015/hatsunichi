import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "hatsunichi — 鳥取の町で、仕事の初日",
  description: "鳥取の大学生が模型の町を歩き、住民に話しかけ、人手不足の依頼に一言で案を出す。数字は公開データの出典つき",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
