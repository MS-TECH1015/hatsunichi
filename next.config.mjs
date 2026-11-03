// GitHub Pages 向けの静的書き出し。プロジェクトサイトは /hatsunichi/ の下に出るので basePath を環境変数で受ける
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "export",
  basePath,
  trailingSlash: true,
  images: { unoptimized: true },
};
export default nextConfig;
