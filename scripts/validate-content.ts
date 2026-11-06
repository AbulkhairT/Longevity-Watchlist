/**
 * Validates every content file (published and fixtures) against the schemas and
 * reports what a published build would include. Exits non-zero on any error.
 *
 *   npm run validate
 */
import { hashApprovalCheck } from "../src/lib/approval";
import { loadDigestConfig } from "../src/lib/digest-config";
import { FIXTURE_MONITORING_DIR, MONITORING_DIR, readRuns } from "../src/lib/monitoring";
import { loadPipelineConfig } from "../src/lib/pipeline-config";
import { FIXTURES_DIR, PUBLISHED_DIR, readContentDir, selectPublishable } from "../src/lib/content";

let failed = false;
try {
  const fixtures = readContentDir(FIXTURES_DIR);
  const bad = [...fixtures.interventions, ...fixtures.claims].filter((r) => !r.fixture);
  if (bad.length) throw new Error(`fixtures/ contains non-fixture records: ${bad.map((r) => r.id).join(", ")}`);
  console.log(`fixtures/: ${fixtures.interventions.length} interventions, ${fixtures.claims.length} claims (never published)`);
} catch (err) {
  failed = true;
  console.error(`fixtures/: ${(err as Error).message}`);
}
try {
  const raw = readContentDir(PUBLISHED_DIR);
  const { claims, skipped } = selectPublishable(raw, hashApprovalCheck(raw.evidence));
  console.log(
    `content/: ${raw.claims.length} claims, ${raw.evidence.length} evidence records; ${claims.length} publishable`,
  );
  for (const s of skipped) {
    console.log(`  not published: ${s.id} (${s.reason})`);
    // Approved content that changed afterwards must be re-approved or reverted.
    if (s.reason.startsWith("approval void")) failed = true;
  }
} catch (err) {
  failed = true;
  console.error(`content/: ${(err as Error).message}`);
}
try {
  loadPipelineConfig();
  loadDigestConfig();
  const runs = readRuns(MONITORING_DIR);
  if (runs.some((r) => r.fixture)) throw new Error("drafts/monitoring/runs contains fixture runs");
  readRuns(FIXTURE_MONITORING_DIR);
  console.log(`config/: valid. drafts/monitoring/runs/: ${runs.length} recorded runs`);
} catch (err) {
  failed = true;
  console.error(`config or monitoring: ${(err as Error).message}`);
}
process.exit(failed ? 1 : 0);
