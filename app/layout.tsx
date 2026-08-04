import type { Metadata } from "next";
import "@fontsource-variable/roboto/wght.css";
import "@fontsource-variable/roboto-mono/wght.css";
import { OfflineBanner } from "@/src/components/ui/OfflineBanner";
import { Toaster } from "@/src/components/ui/sonner";
import "./globals.css";


export const metadata: Metadata = {
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

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
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
        {process.env.NODE_ENV === "production" && (
          <script
            dangerouslySetInnerHTML={{
              __html: `
                if ('serviceWorker' in navigator && !window.__SW_REGISTERED) {
                  window.__SW_REGISTERED = true;
                  window.addEventListener('load', function() {
                    navigator.serviceWorker.register('/sw.js').then(function(registration) {
                      console.log('ServiceWorker registration successful with scope: ', registration.scope);
                    }, function(err) {
                      console.log('ServiceWorker registration failed: ', err);
                    });
                  });
                }
              `,
            }}
          />
        )}
      </body>
    </html>
  );
}
