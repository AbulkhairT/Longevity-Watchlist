import { hashApprovalCheck } from "./approval";
import { ContentError, selectPublishable, type ContentMode, type RawContent } from "./content";
import { changeHero, confidenceLabel, findingLabel, formatDate } from "./labels";
import { weekTotals, type InterventionCounts, type MonitoringRun } from "./monitoring";
import type { Claim, ClaimUpdate, EvidenceRecord } from "./schema";

/**
 * Weekly digest builder. Input is raw content plus monitoring runs; in
 * published mode it re-applies the same publication guard as the website
 * (fixtures throw, unapproved or changed-after-approval claims are dropped),
 * so drafts and raw AI output can never reach a production digest.
 */

export const DISCLAIMER = "Research summary only. Not medical advice.";
export const NOTHING_CHANGED = "Nothing changed the evidence this week.";

export interface DigestInput {
  mode: ContentMode;
  raw: RawContent;
  runs: readonly MonitoringRun[];
  /** Monday (or any start day) of the week, YYYY-MM-DD. The week is [weekStart, weekStart + 7 days). */
  weekStart: string;
  siteUrl: string;
  correctionsUrl: string;
  /** Intervention IDs to include. Omit for the general roundup (all interventions). */
  follow?: readonly string[];
}

export interface DigestLink {
  label: string;
  url: string;
}

export interface DigestChange {
  claimTitle: string;
  claimUrl: string;
  hero: string;
  previous: string;
  next: string;
  summary: string;
  reasoning: string;
  whyItMatters: string;
  date: string;
}

export interface DigestSection {
  interventionId: string;
  name: string;
  checked: string;
  counts: InterventionCounts | null;
  gradeChanges: DigestChange[];
  highlight: { claimTitle: string; claimUrl: string; text: string; why: string } | null;
  claimLinks: DigestLink[];
  sourceLinks: DigestLink[];
}

export interface Digest {
  kind: "roundup" | "personalized";
  sample: boolean;
  title: string;
  weekLabel: string;
  intro: string;
  sections: DigestSection[];
  correctionsUrl: string;
  siteUrl: string;
}

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function checkedSentence(c: InterventionCounts | null, anyRuns: boolean): string {
  if (!anyRuns) return "No monitoring run was recorded this week, so there is nothing to report about what was checked.";
  if (!c) return "We ran our searches, but none covered this intervention this week.";
  let s = `We screened ${plural(c.papersScreened, "new paper", "new papers")} and ${plural(c.trialRecordsChecked, "trial update", "trial updates")}.`;
  if (c.candidatesFound > 0) {
    s += ` ${plural(c.candidatesFound, "record", "records")} looked relevant enough to read`;
    const rejected = c.rejectedIrrelevant + c.rejectedDuplicate;
    if (rejected > 0) {
      const what =
        c.rejectedIrrelevant && c.rejectedDuplicate
          ? "off-topic or duplicates"
          : c.rejectedDuplicate
            ? rejected === 1 ? "a duplicate" : "duplicates"
            : "off-topic";
      s += `; ${rejected} turned out to be ${what}`;
    }
    s += ".";
  }
  return s;
}

function isGradeChange(u: ClaimUpdate): boolean {
  return !!u.previous && (u.previous.confidence !== u.next.confidence || u.previous.finding !== u.next.finding);
}

