import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Habilita build standalone (imagem Docker menor, sem node_modules no output)
  output: "standalone",
  // Trust Hostinger proxy / domínio
  poweredByHeader: false,
  experimental: {
    // Necessário para o proxy.ts usar Headers do runtime
    serverActions: {
      bodySizeLimit: "2mb",
    },
  },
};

export default nextConfig;