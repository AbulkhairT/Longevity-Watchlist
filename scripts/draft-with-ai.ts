/**
 * AI drafting step of the scheduled workflow. Off unless BOTH:
 *   - repository variable ZAI_DRAFTING_ENABLED is "true", and
 *   - config/pipeline.json records the human free-tier check.
 * With either off, this prints why and exits 0: collection-only (manual) mode.
 *
 *   npm run draft:ai
 *
 * Reads drafts/candidates/, writes drafts/ai/ (valid suggestions) and
 * drafts/rejected/ (invalid replies with the reason). Adds usage counts to the
 * run's monitoring file. Prints counts only: never the key, prompts or replies.
 */
import fs from "node:fs";
import { hashApprovalCheck } from "../src/lib/approval";
import { FIXTURES_DIR, PUBLISHED_DIR, readContentDir, selectPublishable } from "../src/lib/content";
import { confidenceLabel, findingLabel } from "../src/lib/labels";
import { MONITORING_DIR, runFile, updateRun } from "../src/lib/monitoring";
import { loadPipelineConfig } from "../src/lib/pipeline-config";
import { runAiDrafting } from "../src/pipeline/ai-run";
import type { ClaimContext } from "../src/pipeline/draft";
import { AI_DIR, CANDIDATES_DIR, LATEST_RUN_FILE, REJECTED_DIR } from "../src/pipeline/paths";
import { loadSearchConfig } from "../src/pipeline/types";

async function main() {
  const cfg = loadPipelineConfig();
  const runId = fs.existsSync(LATEST_RUN_FILE) ? fs.readFileSync(LATEST_RUN_FILE, "utf8").trim() : `ai-${new Date().toISOString().replace(/\.\d+Z$/, "Z").replace(/:/g, "-")}`;

  // Claim context: titles (fixture titles are names only), and grades only from approved content.
  const raw = readContentDir(PUBLISHED_DIR);
  const published = selectPublishable(raw, hashApprovalCheck(raw.evidence)).claims;
  const fixtureTitles = new Map(readContentDir(FIXTURES_DIR).claims.map((c) => [c.id, c.title]));
  const ivNames = new Map([...readContentDir(FIXTURES_DIR).interventions, ...raw.interventions].map((i) => [i.id, i.name]));
  const claims = new Map<string, ClaimContext>();
  for (const s of loadSearchConfig().searches) {
    const pub = published.find((c) => c.id === s.claimId);
    claims.set(s.claimId, {
      id: s.claimId,
      title: pub?.title ?? fixtureTitles.get(s.claimId) ?? s.claimId,
      intervention: ivNames.get(s.interventionId) ?? s.interventionId,
      publishedGrade: pub ? `${confidenceLabel(pub.assessment.confidence)} confidence, ${findingLabel(pub.assessment.finding, pub.assessment.evidenceBase).toLowerCase()}` : null,
    });
  }

  const r = await runAiDrafting({
    cfg,
    env: process.env,
    dirs: { candidates: CANDIDATES_DIR, ai: AI_DIR, rejected: REJECTED_DIR },
    runId,
    claims,
  });

  console.log(`AI drafting: ${r.enabled ? "on" : "off"} · model ${cfg.ai.model}`);
  console.log(`Candidates waiting ${r.waiting}, sent ${r.candidatesSent}, drafted ${r.drafted}, rejected ${r.rejected}`);
  console.log(`Requests ${r.requests} · tokens prompt ${r.promptTokens}, completion ${r.completionTokens}`);
  if (r.stopReason) console.log(`Stopped: ${r.stopReason}`);

  if (fs.existsSync(runFile(runId, MONITORING_DIR))) {
    updateRun(runId, (run) => ({
      ...run,
      notes: r.stopReason ? [...run.notes, `AI: ${r.stopReason}`] : run.notes,
      usage: {
        ...(run.usage ?? {
          pubmedRequests: 0,
          clinicaltrialsRequests: 0,
          transientRetries: 0,
          candidatesNew: 0,
          candidatesRevised: 0,
        }),
        aiEnabled: r.enabled,
        aiCandidatesSent: r.candidatesSent,
        aiRequests: r.requests,
        aiPromptTokens: r.promptTokens,
        aiCompletionTokens: r.completionTokens,
        aiDrafted: r.drafted,
        aiRejected: r.rejected,
        aiStopReason: r.stopReason,
      },
    }));
  }
}

main().catch(() => {
  console.error("AI drafting failed with an unexpected error (details withheld). Candidates are kept for manual preparation.");
  process.exit(0); // never fail the collection PR because of the optional AI step
});
