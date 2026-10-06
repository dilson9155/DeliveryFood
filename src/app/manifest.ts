import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Delicias das Estações",
    short_name: "Delicias",
    description: "Peça sua comida e retire no estabelecimento.",
    start_url: "/",
    display: "standalone",
    background_color: "#fafaf9",
    theme_color: "#f97316",
    lang: "pt-BR",
    categories: ["food"],
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}