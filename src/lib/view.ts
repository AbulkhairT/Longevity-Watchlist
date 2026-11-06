import type { ContentBundle, ContentMode } from "./content";
import {
  CONFIDENCE_LEVEL,
  UPDATE_KIND_LABEL,
  changeHero,
  changeLine,
  confidenceLabel,
  evidenceBaseLabel,
  findingLabel,
  formatDate,
  outcomeLabel,
  pad2,
} from "./labels";
import type { Claim, EvidenceRecord } from "./schema";

/** Serializable, display-ready data handed to client components. */

export interface SourceView {
  id: string;
  title: string;
  url: string;
  idLabel: string;
  recordType: string;
  published: string;
  revised: string | null;
  retrieved: string;
  abstractOnly: boolean;
  design: string;
  sampleSize: string;
  population: string;
}

export interface TimelineEntry {
  id: string;
  num: string;
  kindLabel: string;
  date: string;
  change: string;
  summary: string;
  whyItMatters: string;
  reasoning: string;
  reviewLine: string | null;
  sources: SourceView[];
}

export interface UpdateView {
  id: string;
  claimId: string;
  interventionId: string;
  interventionName: string;
  claimTitle: string;
  date: string | null;
  dateLabel: string;
  /** "Confidence very low → low" / "New evidence, grade unchanged" */
  change: string;
  hero: string;
  summary: string;
  whyItMatters: string;
}

export interface ClaimView {
  id: string;
  href: string;
  interventionId: string;
  interventionName: string;
  title: string;
  fixture: boolean;
  population: string;
  evidenceBase: string;
  confidence: string;
  confidenceLevel: number;
  finding: string;
  measured: string;
  design: string;
  plain: string;
  summary: string;
  rationale: string;
  limitations: string;
  sourceCount: string;
  provenance: string;
  reviewLine: string;
  latest: UpdateView | null;
  /** IDs of reviewed changes (excludes the first assessment), oldest first. */
  updateIds: string[];
  timeline: TimelineEntry[];
  sources: SourceView[];
}

export interface InterventionView {
  id: string;
  num: string;
  name: string;
  summary: string;
  claims: ClaimView[];
}

export interface SiteData {
  mode: ContentMode;
  interventions: InterventionView[];
  /** Reviewed changes, newest first. */
  updates: UpdateView[];
}

function sourceView(e: EvidenceRecord): SourceView {
  const ids: string[] = [];
  if (e.identifiers.pmid) ids.push(`PMID ${e.identifiers.pmid}`);
  if (e.identifiers.doi) ids.push(`DOI ${e.identifiers.doi}`);
  if (e.identifiers.nct) ids.push(e.identifiers.nct);
  if (e.identifiers.fda) ids.push(`FDA ${e.identifiers.fda}`);
  const recordType = {
    "study-result": "Study result",
    "trial-registration": "Trial registration",
    "trial-status-change": "Trial status change",
    "regulatory-notice": "Regulatory notice",
  }[e.recordType];
  return {
    id: e.id,
    title: e.title,
    url: e.url,
    idLabel: ids.join(" · "),
    recordType,
    published: e.publishedDate ? formatDate(e.publishedDate) : "Date not reported",
    revised: e.sourceRevisionDate ? formatDate(e.sourceRevisionDate) : null,
    retrieved: e.retrievedAt.slice(0, 10),
    abstractOnly: e.abstractOnly,
    design: e.design.replace(/-/g, " "),
    sampleSize: typeof e.sampleSize === "number" ? `n = ${e.sampleSize}` : "Sample size not reported",
    population: e.population,
  };
}

