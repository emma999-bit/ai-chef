import type { NextConfig } from "next";

const fastapiOrigin = process.env.FASTAPI_ORIGIN ?? "http://127.0.0.1:8001";

// BUILD_EXPORT=1 时产出纯静态站（out/），拷进 app/static 由 FastAPI 托管；
// 此时页面与 API 同源，无需 rewrite（静态导出也不支持 rewrite）。
const isStaticExport = process.env.BUILD_EXPORT === "1";

const nextConfig: NextConfig = isStaticExport
  ? { output: "export" }
  : {
      async rewrites() {
        return [
          {
            source: "/api/v1/:path*",
            destination: `${fastapiOrigin}/api/v1/:path*`,
          },
        ];
      },
    };

export default nextConfig;
