import type { Metadata } from "next";
import "@fontsource-variable/roboto/wght.css";
import "@fontsource-variable/roboto-mono/wght.css";
import { OfflineBanner } from "@/src/components/ui/OfflineBanner";
import { Toaster } from "@/src/components/ui/sonner";
import { ServiceWorkerManager } from "@/src/components/pwa/ServiceWorkerManager";
import { getMetadataBaseUrl } from "@/src/infrastructure/config/app-public-url.server";
import "./globals.css";


const APP_NAME = "Vocalis";
const APP_TAGLINE = "Sua fila de karaokê ao vivo";

export const metadata: Metadata = {
  metadataBase: getMetadataBaseUrl(),
  title: {
    default: `${APP_NAME} — Karaokê ao Vivo`,
    template: `%s · ${APP_NAME}`,
  },
  description: APP_TAGLINE,
  applicationName: APP_NAME,
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: APP_NAME,
  },
  formatDetection: {
    telephone: false,
  },
  openGraph: {
    type: "website",
    siteName: APP_NAME,
    locale: "pt_BR",
    title: `${APP_NAME} — Karaokê ao Vivo`,
    description: APP_TAGLINE,
  },
  twitter: {
    card: "summary_large_image",
    title: `${APP_NAME} — Karaokê ao Vivo`,
    description: APP_TAGLINE,
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
