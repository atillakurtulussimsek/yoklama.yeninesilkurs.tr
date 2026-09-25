import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // PDF fontları standalone çıktıya dahil edilsin
  outputFileTracingIncludes: {
    "/api/rapor/gunluk-devamsizlik": ["./src/assets/fonts/*"],
    "/api/rapor/sinav/[id]/pdf": ["./src/assets/fonts/*"],
  },
  serverExternalPackages: ["pdfkit"],
  experimental: {
    serverActions: {
      // Excel ve toplu fiş görseli yüklemeleri için
      bodySizeLimit: "100mb",
    },
  },
};

export default nextConfig;
