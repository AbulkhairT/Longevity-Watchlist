import type { PipelineConfig } from "@/lib/pipeline-config";
import { HttpError, type HttpClient } from "./http";
import type { TrialRecord } from "./types";

/**
 * ClinicalTrials.gov API v2 (no key). Studies updated within the lookback
 * window, newest first, paginated with nextPageToken.
 * https://clinicaltrials.gov/data-api/api
 */

export const CTGOV = "https://clinicaltrials.gov/api/v2/studies";

export function sinceDate(days: number, now = new Date()): string {
  const d = new Date(now.getTime() - days * 86400000);
  return d.toISOString().slice(0, 10);
}

export async function searchStudies(
  http: HttpClient,
  cfg: PipelineConfig["collection"]["clinicaltrials"],
  query: { intervention: string; term?: string },
  opts: { now?: Date; maxPages?: number; pageSize?: number } = {},
): Promise<{ studies: TrialRecord[]; total: number | null }> {
  const studies: TrialRecord[] = [];
  let total: number | null = null;
  let token: string | undefined;
  const maxPages = opts.maxPages ?? cfg.maxPagesPerQuery;
  for (let page = 0; page < maxPages; page++) {
    const p = new URLSearchParams({
      "query.intr": query.intervention,
      pageSize: String(opts.pageSize ?? cfg.pageSize),
      sort: "LastUpdatePostDate:desc",
      countTotal: "true",
      "filter.advanced": `AREA[LastUpdatePostDate]RANGE[${sinceDate(cfg.lookbackDays, opts.now)},MAX]`,
    });
    if (query.term) p.set("query.term", query.term);
    if (token) p.set("pageToken", token);
    const res = await http.request(`${CTGOV}?${p}`);
    if (!res.ok) throw new HttpError(`ClinicalTrials.gov: HTTP ${res.status}`, res.status);
    const body = (await res.json()) as { studies?: unknown[]; nextPageToken?: string; totalCount?: number };
    if (typeof body.totalCount === "number") total = body.totalCount;
    for (const s of body.studies ?? []) {
      const parsed = parseStudy(s);
      if (parsed) studies.push(parsed);
    }
    token = body.nextPageToken;
    if (!token) break;
  }
  return { studies, total };
}

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {});
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

export function parseStudy(raw: unknown): TrialRecord | null {
  const s = obj(raw);
  const p = obj(s.protocolSection);
  const id = obj(p.identificationModule);
  const nct = str(id.nctId);
  if (!nct || !/^NCT\d{8}$/.test(nct)) return null;
  const status = obj(p.statusModule);
  const design = obj(p.designModule);
  const desc = obj(p.descriptionModule);
  const cond = obj(p.conditionsModule);
  const elig = obj(p.eligibilityModule);
  const arms = obj(p.armsInterventionsModule);
  const outcomes = obj(p.outcomesModule);
  const refs = obj(p.referencesModule);
  const enrollment = obj(design.enrollmentInfo).count;
  const eligibility = [
    str(elig.minimumAge) && `Minimum age ${str(elig.minimumAge)}`,
    str(elig.maximumAge) && `maximum age ${str(elig.maximumAge)}`,
    str(elig.sex) && `sex: ${str(elig.sex)!.toLowerCase()}`,
    typeof elig.healthyVolunteers === "boolean" && (elig.healthyVolunteers ? "accepts healthy volunteers" : "no healthy volunteers"),
  ]
    .filter(Boolean)
    .join(", ");
  return {
    nct,
    title: str(id.officialTitle) ?? str(id.briefTitle) ?? nct,
    status: str(status.overallStatus) ?? "UNKNOWN",
    lastUpdatePostDate: str(obj(status.lastUpdatePostDateStruct).date),
    firstPostDate: str(obj(status.studyFirstPostDateStruct).date),
    hasResults: s.hasResults === true,
    studyType: str(design.studyType),
    phases: arr(design.phases).map(str).filter((x): x is string => !!x),
    enrollment: typeof enrollment === "number" ? enrollment : null,
    conditions: arr(cond.conditions).map(str).filter((x): x is string => !!x),
    interventions: arr(arms.interventions).map((i) => str(obj(i).name)).filter((x): x is string => !!x),
    summary: str(desc.briefSummary) ?? "",
    primaryOutcomes: arr(outcomes.primaryOutcomes).map((o) => str(obj(o).measure)).filter((x): x is string => !!x),
    eligibility,
    pmids: arr(refs.references).map((r) => str(obj(r).pmid)).filter((x): x is string => !!x && /^\d+$/.test(x)),
  };
}

/** Registry text sent onward (to a reviewer, or truncated to the AI). Not a study result. */
export function trialText(t: TrialRecord): string {
  return [
    `Registry record ${t.nct} (ClinicalTrials.gov). This is a trial registration, not a published result.`,
    `Title: ${t.title}`,
    `Status: ${t.status}${t.hasResults ? " (results posted on the registry)" : ""}`,
    `Study type: ${t.studyType ?? "not reported"}${t.phases.length ? `; phase: ${t.phases.join(", ")}` : ""}`,
    `Enrollment: ${t.enrollment ?? "not reported"}`,
    `Conditions: ${t.conditions.join("; ") || "not reported"}`,
    `Interventions: ${t.interventions.join("; ") || "not reported"}`,
    `Eligibility: ${t.eligibility || "not reported"}`,
    `Primary outcomes: ${t.primaryOutcomes.join("; ") || "not reported"}`,
    `Summary: ${t.summary || "not reported"}`,
  ].join("\n");
}
