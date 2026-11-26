import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ToastProvider } from "@/components/ui/toast";
import { SWRegister } from "@/components/pwa/sw-register";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "RestaurantePro",
    template: "%s | RestaurantePro",
  },
  description: "Peça online e retire no balcão. Gestão de salão, comandas e caixa.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icons/brand-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/brand-512.png", sizes: "512x512", type: "image/png" },
    ],
    shortcut: [
      { url: "/icons/brand-16.png", sizes: "16x16", type: "image/png" },
      { url: "/icons/brand-32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: [
      { url: "/icons/brand-180.png", sizes: "180x180", type: "image/png" },
    ],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "RestaurantePro",
  },
};

export const viewport: Viewport = {
  themeColor: "#ff9800",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="pt-BR"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ToastProvider>{children}</ToastProvider>
        <SWRegister />
      </body>
    </html>
  );
}
