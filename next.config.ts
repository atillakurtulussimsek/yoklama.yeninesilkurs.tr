import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // PDF fontları standalone çıktıya dahil edilsin
  outputFileTracingIncludes: { "/api/rapor/gunluk-devamsizlik": ["./src/assets/fonts/*"] },
  serverExternalPackages: ["pdfkit"],
  experimental: {
    serverActions: {
      // Öğrenci listesi Excel yüklemesi için
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
