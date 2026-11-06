import type { PipelineConfig } from "../lib/pipeline-config";
import type { InterventionCounts } from "../lib/monitoring";
import { trialText, searchStudies } from "./ctgov";
import { CapReachedError, HttpError, type HttpClient } from "./http";
import { efetch, esearch, NON_EVIDENCE_TYPES, type NcbiIdentity } from "./pubmed";
import type { Candidate, Checkpoint, ClaimSearch, PubmedRecord, TrialRecord } from "./types";

/**
 * One collection run over every claim search.
 *
 * Counting rules (per intervention), all from what this run actually saw:
 *   papersScreened       PMIDs returned by PubMed searches
 *   trialRecordsChecked  registry records returned by ClinicalTrials.gov searches
 *   candidatesFound      records new to us (not in checkpoints or published evidence),
 *                        plus trial records with a material revision
 *   rejectedDuplicate    of those, duplicates by DOI or already found this run
 *   rejectedIrrelevant   of those, non-evidence publication types (comments, editorials, news...)
 * Records seen in earlier runs are screened but not "found" again. A trial whose
 * registry date changed without a status or results change is recorded in the
 * checkpoint quietly, not raised as a candidate.
 */

export interface CollectDeps {
  pubmed: HttpClient;
  ctgov: HttpClient;
  identity: NcbiIdentity;
  cfg: PipelineConfig["collection"];
  now: () => Date;
  runId: string;
}

export interface CollectInput {
  searches: readonly ClaimSearch[];
  checkpoint: Checkpoint;
  /** Checkpoint-style keys (pmid:, doi:, nct:) of evidence already in content/. */
  known: ReadonlySet<string>;
  /** Limit PubMed and registry results per search (dry runs). */
  limitPerSearch?: number;
}

export interface CollectResult {
  candidates: Candidate[];
  checkpoint: Checkpoint;
  counts: Record<string, InterventionCounts>;
  notes: string[];
  candidatesNew: number;
  candidatesRevised: number;
  screened: { pubmed: PubmedRecord[]; trials: TrialRecord[] };
}

const zero = (): InterventionCounts => ({
  papersScreened: 0,
  trialRecordsChecked: 0,
  candidatesFound: 0,
  rejectedIrrelevant: 0,
  rejectedDuplicate: 0,
  updatesPublished: 0,
  gradeChanges: 0,
});

export const pmidKey = (id: string) => `pmid:${id}`;
export const doiKey = (doi: string) => `doi:${doi.trim().toLowerCase()}`;
export const nctKey = (nct: string) => `nct:${nct.toUpperCase()}`;

function pubmedText(r: PubmedRecord): string {
  return [
    `PubMed record PMID ${r.pmid}.`,
    `Title: ${r.title}`,
    `Journal: ${r.journal ?? "not reported"}`,
    `Publication types: ${r.publicationTypes.join("; ") || "not reported"}`,
    r.abstract ? `Abstract:\n${r.abstract}` : "Abstract: not available in PubMed.",
  ].join("\n");
}

