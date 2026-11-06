import { buildFeed } from "@/lib/rss";
import { getSiteData, siteUrl } from "@/lib/site";

export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  const ivs = getSiteData().interventions;
  // Static export needs at least one path; "none.xml" is an empty feed when nothing is published.
  return ivs.length ? ivs.map((iv) => ({ file: `${iv.id}.xml` })) : [{ file: "none.xml" }];
}

export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const id = file.replace(/\.xml$/, "");
  const data = getSiteData();
  const body = data.interventions.some((iv) => iv.id === id)
    ? buildFeed({ siteUrl: siteUrl(), data, interventionId: id })
    : buildFeed({ siteUrl: siteUrl(), data: { ...data, updates: [] } });
  return new Response(body, { headers: { "Content-Type": "application/rss+xml; charset=utf-8" } });
}
