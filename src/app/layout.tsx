import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { ClaimDrawer } from "@/components/claim-drawer";
import { SiteFooter } from "@/components/site-footer";
import { SiteNav } from "@/components/site-nav";
import { WatchlistProvider } from "@/components/watchlist-provider";
import { SITE_DESCRIPTION, SITE_NAME } from "@/lib/labels";
import { getSiteData, siteUrl } from "@/lib/site";
import "./globals.css";

// Self-hosted fonts (SIL Open Font License 1.1, see src/app/fonts/OFL-*.txt).
const outfit = localFont({
  src: [
    { path: "./fonts/outfit-latin-300-normal.woff2", weight: "300", style: "normal" },
    { path: "./fonts/outfit-latin-400-normal.woff2", weight: "400", style: "normal" },
  ],
  variable: "--font-display",
  display: "swap",
});
const inter = localFont({
  src: [
    { path: "./fonts/inter-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "./fonts/inter-latin-500-normal.woff2", weight: "500", style: "normal" },
  ],
  variable: "--font-body",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: { default: SITE_NAME, template: `%s · ${SITE_NAME}` },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  openGraph: { title: SITE_NAME, description: SITE_DESCRIPTION, siteName: SITE_NAME, type: "website" },
  alternates: { types: { "application/rss+xml": [{ url: "/feed.xml", title: SITE_NAME }] } },
  robots: getSiteData().mode === "fixtures" ? { index: false, follow: false } : undefined,
};

export const viewport: Viewport = { themeColor: "#F3F3F2", colorScheme: "light" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const data = getSiteData();
  return (
    <html lang="en" className={`${outfit.variable} ${inter.variable}`}>
      <body>
        <WatchlistProvider data={data}>
          <div id="lw-app">
            <a className="skip" href="#main">
              Skip to content
            </a>
            <div className="wrap">
              <SiteNav />
              <main id="main" tabIndex={-1}>
                {children}
              </main>
              <SiteFooter mode={data.mode} />
            </div>
          </div>
          <ClaimDrawer />
        </WatchlistProvider>
      </body>
    </html>
  );
}
