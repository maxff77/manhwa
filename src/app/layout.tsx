import { ReticleDev } from './reticle-dev';
import type { Metadata } from "next";
import { Geist } from "next/font/google";

import { Providers } from "./providers";
import "./globals.css";

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Manhwa",
    template: "%s · Manhwa",
  },
  description: "Catálogo, lector webtoon y biblioteca personal de manhwa en español.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body className={`${geist.variable} bg-background font-sans text-foreground antialiased`}>{process.env.NODE_ENV === 'development' ? <ReticleDev /> : null}
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
