import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { hashApprovalCheck } from "@/lib/approval";
import { readContentDir, selectPublishable } from "@/lib/content";
import { fixtureClaim, testIntervention } from "./helpers";

const REPO = process.cwd();
const TSX = path.join(REPO, "node_modules", ".bin", "tsx");
const dirs: string[] = [];

function sandbox(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lw-approve-"));
  dirs.push(dir);
  for (const d of ["drafts/claims", "drafts/interventions", "content/claims", "content/interventions", "content/evidence"]) {
    fs.mkdirSync(path.join(dir, d), { recursive: true });
  }
  fs.cpSync(path.join(REPO, "config"), path.join(dir, "config"), { recursive: true });
  const c = fixtureClaim("creatine-strength");
  const draft = {
    ...c,
    id: "alpha-claim",
    interventionId: "alpha",
    fixture: false,
    illustrative: false,
    updates: c.updates.map((u) => ({ ...u, id: "alpha-first", date: "2026-11-03" })),
  };
  fs.writeFileSync(path.join(dir, "drafts/claims/alpha-claim.json"), JSON.stringify(draft, null, 2));
  fs.writeFileSync(path.join(dir, "drafts/interventions/alpha.json"), JSON.stringify(testIntervention("alpha", 0), null, 2));
  return dir;
}

function run(cwd: string, script: string, args: string[], env: Record<string, string> = {}) {
  const clean = { ...process.env, CI: "", GITHUB_ACTIONS: "", ...env };
  return spawnSync(TSX, [path.join(REPO, "scripts", script), ...args], { cwd, env: clean, encoding: "utf8" });
}

function published(dir: string) {
  const raw = readContentDir(path.join(dir, "content"));
  return selectPublishable(raw, hashApprovalCheck(raw.evidence));
}

afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

describe("approve command", () => {
  it("merging a draft without approval publishes nothing", () => {
    const dir = sandbox();
    // A merged draft PR leaves files in drafts/ only; the site reads content/ only.
    expect(published(dir).claims).toHaveLength(0);
    // Even an unreviewed draft copied straight into content/ is not published.
    fs.copyFileSync(path.join(dir, "drafts/claims/alpha-claim.json"), path.join(dir, "content/claims/alpha-claim.json"));
    fs.copyFileSync(path.join(dir, "drafts/interventions/alpha.json"), path.join(dir, "content/interventions/alpha.json"));
    const out = published(dir);
    expect(out.claims).toHaveLength(0);
    expect(out.skipped[0]!.reason).toBe("not approved");
  });

  it("requires a reviewer and a reason, and refuses CI", () => {
    const dir = sandbox();
    expect(run(dir, "approve.ts", ["alpha-claim", "--reason", "x", "--yes"]).stderr).toMatch(/--reviewer is required/);
    expect(run(dir, "approve.ts", ["alpha-claim", "--reviewer", "A Person", "--yes"]).stderr).toMatch(/--reason is required/);
    const ci = run(dir, "approve.ts", ["alpha-claim", "--reviewer", "A Person", "--reason", "x", "--yes"], { GITHUB_ACTIONS: "true" });
    expect(ci.status).not.toBe(0);
    expect(ci.stderr).toMatch(/not in CI/);
    expect(published(dir).claims).toHaveLength(0);
  });

  it("approves an edited draft, then edited approved content fails until re-approved", () => {
    const dir = sandbox();
    const ok = run(dir, "approve.ts", ["alpha-claim", "--reviewer", "A Person", "--reason", "Read the sources", "--date", "2026-11-06", "--yes"]);
    expect(ok.status, ok.stderr).toBe(0);
    expect(fs.existsSync(path.join(dir, "drafts/claims/alpha-claim.json"))).toBe(false);
    const approved = JSON.parse(fs.readFileSync(path.join(dir, "content/claims/alpha-claim.json"), "utf8"));
    expect(approved.review).toMatchObject({ status: "approved", reviewer: { name: "A Person" }, reviewedAt: "2026-11-06", reasoning: "Read the sources" });
    expect(approved.review.contentHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(published(dir).claims).toHaveLength(1);
    expect(run(dir, "validate-content.ts", []).status).toBe(0);

    // Edit after approval: not published, validate fails.
    approved.assessment.plain = "Edited after approval.";
    fs.writeFileSync(path.join(dir, "content/claims/alpha-claim.json"), JSON.stringify(approved, null, 2));
    expect(published(dir).claims).toHaveLength(0);
    const v = run(dir, "validate-content.ts", []);
    expect(v.status).not.toBe(0);
    expect(v.stdout + v.stderr).toMatch(/approval void/);

    // Re-approval restores it.
    const again = run(dir, "approve.ts", ["alpha-claim", "--reviewer", "A Person", "--reason", "Re-checked wording", "--yes"]);
    expect(again.status, again.stderr).toBe(0);
    expect(published(dir).claims).toHaveLength(1);
  });
});
