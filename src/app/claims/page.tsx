import type { Metadata } from "next";
import { ClaimRow } from "@/components/claim-row";
import { Eyebrow } from "@/components/ui";
import { getSiteData } from "@/lib/site";

export const metadata: Metadata = { title: "All claims" };

export default function ClaimsIndex() {
  const data = getSiteData();
  const total = data.interventions.reduce((n, iv) => n + iv.claims.length, 0);
  return (
    <section aria-labelledby="all-title">
      <header className="section-head first">
        <div className="section-title">
          <Eyebrow>All claims</Eyebrow>
          <h1 className="h-page" id="all-title">
            {total === 1 ? "1 claim" : `${total} claims`}
          </h1>
        </div>
        <p className="aside">Each claim carries its own grade. There is no overall score for an intervention.</p>
      </header>
      {data.interventions.length === 0 ? <p className="empty">No reviewed claims have been published yet.</p> : null}
      {data.interventions.map((iv) => (
        <div key={iv.id} className="group">
          <h2 className="group-head">
            <span className="num">[{iv.num}]</span> {iv.name}
            <a className="group-feed" href={`/feeds/${iv.id}.xml`} aria-label={`RSS feed for ${iv.name}`}>
              RSS
            </a>
          </h2>
          <p className="group-summary">{iv.summary}</p>
          <div className="group-rows">
            {iv.claims.map((c) => (
              <ClaimRow key={c.id} claim={c} />
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}
