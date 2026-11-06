import fs from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import { Eyebrow } from "@/components/ui";
import { renderMarkdown } from "@/lib/markdown";

export const metadata: Metadata = {
  title: "How we grade evidence",
  description: "The evidence rubric and corrections policy behind every Longevity Watchlist grade.",
};

export default function Methodology() {
  // docs/EVIDENCE_RUBRIC.md is the single source of truth for the rubric.
  const html = renderMarkdown(fs.readFileSync(path.join(process.cwd(), "docs", "EVIDENCE_RUBRIC.md"), "utf8"));
  return (
    <article aria-labelledby="method-title">
      <header className="section-head first">
        <div className="section-title">
          <Eyebrow>Methodology</Eyebrow>
          <h1 className="h-page" id="method-title">
            How we grade evidence
          </h1>
        </div>
        <p className="aside">Five separate dimensions per claim, a named human reviewer for every published grade.</p>
      </header>
      <div className="card prose" dangerouslySetInnerHTML={{ __html: html }} />
    </article>
  );
}
