import type { Metadata } from "next";
import "@fontsource-variable/roboto/wght.css";
import "@fontsource-variable/roboto-mono/wght.css";
import { OfflineBanner } from "@/src/components/ui/OfflineBanner";
import { Toaster } from "@/src/components/ui/sonner";
import { ServiceWorkerManager } from "@/src/components/pwa/ServiceWorkerManager";
import { getMetadataBaseUrl } from "@/src/infrastructure/config/app-public-url.server";
import "./globals.css";


export const metadata: Metadata = {
  metadataBase: getMetadataBaseUrl(),
  title: "Vocalis",
  description: "Karaokê Queue Manager",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Vocalis",
  },
  formatDetection: {
    telephone: false,
  },
};

// Sem `maximumScale`/`userScalable: false`: bloquear zoom viola WCAG 2.1 AA
// (1.4.4 Resize Text) — e o app se compromete com AA.
export const viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#09090b",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
      <html
        lang="pt-BR"
        className="h-full antialiased dark"
      >
      <body className="flex flex-col min-h-[100dvh] antialiased pb-safe">
        <OfflineBanner />
        {children}
        <Toaster position="top-center" richColors theme="dark" />
        <ServiceWorkerManager />
      </body>
    </html>
  );
}
