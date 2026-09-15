import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone", // コンテナデプロイ用に自己完結サーバーを出力
  images: { remotePatterns: [{ protocol: "https", hostname: "**" }] },
};

export default nextConfig;
