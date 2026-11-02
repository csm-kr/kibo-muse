import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 영상·사용자 시험 화면에 Next 개발 표시가 끼지 않게 한다
  devIndicators: false,
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
