import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "RestaurantePro",
    short_name: "RestaurantePro",
    description: "Peça online e retire no balcão. Gestão de salão, comandas e caixa.",
    start_url: "/",
    display: "standalone",
    background_color: "#fafaf9",
    theme_color: "#ff9800",
    lang: "pt-BR",
    categories: ["food"],
    icons: [
      {
        src: "/icons/brand-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/brand-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/brand-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}