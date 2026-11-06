/**
 * Validates every content file (published and fixtures) against the schemas and
 * reports what a published build would include. Exits non-zero on any error.
 *
 *   npm run validate
 */
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
  const { claims, skipped } = selectPublishable(raw);
  console.log(
    `content/: ${raw.claims.length} claims, ${raw.evidence.length} evidence records; ${claims.length} publishable`,
  );
  for (const s of skipped) console.log(`  not published: ${s.id} (${s.reason})`);
} catch (err) {
  failed = true;
  console.error(`content/: ${(err as Error).message}`);
}
process.exit(failed ? 1 : 0);
