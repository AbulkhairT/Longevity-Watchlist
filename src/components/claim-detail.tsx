import Link from "next/link";
import type { ClaimView, SourceView } from "@/lib/view";
import { Eyebrow, Stats } from "./ui";

function SourceList({ sources }: { sources: SourceView[] }) {
  if (!sources.length) return null;
  return (
    <ul className="sources">
      {sources.map((s) => (
        <li key={s.id}>
          <a href={s.url} target="_blank" rel="noopener noreferrer">
            {s.title}
          </a>
          <span className="meta">
            {s.recordType} · {s.idLabel} · Published {s.published}
            {s.revised ? ` · Revised ${s.revised}` : ""} · Retrieved {s.retrieved}
            {s.abstractOnly ? " · Abstract only" : ""}
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Full claim detail, used by the drawer and by the standalone /claims/[id] page.
 * Order: claim and population, grade, plain assessment, latest change,
 * timeline, study details and limitations, sources, methodology.
 */
export function ClaimDetail({ claim, headingId, headingLevel = 2 }: { claim: ClaimView; headingId?: string; headingLevel?: 1 | 2 }) {
  const H = headingLevel === 1 ? "h1" : "h2";
  return (
    <div className="detail">
      <div className="detail-head">
        <span className="kicker">{claim.interventionName}</span>
        <H className="h-section" id={headingId}>
          {claim.title}
        </H>
        <span className="muted">
          {claim.evidenceBase} · {claim.population}
        </span>
      </div>

      {claim.fixture ? <p className="fixture-note">Illustrative sample. Not a reviewed assessment.</p> : null}

      <Stats level={claim.confidenceLevel} confidence={claim.confidence} finding={claim.finding} measured={claim.measured} />

      <p className="body">{claim.summary}</p>

      {claim.latest ? (
        <div className="latest">
          <span className="hero-change">{claim.latest.hero}</span>
          <span className="body-sm">{claim.latest.summary}</span>
          <span className="body-sm muted">{claim.latest.whyItMatters}</span>
        </div>
      ) : null}

      <section className="timeline" aria-labelledby={headingId ? `${headingId}-tl` : undefined}>
        <Eyebrow as={headingLevel === 1 ? "h2" : "h3"} id={headingId ? `${headingId}-tl` : undefined}>
          {claim.fixture ? "Sample timeline" : "Research timeline"}
        </Eyebrow>
        <ol>
          {claim.timeline.map((t) => (
            <li key={t.id}>
              <span className="num">[{t.num}]</span>
              <span className="tl-body">
                <span className="tl-meta">
                  {t.kindLabel} · {t.date}
                </span>
                <span className="body-sm">{t.summary}</span>
                {t.reviewLine ? <span className="tl-meta-sm">{t.reviewLine}</span> : null}
                <SourceList sources={t.sources} />
              </span>
            </li>
          ))}
        </ol>
      </section>

      <div className="disclosures">
        <details>
          <summary>
            Why this grade<span aria-hidden="true">+</span>
          </summary>
          <div className="disclosure-body">{claim.rationale}</div>
        </details>
        <details>
          <summary>
            Study details<span aria-hidden="true">+</span>
          </summary>
          <div className="disclosure-body">
            {claim.design}. {claim.evidenceBase}. Studied population: {claim.population}.
          </div>
        </details>
        <details>
          <summary>
            Limitations<span aria-hidden="true">+</span>
          </summary>
          <div className="disclosure-body">{claim.limitations}</div>
        </details>
        <details open={!claim.fixture && claim.sources.length > 0}>
          <summary>
            Sources<span aria-hidden="true">+</span>
          </summary>
          <div className="disclosure-body">
            {claim.fixture ? (
              <p>
                Sample content has no sources attached. Published claims list each source with its PMID, DOI or NCT ID,
                publication date, retrieval date and review date.
              </p>
            ) : claim.sources.length ? (
              <>
                <p>{claim.reviewLine}.</p>
                <SourceList sources={claim.sources} />
              </>
            ) : (
              <p>No sources recorded.</p>
            )}
          </div>
        </details>
      </div>

      <p className="fineprint">
        Research summary only. Not medical advice, dosing guidance, or a product recommendation.{" "}
        <Link href="/methodology/">How we grade evidence</Link>
        {" · "}
        <a href={claim.href}>Direct link to this claim</a>
      </p>
    </div>
  );
}