export function buildSiteData(bundle: ContentBundle): SiteData {
  const evidence = new Map(bundle.evidence.map((e) => [e.id, sourceView(e)]));
  const ivs = [...bundle.interventions].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
  const ivName = new Map(ivs.map((i) => [i.id, i.name]));

  const updates: (UpdateView & { order: number })[] = [];

  const claimView = (c: Claim, order: number): ClaimView => {
    const a = c.assessment;
    const base = a.evidenceBase;
    const cite = (ids: string[]) => ids.map((id) => evidence.get(id)).filter((s): s is SourceView => !!s);
    const changes = c.updates.filter((u) => u.kind !== "first-assessment");
    const toUpdateView = (u: Claim["updates"][number]): UpdateView => ({
      id: u.id,
      claimId: c.id,
      interventionId: c.interventionId,
      interventionName: ivName.get(c.interventionId) ?? c.interventionId,
      claimTitle: c.title,
      date: u.date,
      dateLabel: formatDate(u.date),
      change: changeLine(u.previous, u.next, base),
      hero: changeHero(u.previous, u.next, base),
      summary: u.summary,
      whyItMatters: u.whyItMatters,
    });
    for (const u of changes) updates.push({ ...toUpdateView(u), order });
    const latestRaw = changes[changes.length - 1];
    const sources = cite([...new Set([...a.evidenceIds, ...c.updates.flatMap((u) => u.evidenceIds)])]);
    const reviewLine =
      c.review.status === "approved"
        ? `Reviewed ${formatDate(c.review.reviewedAt)} by ${c.review.reviewer.name}`
        : c.fixture
          ? "Sample content, not reviewed"
          : "Not reviewed";
    return {
      id: c.id,
      href: `/claims/${c.id}/`,
      interventionId: c.interventionId,
      interventionName: ivName.get(c.interventionId) ?? c.interventionId,
      title: c.title,
      fixture: c.fixture,
      population: a.population,
      evidenceBase: evidenceBaseLabel(base),
      confidence: confidenceLabel(a.confidence),
      confidenceLevel: CONFIDENCE_LEVEL[a.confidence],
      finding: findingLabel(a.finding, base),
      measured: outcomeLabel(a.outcomeType),
      design: a.design,
      plain: a.plain,
      summary: a.summary,
      rationale: a.rationale,
      limitations: a.limitations,
      sourceCount: c.fixture ? "[#] sources" : `${sources.length} ${sources.length === 1 ? "source" : "sources"}`,
      provenance: c.fixture
        ? "[#] sources · Not reviewed"
        : `${sources.length} ${sources.length === 1 ? "source" : "sources"} · ${reviewLine}`,
      reviewLine,
      latest: latestRaw ? toUpdateView(latestRaw) : null,
      updateIds: changes.map((u) => u.id),
      timeline: [...c.updates].reverse().map((u, i) => ({
        id: u.id,
        num: pad2(i + 1),
        kindLabel: c.fixture ? `Sample ${UPDATE_KIND_LABEL[u.kind].toLowerCase()}` : UPDATE_KIND_LABEL[u.kind],
        date: formatDate(u.date),
        change: changeLine(u.previous, u.next, base),
        summary: u.summary,
        whyItMatters: u.whyItMatters,
        reasoning: u.reasoning,
        reviewLine:
          u.review.status === "approved"
            ? `Reviewed ${formatDate(u.review.reviewedAt)} by ${u.review.reviewer.name}`
            : null,
        sources: cite(u.evidenceIds),
      })),
      sources,
    };
  };

  let order = 0;
  const interventions: InterventionView[] = ivs.map((iv, i) => ({
    id: iv.id,
    num: pad2(i + 1),
    name: iv.name,
    summary: iv.summary,
    claims: bundle.claims
      .filter((c) => c.interventionId === iv.id)
      .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title))
      .map((c) => claimView(c, order++)),
  }));

  updates.sort((a, b) => {
    if (a.date && b.date && a.date !== b.date) return a.date < b.date ? 1 : -1;
    if (a.date && !b.date) return -1;
    if (!a.date && b.date) return 1;
    return a.order - b.order;
  });

  return {
    mode: bundle.mode,
    interventions,
    updates: updates.map(({ order: _o, ...u }) => u),
  };
}

export function allClaims(data: SiteData): ClaimView[] {
  return data.interventions.flatMap((i) => i.claims);
}
