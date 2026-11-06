/**
 * Weekly research collection (PubMed + ClinicalTrials.gov). Runs in GitHub
 * Actions; also runnable locally. Never calls any AI.
 *
 *   npm run collect                                  # full run: writes drafts/
 *   npm run collect -- --dry-run --claim creatine-strength [--max 3]
 *                                                    # fetch a few real records, print, write nothing
 *
 * Environment: NCBI_TOOL, NCBI_EMAIL (required for full runs), NCBI_API_KEY (optional).
 *
 * Writes (full run only), all under drafts/:
 *   candidates/<id>.json          new or materially revised records, with retrieval and revision dates
 *   checkpoints.json              every record already handled, so it is not collected again
 *   monitoring/runs/<runId>.json  per-intervention counts for this run
 *   runs/latest-run-id            the run ID, for the AI drafting and PR-summary steps
 */
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { hashApprovalCheck } from "../src/lib/approval";
import { PUBLISHED_DIR, readContentDir, selectPublishable } from "../src/lib/content";
import { MonitoringRun, publishedSince, readRuns, recordRun, ZERO } from "../src/lib/monitoring";
import { loadPipelineConfig } from "../src/lib/pipeline-config";
import { collect, doiKey, nctKey, pmidKey } from "../src/pipeline/collect";
import { createHttp } from "../src/pipeline/http";
import { CANDIDATES_DIR, CHECKPOINT_FILE, LATEST_RUN_FILE, MONITORING_RUNS_DIR } from "../src/pipeline/paths";
import { pubmedIntervalMs } from "../src/pipeline/pubmed";
import { Candidate, Checkpoint, EMPTY_CHECKPOINT, loadSearchConfig } from "../src/pipeline/types";

const CANDIDATES = CANDIDATES_DIR;
const CHECKPOINT = CHECKPOINT_FILE;
const LATEST_RUN = LATEST_RUN_FILE;

function readCheckpoint(): Checkpoint {
  if (!fs.existsSync(CHECKPOINT)) return EMPTY_CHECKPOINT;
  return Checkpoint.parse(JSON.parse(fs.readFileSync(CHECKPOINT, "utf8")));
}

