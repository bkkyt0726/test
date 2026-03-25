import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    // 프로덕션(Vercel)에서는 vercel.json 의 rewrite 가 /api/* 를 처리함
    if (process.env.VERCEL) return [];

    // 로컬 dev: /api/* → 로컬 FastAPI 서버로 프록시
    return [
      {
        source: "/api/:path*",
        destination: `${process.env.BACKEND_URL ?? "http://localhost:8000"}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
