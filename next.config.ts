import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Vercel deploy (NÃO usar output: 'standalone' em Vercel — gera artefatos desnecessários)
  poweredByHeader: false,
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb",
    },
  },
};

export default nextConfig;