async function main() {
  const { values } = parseArgs({
    options: {
      "dry-run": { type: "boolean", default: false },
      claim: { type: "string" },
      max: { type: "string" },
    },
  });
  const dry = values["dry-run"];
  const cfg = loadPipelineConfig();
  const searchCfg = loadSearchConfig();
  let searches = searchCfg.searches;
  if (values.claim) {
    searches = searches.filter((s) => s.claimId === values.claim);
    if (!searches.length) throw new Error(`No search configured for claim "${values.claim}"`);
  }
  const tool = process.env.NCBI_TOOL?.trim() || (dry ? "longevity-watchlist-dry-run" : "");
  const email = process.env.NCBI_EMAIL?.trim() || "";
  if (!dry && (!tool || !email)) throw new Error("Set NCBI_TOOL and NCBI_EMAIL (repository variables) for full runs.");
  const apiKey = process.env.NCBI_API_KEY?.trim() || undefined;

  const now = () => new Date();
  const runId = now().toISOString().replace(/\.\d+Z$/, "Z").replace(/:/g, "-");
  const timeoutMs = cfg.collection.requestTimeoutSeconds * 1000;
  const pubmed = createHttp({
    label: "PubMed",
    timeoutMs,
    maxRetries: cfg.collection.maxTransientRetries,
    minIntervalMs: pubmedIntervalMs(cfg.collection.pubmed, !!apiKey),
    maxRequests: cfg.collection.pubmed.maxRequestsPerRun,
  });
  const ctgov = createHttp({
    label: "ClinicalTrials.gov",
    timeoutMs,
    maxRetries: cfg.collection.maxTransientRetries,
    minIntervalMs: cfg.collection.clinicaltrials.minSecondsBetweenRequests * 1000,
    maxRequests: cfg.collection.clinicaltrials.maxRequestsPerRun,
  });

  // Evidence already published counts as seen.
  const raw = readContentDir(PUBLISHED_DIR);
  const known = new Set<string>();
  for (const e of raw.evidence) {
    if (e.identifiers.pmid) known.add(pmidKey(e.identifiers.pmid));
    if (e.identifiers.doi) known.add(doiKey(e.identifiers.doi));
    if (e.identifiers.nct) known.add(nctKey(e.identifiers.nct));
  }

  const startedAt = now().toISOString();
  const limit = values.max ? Math.max(1, Math.min(10, Number(values.max) || 3)) : dry ? 3 : undefined;
  const result = await collect(
    { pubmed, ctgov, identity: { tool, email, ...(apiKey ? { apiKey } : {}) }, cfg: cfg.collection, now, runId },
    { searches, checkpoint: dry ? EMPTY_CHECKPOINT : readCheckpoint(), known, ...(limit ? { limitPerSearch: limit } : {}) },
  );
  const finishedAt = now().toISOString();

  console.log(`${dry ? "DRY RUN (nothing written)" : "Collection run"} ${runId}`);
  console.log(`Requests: PubMed ${pubmed.requests}, ClinicalTrials.gov ${ctgov.requests}, transient retries ${pubmed.retries + ctgov.retries}`);
  for (const [iv, c] of Object.entries(result.counts)) {
    console.log(
      `  ${iv}: ${c.papersScreened} papers screened, ${c.trialRecordsChecked} trial records checked, ${c.candidatesFound} found, ` +
        `${c.rejectedDuplicate} duplicate, ${c.rejectedIrrelevant} off-topic`,
    );
  }
  console.log(`Candidates: ${result.candidatesNew} new, ${result.candidatesRevised} revised trials`);
  for (const n of result.notes) console.log(`Note: ${n}`);

  if (dry) {
    for (const r of result.screened.pubmed) {
      console.log(`\n[PubMed] PMID ${r.pmid}${r.doi ? ` · DOI ${r.doi}` : ""} · published ${r.publishedDate ?? "?"} · revised ${r.revisedDate ?? "?"}`);
      console.log(`  ${r.title}`);
      console.log(`  Types: ${r.publicationTypes.join(", ")} · abstract ${r.abstract ? `${r.abstract.length} chars` : "none"}${r.trialIds.length ? ` · trials ${r.trialIds.join(", ")}` : ""}`);
    }
    for (const t of result.screened.trials) {
      console.log(`\n[Registry] ${t.nct} · ${t.status} · last update posted ${t.lastUpdatePostDate ?? "?"} · results ${t.hasResults ? "yes" : "no"}`);
      console.log(`  ${t.title}`);
      console.log(`  ${t.studyType ?? "?"}${t.phases.length ? ` ${t.phases.join("/")}` : ""} · enrollment ${t.enrollment ?? "?"}${t.pmids.length ? ` · PMIDs ${t.pmids.join(", ")}` : ""}`);
    }
    return;
  }

  fs.mkdirSync(CANDIDATES, { recursive: true });
  for (const cand of result.candidates) {
    fs.writeFileSync(path.join(CANDIDATES, `${cand.id}.json`), `${JSON.stringify(Candidate.parse(cand), null, 2)}\n`);
  }
  fs.writeFileSync(CHECKPOINT, `${JSON.stringify(Checkpoint.parse(result.checkpoint), null, 2)}\n`);

  // Published updates and grade changes since the previous run, counted from approved content.
  const previous = readRuns(MONITORING_RUNS_DIR).filter((r) => !r.fixture).pop();
  const since = previous ? previous.finishedAt.slice(0, 10) : "0000-01-01";
  const pub = selectPublishable(raw, hashApprovalCheck(raw.evidence));
  const published = publishedSince(pub.claims, since, "9999-12-31");
  const interventions: MonitoringRun["interventions"] = {};
  for (const s of searchCfg.searches) interventions[s.interventionId] ??= { ...ZERO };
  for (const [iv, c] of Object.entries(result.counts)) interventions[iv] = { ...c };
  for (const [iv, p] of published) interventions[iv] = { ...(interventions[iv] ?? ZERO), ...p };

  const file = recordRun({
    schemaVersion: 1,
    runId,
    fixture: false,
    startedAt,
    finishedAt,
    producedBy: "collection-pipeline",
    notes: result.notes,
    usage: {
      pubmedRequests: pubmed.requests,
      clinicaltrialsRequests: ctgov.requests,
      transientRetries: pubmed.retries + ctgov.retries,
      candidatesNew: result.candidatesNew,
      candidatesRevised: result.candidatesRevised,
      aiEnabled: false,
      aiCandidatesSent: 0,
      aiRequests: 0,
      aiPromptTokens: 0,
      aiCompletionTokens: 0,
      aiDrafted: 0,
      aiRejected: 0,
      aiStopReason: null,
    },
    interventions,
  });
  fs.mkdirSync(path.dirname(LATEST_RUN), { recursive: true });
  fs.writeFileSync(LATEST_RUN, `${runId}\n`);
  console.log(`Wrote ${result.candidates.length} candidates, checkpoint, and ${path.relative(process.cwd(), file)}`);
}

main().catch((err) => {
  // Messages from our own code only; never response bodies or query strings.
  console.error(`collect failed: ${(err as Error).message}`);
  process.exit(1);
});
