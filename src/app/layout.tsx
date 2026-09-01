import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "./globals.css";
import Loader from "@/components/Loader";

export const metadata: Metadata = {
  title: "VOXBOX",
  description: "Record voice memos, get an instant outline and task breakdown.",
  manifest: "/manifest.webmanifest",
  applicationName: "VOXBOX",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "VOXBOX",
  },
  other: {
    "apple-mobile-web-app-capable": "yes",
    "format-detection": "telephone=no",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: { url: "/icons/apple-icon.png", sizes: "180x180", type: "image/png" },
  },
};

export const viewport: Viewport = {
  themeColor: "#000000",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "contain",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        {children}
        <Loader />
        <Script src="/sw-register.js" strategy="afterInteractive" />
      </body>
    </html>
  );
}
