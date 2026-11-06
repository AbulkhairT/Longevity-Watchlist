/**
 * Approve a reviewed claim for publication. Run by a person, never by CI.
 *
 *   npm run approve -- <claim-id> --reviewer "Full Name" --reason "Why this is right" [--github handle] [--date YYYY-MM-DD] [--yes]
 *   (--reasoning is accepted as a synonym for --reason)
 *
 * Takes the edited draft from drafts/claims/<id>.json (or, for a re-approval,
 * the edited file in content/claims/<id>.json), validates it, records the
 * reviewer, date, reasoning and a content hash, and writes it to content/.
 * Cited evidence records from drafts/evidence/ are moved into content/evidence/.
 * Any later change to the approved content voids the approval.
 */
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import { parseArgs } from "node:util";
import { z } from "zod";
import { approveClaim, citedEvidenceIds } from "../src/lib/approval";
import { PUBLISHED_DIR, readContentDir } from "../src/lib/content";
import { Claim, EvidenceRecord } from "../src/lib/schema";

const DRAFTS_DIR = path.join(process.cwd(), "drafts");

function fail(msg: string): never {
  console.error(`approve: ${msg}`);
  process.exit(1);
}

function readJson<T>(file: string, schema: z.ZodType<T>): T {
  const parsed = schema.safeParse(JSON.parse(fs.readFileSync(file, "utf8")));
  if (!parsed.success) fail(`${path.relative(process.cwd(), file)} is invalid:\n${z.prettifyError(parsed.error)}`);
  return parsed.data;
}

async function main() {
  if (process.env.CI || process.env.GITHUB_ACTIONS) {
    fail("approvals must be made by a person, not in CI or GitHub Actions");
  }
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      reviewer: { type: "string" },
      github: { type: "string" },
      reason: { type: "string" },
      reasoning: { type: "string" },
      date: { type: "string" },
      yes: { type: "boolean", default: false },
      "dry-run": { type: "boolean", default: false },
    },
  });
  const id = positionals[0];
  if (!id) fail("usage: npm run approve -- <claim-id> --reviewer \"Name\" --reason \"...\"");
  if (!values.reviewer?.trim()) fail("--reviewer is required (your own name)");
  const reason = (values.reason ?? values.reasoning)?.trim();
  if (!reason) fail("--reason is required (why the assessment and changes are correct)");
  const date = values.date ?? new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) fail("--date must be YYYY-MM-DD");

  const draftFile = path.join(DRAFTS_DIR, "claims", `${id}.json`);
  const publishedFile = path.join(PUBLISHED_DIR, "claims", `${id}.json`);
  const source = fs.existsSync(draftFile) ? draftFile : fs.existsSync(publishedFile) ? publishedFile : null;
  if (!source) fail(`no draft or published claim named "${id}"`);
  const claim = readJson(source, Claim);
  if (claim.fixture || claim.illustrative) fail("fixtures and illustrative content cannot be approved");

  const published = readContentDir(PUBLISHED_DIR);
  const evidence = new Map(published.evidence.map((e) => [e.id, e]));
  const fromDrafts: string[] = [];
  for (const eid of citedEvidenceIds(claim)) {
    const draftEvidence = path.join(DRAFTS_DIR, "evidence", `${eid}.json`);
    if (fs.existsSync(draftEvidence)) {
      evidence.set(eid, readJson(draftEvidence, EvidenceRecord));
      fromDrafts.push(draftEvidence);
    } else if (!evidence.has(eid)) {
      fail(`claim cites evidence "${eid}", which is in neither drafts/evidence nor content/evidence`);
    }
  }
  if (!published.interventions.some((i) => i.id === claim.interventionId)) {
    const draftIv = path.join(DRAFTS_DIR, "interventions", `${claim.interventionId}.json`);
    if (!fs.existsSync(draftIv)) fail(`intervention "${claim.interventionId}" is not in content/interventions or drafts/interventions`);
    fromDrafts.push(draftIv);
  }

  const approved = approveClaim(claim, [...evidence.values()], {
    reviewer: { name: values.reviewer.trim(), ...(values.github ? { github: values.github.trim() } : {}) },
    reviewedAt: date,
    reasoning: reason,
  });
  const parsed = Claim.safeParse(approved);
  if (!parsed.success) fail(`approved claim failed validation:\n${z.prettifyError(parsed.error)}`);

  const newlyApproved = approved.updates.filter((u, i) => u !== claim.updates[i]);
  console.log(`Claim: ${claim.id} (${claim.title})`);
  console.log(`Grade: ${claim.assessment.confidence} confidence, ${claim.assessment.finding}, ${claim.assessment.evidenceBase} evidence`);
  console.log(`Updates approved now: ${newlyApproved.map((u) => u.id).join(", ") || "none"}`);
  console.log(`Evidence records cited: ${citedEvidenceIds(claim).length}. Files moving from drafts/: ${fromDrafts.length}`);
  console.log(`Reviewer: ${values.reviewer} · ${date}`);
  console.log(`Hash: ${approved.review.status === "approved" ? approved.review.contentHash : ""}`);
  if (values["dry-run"]) return;

  if (!values.yes) {
    if (!process.stdin.isTTY) fail("confirm interactively, or pass --yes after reading the summary");
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await rl.question("I have read the sources and approve this content for publication [y/N] ");
    rl.close();
    if (answer.trim().toLowerCase() !== "y") fail("not approved");
  }

  for (const file of fromDrafts) {
    const kind = path.basename(path.dirname(file));
    const dest = path.join(PUBLISHED_DIR, kind, path.basename(file));
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.renameSync(file, dest);
  }
  fs.mkdirSync(path.dirname(publishedFile), { recursive: true });
  fs.writeFileSync(publishedFile, `${JSON.stringify(approved, null, 2)}\n`);
  if (source === draftFile) fs.rmSync(draftFile);
  console.log(`Approved. Wrote ${path.relative(process.cwd(), publishedFile)}. Commit it and open a pull request.`);
}

main().catch((err) => fail((err as Error).message));
