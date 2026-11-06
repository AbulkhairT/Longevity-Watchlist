import fs from "node:fs";
import path from "node:path";
import type { Claim } from "@/lib/schema";

export function fixtureClaim(id = "creatine-cognition"): Claim {
  return JSON.parse(fs.readFileSync(path.join(process.cwd(), "fixtures", "claims", `${id}.json`), "utf8"));
}

/** A structurally valid real (non-fixture) claim, approved, for tests only. */
export function realClaim(overrides: Partial<Claim> = {}): Claim {
  const base = fixtureClaim("creatine-strength");
  const approved = {
    status: "approved" as const,
    reviewer: { name: "Test Reviewer" },
    reviewedAt: "2026-01-01",
    reasoning: "Test approval.",
    contentHash: `sha256:${"0".repeat(64)}`,
  };
  return {
    ...base,
    id: "test-claim",
    fixture: false,
    illustrative: false,
    review: approved,
    updates: base.updates.map((u) => ({ ...u, date: "2026-01-01", review: approved })),
    ...overrides,
  } as Claim;
}

import { approveClaim } from "@/lib/approval";
import type { RawContent } from "@/lib/content";
import type { EvidenceRecord, Intervention } from "@/lib/schema";
import type { MonitoringRun } from "@/lib/monitoring";

export const TEST_WEEK = "2026-11-02";

export function testIntervention(id: string, order: number): Intervention {
  return { schemaVersion: 1, id, name: id[0]!.toUpperCase() + id.slice(1), order, summary: "Test only.", aliases: [], fixture: false };
}

/** Test-only evidence record; never written to content/. */
export function testEvidence(id = "pmid-1"): EvidenceRecord {
  return {
    schemaVersion: 1,
    id,
    fixture: false,
    recordType: "study-result",
    provenance: "manual",
    title: "Test study (not a real source)",
    url: "https://example.org/test-study",
    identifiers: { pmid: "1" },
    trialId: null,
    publishedDate: "2026-10-01",
    sourceRevisionDate: null,
    retrievedAt: "2026-11-03T00:00:00Z",
    population: "Test population",
    evidenceBase: "human",
    design: "randomized-trial",
    sampleSize: "not reported",
    outcomeType: "health-outcome",
    findings: "Test findings.",
    limitations: "Test limitations.",
    abstractOnly: true,
  };
}

const REVIEW = { reviewer: { name: "Test Reviewer" }, reviewedAt: "2026-11-04", reasoning: "Test approval." };

/**
 * Approved, published-style content for digest tests:
 * - alpha: one claim with a grade change dated inside TEST_WEEK, citing pmid-1
 * - beta: one claim with no change this week
 * - gamma: one claim with new evidence (no grade change) this week
 */
export function publishedRaw(): RawContent {
  const ev = testEvidence();
  const unreviewed = { status: "unreviewed" as const };
  const mk = (id: string, iv: string, updates: Claim["updates"], grade: { confidence: Claim["assessment"]["confidence"]; finding: Claim["assessment"]["finding"] }, evidenceIds: string[] = []): Claim => {
    const base = fixtureClaim("creatine-strength");
    const claim: Claim = {
      ...base,
      id,
      interventionId: iv,
      title: `${iv} claim`,
      order: 0,
      fixture: false,
      illustrative: false,
      assessment: { ...base.assessment, ...grade, evidenceIds, rationale: "Test rationale." },
      review: unreviewed,
      updates,
    };
    return approveClaim(claim, [ev], REVIEW);
  };
  const first = (id: string, grade: { confidence: Claim["assessment"]["confidence"]; finding: Claim["assessment"]["finding"] }, date = "2026-01-05") => ({
    id: `${id}-first`, kind: "first-assessment" as const, date, summary: "First.", whyItMatters: "Baseline.", reasoning: "Seeded.",
    previous: null, next: grade, evidenceIds: [], review: unreviewed,
  });
  const vl = { confidence: "very-low" as const, finding: "mixed" as const };
  const lo = { confidence: "low" as const, finding: "mixed" as const };
  const alpha = mk("alpha-claim", "alpha", [
    first("alpha", vl),
    { id: "alpha-change", kind: "grade-change", date: "2026-11-03", summary: "A new trial added comparable data.", whyItMatters: "More trustworthy now.", reasoning: "Second comparable trial.", previous: vl, next: lo, evidenceIds: ["pmid-1"], review: unreviewed },
  ], lo, ["pmid-1"]);
  const beta = mk("beta-claim", "beta", [first("beta", lo)], lo);
  const gamma = mk("gamma-claim", "gamma", [
    first("gamma", lo),
    { id: "gamma-new", kind: "new-evidence", date: "2026-11-05", summary: "A meta-analysis agrees.", whyItMatters: "Reassuring, grade unchanged.", reasoning: "Consistent.", previous: lo, next: lo, evidenceIds: [], review: unreviewed },
  ], lo);
  return {
    interventions: [testIntervention("alpha", 0), testIntervention("beta", 1), testIntervention("gamma", 2)],
    claims: [alpha, beta, gamma],
    evidence: [ev],
  };
}

export function testRun(finishedAt: string, interventions: MonitoringRun["interventions"]): MonitoringRun {
  return {
    schemaVersion: 1,
    runId: finishedAt.replace(/:/g, "-"),
    fixture: false,
    startedAt: finishedAt,
    finishedAt,
    producedBy: "collection-pipeline",
    notes: [],
    interventions,
  };
}

export function counts(p: number, t: number, extra: Partial<MonitoringRun["interventions"][string]> = {}) {
  return { papersScreened: p, trialRecordsChecked: t, candidatesFound: 0, rejectedIrrelevant: 0, rejectedDuplicate: 0, updatesPublished: 0, gradeChanges: 0, ...extra };
}
