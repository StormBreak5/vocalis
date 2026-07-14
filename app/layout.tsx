import type { Metadata } from "next";
import { Roboto, Roboto_Mono } from "next/font/google";
import { OfflineBanner } from "@/src/components/ui/OfflineBanner";
import { Toaster } from "@/src/components/ui/sonner";
import "./globals.css";

const roboto = Roboto({
  variable: "--font-roboto",
  subsets: ["latin"],
  weight: ["100", "300", "400", "500", "700", "900"],
});

const robotoMono = Roboto_Mono({
  variable: "--font-roboto-mono",
  subsets: ["latin"],
});

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
        className={`${roboto.variable} ${robotoMono.variable} h-full antialiased dark`}
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
