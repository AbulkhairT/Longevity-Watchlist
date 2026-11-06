/**
 * Checks the static export in out/ after `next build`:
 * one page per published claim, the site feed, one feed per intervention,
 * and, for published builds, no fixture content anywhere in the output.
 *
 *   npm run build && npm run check:export
 */
import fs from "node:fs";
import path from "node:path";
import { loadContent } from "../src/lib/content";

const out = path.join(process.cwd(), "out");
const errors: string[] = [];
const must = (rel: string) => {
  if (!fs.existsSync(path.join(out, rel))) errors.push(`missing ${rel}`);
};

if (!fs.existsSync(out)) {
  console.error("out/ not found. Run `npm run build` first.");
  process.exit(1);
}
const content = loadContent();
must("index.html");
must("claims/index.html");
must("updates/index.html");
must("methodology/index.html");
must("feed.xml");
for (const c of content.claims) must(`claims/${c.id}/index.html`);
for (const iv of content.interventions) must(`feeds/${iv.id}.xml`);

const feed = fs.existsSync(path.join(out, "feed.xml")) ? fs.readFileSync(path.join(out, "feed.xml"), "utf8") : "";
if (!feed.includes("<title>Longevity Watchlist</title>")) errors.push("feed.xml is not titled Longevity Watchlist");

if (content.mode === "published") {
  const markers = ["Illustrative prototype", "[Sample]", "Sample content, not reviewed"];
  const walk = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk(path.join(dir, d.name)) : [path.join(dir, d.name)]));
  const fixtureIds = fs.readdirSync(path.join(process.cwd(), "fixtures", "claims")).map((f) => f.replace(/\.json$/, ""));
  const published = new Set(content.claims.map((c) => c.id));
  for (const file of walk(out).filter((f) => /\.(html|xml|txt)$/.test(f))) {
    const text = fs.readFileSync(file, "utf8");
    for (const m of markers) if (text.includes(m)) errors.push(`${path.relative(out, file)} contains fixture marker "${m}"`);
    for (const id of fixtureIds) {
      if (!published.has(id) && text.includes(`/claims/${id}/`)) errors.push(`${path.relative(out, file)} links fixture claim ${id}`);
    }
  }
}

if (errors.length) {
  const shown = errors.slice(0, 20);
  console.error(`Export check failed (${content.mode}), ${errors.length} problems:\n- ${shown.join("\n- ")}${errors.length > shown.length ? "\n- ..." : ""}`);
  process.exit(1);
}
console.log(`Export check passed (${content.mode}): ${content.claims.length} claim pages, ${content.interventions.length} intervention feeds.`);
