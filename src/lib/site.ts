import { loadContent } from "./content";
import { buildSiteData, type SiteData } from "./view";

let cached: SiteData | null = null;

/** Build-time site data. Server only. */
export function getSiteData(): SiteData {
  if (!cached) cached = buildSiteData(loadContent());
  return cached;
}

/** Absolute site URL for feeds and metadata. Set NEXT_PUBLIC_SITE_URL in production. */
export function siteUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000");
  return raw.replace(/\/+$/, "");
}