export function buildDigest(input: DigestInput): Digest {
  const sample = input.mode === "fixtures";
  let claims: Claim[];
  let evidence: EvidenceRecord[];
  let interventions = input.raw.interventions;

  if (sample) {
    if ([...input.raw.claims, ...input.raw.interventions].some((r) => !r.fixture)) {
      throw new ContentError("Sample digests are built from fixtures only");
    }
    claims = input.raw.claims;
    evidence = [];
  } else {
    if (input.runs.some((r) => r.fixture)) throw new ContentError("Fixture monitoring runs cannot enter a production digest");
    const pub = selectPublishable(input.raw, hashApprovalCheck(input.raw.evidence));
    claims = pub.claims;
    evidence = pub.evidence;
    interventions = pub.interventions;
  }

  const weekEnd = addDays(input.weekStart, 7);
  // Sample runs are undated placeholders: use them all, and they are labelled sample data.
  const totals = sample
    ? weekTotals(input.runs.filter((r) => r.fixture), "0000-01-01", "9999-12-31")
    : weekTotals(input.runs, input.weekStart, weekEnd);

  const evidenceById = new Map(evidence.map((e) => [e.id, e]));
  const site = input.siteUrl.replace(/\/+$/, "");
  const claimUrl = (id: string) => `${site}/claims/${id}/`;
  const inWeek = (u: ClaimUpdate) =>
    u.kind !== "first-assessment" && (sample ? u.date === null : !!u.date && u.date >= input.weekStart && u.date < weekEnd);

  const follow = input.follow ? new Set(input.follow) : null;
  if (follow) {
    for (const id of follow) {
      if (!interventions.some((i) => i.id === id)) throw new ContentError(`Unknown or unpublished intervention "${id}"`);
    }
  }
  const ivs = [...interventions].sort((a, b) => a.order - b.order).filter((iv) => !follow || follow.has(iv.id));

  const sections: DigestSection[] = ivs.map((iv) => {
    const ivClaims = claims.filter((c) => c.interventionId === iv.id).sort((a, b) => a.order - b.order);
    const weekly = ivClaims.flatMap((c) => c.updates.filter(inWeek).map((u) => ({ c, u })));
    const gradeChanges = weekly
      .filter(({ u }) => isGradeChange(u))
      .map(({ c, u }) => ({
        claimTitle: c.title,
        claimUrl: claimUrl(c.id),
        hero: changeHero(u.previous, u.next, c.assessment.evidenceBase),
        previous: `${confidenceLabel(u.previous!.confidence)} confidence, ${findingLabel(u.previous!.finding, c.assessment.evidenceBase).toLowerCase()}`,
        next: `${confidenceLabel(u.next.confidence)} confidence, ${findingLabel(u.next.finding, c.assessment.evidenceBase).toLowerCase()}`,
        summary: u.summary,
        reasoning: u.reasoning,
        whyItMatters: u.whyItMatters,
        date: formatDate(u.date),
      }));
    // Most worth knowing: a grade change first, then a correction, then new evidence.
    const rank = (u: ClaimUpdate) => (isGradeChange(u) ? 0 : u.kind === "correction" ? 1 : 2);
    const top = [...weekly].sort((a, b) => rank(a.u) - rank(b.u))[0];
    const sourceIds = [...new Set(weekly.flatMap(({ u }) => u.evidenceIds))];
    return {
      interventionId: iv.id,
      name: iv.name,
      checked: checkedSentence(totals.byIntervention.get(iv.id) ?? null, totals.runs > 0),
      counts: totals.byIntervention.get(iv.id) ?? null,
      gradeChanges,
      highlight: top
        ? { claimTitle: top.c.title, claimUrl: claimUrl(top.c.id), text: top.u.summary, why: top.u.whyItMatters }
        : null,
      claimLinks: ivClaims.map((c) => ({ label: `${iv.name}: ${c.title}`, url: claimUrl(c.id) })),
      sourceLinks: sourceIds
        .map((id) => evidenceById.get(id))
        .filter((e): e is EvidenceRecord => !!e)
        .map((e) => ({
          label: `${e.title}${e.identifiers.pmid ? ` (PMID ${e.identifiers.pmid})` : e.identifiers.nct ? ` (${e.identifiers.nct})` : ""}`,
          url: e.url,
        })),
    };
  });

  const personalized = !!follow;
  const names = ivs.map((i) => i.name);
  const weekLabel = sample ? "Sample week" : `Week of ${formatDate(input.weekStart)}`;
  return {
    kind: personalized ? "personalized" : "roundup",
    sample,
    title: `${sample ? "[SAMPLE] " : ""}${personalized ? `Your Longevity Watchlist digest: ${names.join(", ")}` : "Longevity Watchlist weekly roundup"}`,
    weekLabel,
    intro: personalized
      ? "What we checked this week for the interventions you follow, what changed, and why it matters."
      : "What we checked this week across every intervention we cover, and what changed.",
    sections,
    correctionsUrl: input.correctionsUrl.startsWith("/") ? `${site}${input.correctionsUrl}` : input.correctionsUrl,
    siteUrl: site,
  };
}

