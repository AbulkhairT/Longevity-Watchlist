import { SITE_DESCRIPTION, SITE_NAME } from "./labels";
import type { SiteData, UpdateView } from "./view";

function xml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function rfc822(date: string | null): string | null {
  if (!date) return null;
  return new Date(`${date}T00:00:00Z`).toUTCString();
}

export interface FeedOptions {
  siteUrl: string;
  data: SiteData;
  interventionId?: string;
}

/** RSS 2.0. Only reviewed updates in published builds; fixture builds mark every item as a sample. */
export function buildFeed({ siteUrl, data, interventionId }: FeedOptions): string {
  const iv = interventionId ? data.interventions.find((i) => i.id === interventionId) : undefined;
  if (interventionId && !iv) throw new Error(`Unknown intervention ${interventionId}`);
  const updates: UpdateView[] = data.updates.filter((u) => !interventionId || u.interventionId === interventionId);
  const sample = data.mode === "fixtures";
  const title = iv ? `${SITE_NAME}: ${iv.name}` : SITE_NAME;
  const selfPath = iv ? `/feeds/${iv.id}.xml` : "/feed.xml";
  const description = sample
    ? "Illustrative prototype with sample data. Not reviewed assessments."
    : iv
      ? `Reviewed evidence updates for ${iv.name} claims.`
      : SITE_DESCRIPTION;
  const latest = updates.map((u) => u.date).filter((d): d is string => !!d).sort().pop() ?? null;
  const items = updates.map((u) => {
    const link = `${siteUrl}/claims/${u.claimId}/`;
    const pub = rfc822(u.date);
    const prefix = sample ? "[Sample] " : "";
    return [
      "    <item>",
      `      <title>${xml(`${prefix}${u.interventionName}: ${u.claimTitle}. ${u.change}`)}</title>`,
      `      <link>${xml(link)}</link>`,
      `      <guid isPermaLink="false">${xml(`longevity-watchlist:${u.id}`)}</guid>`,
      pub ? `      <pubDate>${pub}</pubDate>` : null,
      `      <category>${xml(u.interventionName)}</category>`,
      `      <description>${xml(`${u.summary} ${u.whyItMatters}`)}</description>`,
      "    </item>",
    ]
      .filter(Boolean)
      .join("\n");
  });
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    "  <channel>",
    `    <title>${xml(title)}</title>`,
    `    <link>${xml(`${siteUrl}/`)}</link>`,
    `    <description>${xml(description)}</description>`,
    "    <language>en</language>",
    `    <atom:link href="${xml(siteUrl + selfPath)}" rel="self" type="application/rss+xml"/>`,
    latest ? `    <lastBuildDate>${rfc822(latest)}</lastBuildDate>` : null,
    ...items,
    "  </channel>",
    "</rss>",
    "",
  ]
    .filter((l) => l !== null)
    .join("\n");
}