export async function collect(deps: CollectDeps, input: CollectInput): Promise<CollectResult> {
  const today = deps.now().toISOString().slice(0, 10);
  const retrievedAt = deps.now().toISOString();
  const records = { ...input.checkpoint.records };
  const seen = (key: string) => key in records || input.known.has(key);
  const mark = (key: string, extra: Partial<Checkpoint["records"][string]> = {}) => {
    records[key] = { ...(records[key] ?? { firstSeen: today, runId: deps.runId }), ...extra };
  };
  const counts: Record<string, InterventionCounts> = {};
  const c = (iv: string) => (counts[iv] ??= zero());
  const notes: string[] = [];
  const byId = new Map<string, Candidate>();
  const ivFound = new Map<string, Set<string>>(); // candidate id -> interventions it was counted for
  let pubmedStopped = false;
  let ctStopped = false;
  let candidatesNew = 0;
  let candidatesRevised = 0;
  let capHit = false;
  const screened: CollectResult["screened"] = { pubmed: [], trials: [] };

  const underCap = () => {
    if (candidatesNew + candidatesRevised < deps.cfg.maxNewCandidatesPerRun) return true;
    if (!capHit) notes.push(`Candidate cap of ${deps.cfg.maxNewCandidatesPerRun} reached; remaining records wait for the next run.`);
    capHit = true;
    return false;
  };

  const attach = (cand: Candidate, s: ClaimSearch): "new" | "same-intervention" | "other-intervention" => {
    const existing = byId.get(cand.id);
    if (!existing) {
      byId.set(cand.id, cand);
      ivFound.set(cand.id, new Set([s.interventionId]));
      return "new";
    }
    if (!existing.claimIds.includes(s.claimId)) existing.claimIds.push(s.claimId);
    if (!existing.interventionIds.includes(s.interventionId)) existing.interventionIds.push(s.interventionId);
    const ivs = ivFound.get(cand.id)!;
    if (ivs.has(s.interventionId)) return "same-intervention";
    ivs.add(s.interventionId);
    return "other-intervention";
  };

  const stop = (source: "PubMed" | "ClinicalTrials.gov", err: unknown) => {
    if (err instanceof CapReachedError) notes.push(`${source} request cap reached; remaining searches wait for the next run.`);
    else if (err instanceof HttpError) notes.push(`${source} stopped for this run: ${err.message}`);
    else notes.push(`${source} stopped for this run after an unexpected error.`);
  };

  for (const s of input.searches) {
    // ----- PubMed -----
    if (s.pubmed && !pubmedStopped && !capHit) {
      try {
        const { ids } = await esearch(deps.pubmed, deps.cfg.pubmed, deps.identity, s.pubmed.term, input.limitPerSearch ?? deps.cfg.pubmed.maxResultsPerQuery);
        c(s.interventionId).papersScreened += ids.length;
        const fresh: string[] = [];
        for (const id of ids) {
          const cid = `pmid-${id}`;
          if (byId.has(cid)) {
            const r = attach(byId.get(cid)!, s);
            if (r === "same-intervention") c(s.interventionId).rejectedDuplicate++, c(s.interventionId).candidatesFound++;
            else if (r === "other-intervention") c(s.interventionId).candidatesFound++;
          } else if (!seen(pmidKey(id))) {
            fresh.push(id);
          }
        }
        const fetched = fresh.length ? await efetch(deps.pubmed, deps.cfg.pubmed, deps.identity, fresh) : [];
        screened.pubmed.push(...fetched);
        for (const r of fetched) {
          const counts = c(s.interventionId);
          counts.candidatesFound++;
          if (r.doi && seen(doiKey(r.doi))) {
            counts.rejectedDuplicate++;
            mark(pmidKey(r.pmid));
            continue;
          }
          if (r.publicationTypes.length && r.publicationTypes.every((t) => NON_EVIDENCE_TYPES.has(t))) {
            counts.rejectedIrrelevant++;
            mark(pmidKey(r.pmid));
            continue;
          }
          if (!underCap()) {
            counts.candidatesFound--; // not processed; it will be found next run
            continue;
          }
          const cand: Candidate = {
            schemaVersion: 1,
            id: `pmid-${r.pmid}`,
            source: "pubmed",
            recordType: "study-result",
            claimIds: [s.claimId],
            interventionIds: [s.interventionId],
            identifiers: { pmid: r.pmid, ...(r.doi ? { doi: r.doi } : {}) },
            linkedTrialIds: r.trialIds,
            linkedPmids: [],
            title: r.title || `PMID ${r.pmid}`,
            url: `https://pubmed.ncbi.nlm.nih.gov/${r.pmid}/`,
            text: pubmedText(r),
            abstractAvailable: r.abstract.length > 0,
            publicationTypes: r.publicationTypes,
            publishedDate: r.publishedDate,
            sourceRevisionDate: r.revisedDate,
            trial: null,
            previous: null,
            retrievedAt,
            runId: deps.runId,
          };
          attach(cand, s);
          candidatesNew++;
          mark(pmidKey(r.pmid));
          if (r.doi) mark(doiKey(r.doi));
        }
      } catch (err) {
        pubmedStopped = true;
        stop("PubMed", err);
      }
    }

    // ----- ClinicalTrials.gov -----
    if (s.clinicaltrials && !ctStopped && !capHit) {
      try {
        const limit = input.limitPerSearch;
        const { studies } = await searchStudies(deps.ctgov, deps.cfg.clinicaltrials, s.clinicaltrials, {
          now: deps.now(),
          ...(limit ? { maxPages: 1, pageSize: limit } : {}),
        });
        screened.trials.push(...studies);
        const counts = c(s.interventionId);
        counts.trialRecordsChecked += studies.length;
        for (const t of studies) {
          const key = nctKey(t.nct);
          const cid = `nct-${t.nct.toLowerCase()}`;
          if (byId.has(cid)) {
            const r = attach(byId.get(cid)!, s);
            if (r === "same-intervention") counts.rejectedDuplicate++, counts.candidatesFound++;
            else if (r === "other-intervention") counts.candidatesFound++;
            continue;
          }
          const prev = records[key];
          let recordType: Candidate["recordType"];
          if (prev) {
            if ((prev.revision ?? null) === t.lastUpdatePostDate) continue; // unchanged
            const material = (prev.status ?? null) !== t.status || (prev.hasResults ?? null) !== t.hasResults;
            if (!material) {
              mark(key, { revision: t.lastUpdatePostDate, status: t.status, hasResults: t.hasResults });
              continue; // minor registry edit: recorded, not a candidate
            }
            recordType = "trial-status-change";
          } else if (input.known.has(key)) {
            // Already accepted as evidence: record a baseline so later revisions are detected.
            mark(key, { revision: t.lastUpdatePostDate, status: t.status, hasResults: t.hasResults });
            continue;
          } else {
            recordType = "trial-registration";
          }
          counts.candidatesFound++;
          if (!underCap()) {
            counts.candidatesFound--;
            continue;
          }
          const cand: Candidate = {
            schemaVersion: 1,
            id: cid,
            source: "clinicaltrials.gov",
            recordType,
            claimIds: [s.claimId],
            interventionIds: [s.interventionId],
            identifiers: { nct: t.nct },
            linkedTrialIds: [],
            linkedPmids: t.pmids,
            title: t.title,
            url: `https://clinicaltrials.gov/study/${t.nct}`,
            text: trialText(t),
            abstractAvailable: false,
            publicationTypes: [],
            publishedDate: t.firstPostDate,
            sourceRevisionDate: t.lastUpdatePostDate,
            trial: {
              status: t.status,
              hasResults: t.hasResults,
              studyType: t.studyType,
              phases: t.phases,
              enrollment: t.enrollment,
              conditions: t.conditions,
            },
            previous: prev ? { status: prev.status ?? null, revisionDate: prev.revision ?? null, hasResults: prev.hasResults ?? null } : null,
            retrievedAt,
            runId: deps.runId,
          };
          attach(cand, s);
          if (recordType === "trial-status-change") candidatesRevised++;
          else candidatesNew++;
          mark(key, { revision: t.lastUpdatePostDate, status: t.status, hasResults: t.hasResults });
        }
      } catch (err) {
        ctStopped = true;
        stop("ClinicalTrials.gov", err);
      }
    }
  }

  // Link publications and registry records of the same trial.
  const candidates = [...byId.values()];
  const trialsByNct = new Map(candidates.filter((x) => x.identifiers.nct).map((x) => [x.identifiers.nct!, x]));
  for (const pub of candidates.filter((x) => x.identifiers.pmid)) {
    for (const nct of pub.linkedTrialIds) {
      const trial = trialsByNct.get(nct);
      if (trial && !trial.linkedPmids.includes(pub.identifiers.pmid!)) trial.linkedPmids.push(pub.identifiers.pmid!);
    }
  }
  const pubsByPmid = new Map(candidates.filter((x) => x.identifiers.pmid).map((x) => [x.identifiers.pmid!, x]));
  for (const trial of trialsByNct.values()) {
    for (const pmid of trial.linkedPmids) {
      const pub = pubsByPmid.get(pmid);
      if (pub && !pub.linkedTrialIds.includes(trial.identifiers.nct!)) pub.linkedTrialIds.push(trial.identifiers.nct!);
    }
  }

  return {
    candidates,
    checkpoint: { schemaVersion: 1, updatedAt: retrievedAt, records },
    counts,
    notes,
    candidatesNew,
    candidatesRevised,
    screened,
  };
}