// ---------------------------------------------------------------------------
// Renderers
// ---------------------------------------------------------------------------

const SAMPLE_NOTE = "Sample data. Illustrative fixtures and placeholder counts, not reviewed assessments or real monitoring.";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Markdown-escape the few characters that would change meaning in our text. */
function mdText(s: string): string {
  return s.replace(/([\\`*_[\]<>])/g, "\\$1");
}

export function renderMarkdown(d: Digest): string {
  const out: string[] = [`# ${mdText(d.title)}`, "", `_${d.weekLabel}_`, ""];
  if (d.sample) out.push(`> **${SAMPLE_NOTE}**`, "");
  out.push(mdText(d.intro), "");
  d.sections.forEach((s, i) => {
    out.push(`## [${String(i + 1).padStart(2, "0")}] ${mdText(s.name)}`, "");
    out.push(`**What we checked.** ${mdText(s.checked)}${d.sample ? " _(sample data)_" : ""}`, "");
    if (s.gradeChanges.length) {
      out.push("**Grade changes.**", "");
      for (const g of s.gradeChanges) {
        out.push(`- [${mdText(g.claimTitle)}](${g.claimUrl}): ${mdText(g.hero)}.`);
        out.push(`  Before: ${mdText(g.previous)}. Now: ${mdText(g.next)}.`);
        out.push(`  Why: ${mdText(g.reasoning)}`);
      }
      out.push("");
    } else {
      out.push("**Grade changes.** None this week.", "");
    }
    if (s.highlight) {
      out.push(`**Most worth knowing.** [${mdText(s.highlight.claimTitle)}](${s.highlight.claimUrl}): ${mdText(s.highlight.text)} ${mdText(s.highlight.why)}`, "");
    } else {
      out.push(`**Most worth knowing.** ${NOTHING_CHANGED}`, "");
    }
    out.push(`**Claims:** ${s.claimLinks.map((l) => `[${mdText(l.label)}](${l.url})`).join(" · ")}`);
    if (s.sourceLinks.length) out.push("", `**Sources:** ${s.sourceLinks.map((l) => `[${mdText(l.label)}](${l.url})`).join(" · ")}`);
    out.push("");
  });
  out.push("---", "", `${DISCLAIMER} [Corrections](${d.correctionsUrl}) · [How we grade evidence](${d.siteUrl}/methodology/)`, "");
  return out.join("\n");
}

export function renderText(d: Digest): string {
  const out: string[] = [d.title.toUpperCase(), d.weekLabel, ""];
  if (d.sample) out.push(`*** ${SAMPLE_NOTE} ***`, "");
  out.push(d.intro, "");
  d.sections.forEach((s, i) => {
    out.push(`[${String(i + 1).padStart(2, "0")}] ${s.name.toUpperCase()}`, "");
    out.push(`What we checked: ${s.checked}${d.sample ? " (sample data)" : ""}`);
    if (s.gradeChanges.length) {
      out.push("Grade changes:");
      for (const g of s.gradeChanges) {
        out.push(`  - ${g.claimTitle}: ${g.hero}.`, `    Before: ${g.previous}. Now: ${g.next}.`, `    Why: ${g.reasoning}`, `    ${g.claimUrl}`);
      }
    } else {
      out.push("Grade changes: none this week.");
    }
    out.push(s.highlight ? `Most worth knowing: ${s.highlight.claimTitle}. ${s.highlight.text} ${s.highlight.why}` : `Most worth knowing: ${NOTHING_CHANGED}`);
    out.push("Claims:");
    for (const l of s.claimLinks) out.push(`  ${l.label}: ${l.url}`);
    if (s.sourceLinks.length) {
      out.push("Sources:");
      for (const l of s.sourceLinks) out.push(`  ${l.label}: ${l.url}`);
    }
    out.push("");
  });
  out.push("--", `${DISCLAIMER}`, `Corrections: ${d.correctionsUrl}`, `How we grade evidence: ${d.siteUrl}/methodology/`, "");
  return out.join("\n");
}

/** Email-safe HTML: inline styles, system font fallbacks, single column, 600px max. */
export function renderHtml(d: Digest): string {
  const ink = "#2A2A2A";
  const muted = "#5F5F5F";
  const meta = "#6B6B6B";
  const accent = "#B84A27";
  const line = "#E6E6E4";
  const font = "font-family:Inter,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;";
  const display = "font-family:Outfit,Inter,-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;";
  const a = (l: DigestLink) => `<a href="${esc(l.url)}" style="color:${accent};">${esc(l.label)}</a>`;
  const p = (html: string, extra = "") => `<p style="margin:0 0 12px;${font}font-size:15px;line-height:1.55;color:${ink};${extra}">${html}</p>`;
  const label = (t: string) => `<span style="${font}font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:${meta};">${t}</span><br>`;

  const sections = d.sections
    .map((s, i) => {
      const changes = s.gradeChanges.length
        ? s.gradeChanges
            .map(
              (g) =>
                `<div style="margin:0 0 12px;padding-left:14px;border-left:2px solid #E8704A;">` +
                p(`<a href="${esc(g.claimUrl)}" style="color:${ink};">${esc(g.claimTitle)}</a>: <span style="color:${accent};">${esc(g.hero)}</span>`, "margin-bottom:4px;") +
                p(`Before: ${esc(g.previous)}. Now: ${esc(g.next)}.`, `font-size:14px;color:${muted};margin-bottom:4px;`) +
                p(`Why: ${esc(g.reasoning)}`, `font-size:14px;color:${muted};`) +
                `</div>`,
            )
            .join("")
        : p("None this week.", `color:${muted};`);
      const highlight = s.highlight
        ? p(`<a href="${esc(s.highlight.claimUrl)}" style="color:${ink};">${esc(s.highlight.claimTitle)}</a>: ${esc(s.highlight.text)} ${esc(s.highlight.why)}`)
        : p(esc(NOTHING_CHANGED));
      return (
        `<tr><td style="padding:24px 0;border-top:1px solid ${line};">` +
        `<h2 style="margin:0 0 14px;${display}font-weight:300;font-size:26px;line-height:1.15;letter-spacing:-0.02em;color:${ink};"><span style="color:${accent};">[${String(i + 1).padStart(2, "0")}]</span> ${esc(s.name)}</h2>` +
        label("What we checked") +
        p(`${esc(s.checked)}${d.sample ? ` <em style="color:${meta};">(sample data)</em>` : ""}`) +
        label("Grade changes") +
        changes +
        label("Most worth knowing") +
        highlight +
        p(`${s.claimLinks.map(a).join(" &middot; ")}`, "font-size:14px;") +
        (s.sourceLinks.length ? p(`Sources: ${s.sourceLinks.map(a).join(" &middot; ")}`, "font-size:14px;") : "") +
        `</td></tr>`
      );
    })
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(d.title)}</title>
</head>
<body style="margin:0;padding:0;background:#F3F3F2;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F3F3F2;">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#FFFFFF;border-radius:16px;">
<tr><td style="padding:28px 24px 8px;">
${label(esc(d.weekLabel))}
<h1 style="margin:6px 0 12px;${display}font-weight:300;font-size:32px;line-height:1.1;letter-spacing:-0.03em;color:${ink};">${esc(d.title)}</h1>
${d.sample ? p(`<strong>${esc(SAMPLE_NOTE)}</strong>`, `font-size:13px;color:${accent};`) : ""}
${p(esc(d.intro), `color:${muted};`)}
</td></tr>
<tr><td style="padding:0 24px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${sections}</table>
</td></tr>
<tr><td style="padding:20px 24px 28px;border-top:1px solid ${line};">
${p(`${esc(DISCLAIMER)} <a href="${esc(d.correctionsUrl)}" style="color:${accent};">Corrections</a> &middot; <a href="${esc(d.siteUrl)}/methodology/" style="color:${accent};">How we grade evidence</a>`, `font-size:12px;color:${meta};margin:0;`)}
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>
`;
}
