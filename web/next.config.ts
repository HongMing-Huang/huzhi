import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone", // Docker 部署用：产出精简独立运行目录（server.js）
};

export default nextConfig;
