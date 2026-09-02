import type { NextConfig } from "next";

/* 线上通过 Caddy 以 /reborn/* 路径接入，故需要 basePath。
 * 本地开发不设，保持 http://localhost:3000/ 直达。
 * basePath 在构建时固化，镜像在本地构建，因此用构建期环境变量控制。 */
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

const nextConfig: NextConfig = {
  basePath,
  // Docker 部署用：产出自带依赖的独立运行目录，镜像体积小很多
  output: "standalone",
};

export default nextConfig;
