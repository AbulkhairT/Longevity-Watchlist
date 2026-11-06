import { buildFeed } from "@/lib/rss";
import { getSiteData, siteUrl } from "@/lib/site";

export const dynamic = "force-static";

export function GET() {
  return new Response(buildFeed({ siteUrl: siteUrl(), data: getSiteData() }), {
    headers: { "Content-Type": "application/rss+xml; charset=utf-8" },
  });
}
