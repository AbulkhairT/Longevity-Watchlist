import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const wf = (f: string) => fs.readFileSync(path.join(process.cwd(), ".github", "workflows", f), "utf8");

/** Split a workflow into its steps (text blocks starting at "- name:" or "- uses:"/"- run:"). */
function steps(y: string): string[] {
  return y.split(/\n(?=\s+- (?:name|uses|run):)/);
}

describe("collect workflow", () => {
  const y = wf("collect.yml");

  it("runs weekly and on manual dispatch only", () => {
    expect(y).toMatch(/schedule:\s*\n\s*- cron: "23 6 \* \* 1"/);
    expect(y).toMatch(/workflow_dispatch:/);
    expect(y).not.toMatch(/^\s*pull_request(_target)?:/m);
  });

  it("defaults to no permissions and grants write only to the job that opens the PR", () => {
    expect(y).toMatch(/^permissions: \{\}$/m);
    expect(y.match(/contents: write/g)).toHaveLength(1);
    expect(y.match(/pull-requests: write/g)).toHaveLength(1);
  });

  it("passes each secret only to the step that needs it", () => {
    const s = steps(y);
    const withZai = s.filter((x) => x.includes("secrets.ZAI_API_KEY"));
    expect(withZai).toHaveLength(1);
    expect(withZai[0]).toMatch(/if: vars.ZAI_DRAFTING_ENABLED == 'true'/);
    expect(withZai[0]).toMatch(/npm run --silent draft:ai/);
    const withNcbi = s.filter((x) => x.includes("secrets.NCBI_API_KEY"));
    expect(withNcbi).toHaveLength(1);
    expect(withNcbi[0]).toMatch(/npm run --silent collect/);
    for (const step of s.filter((x) => /pr:summary|gh pr|git push/.test(x))) expect(step).not.toMatch(/secrets\./);
  });

  it("refuses changes outside drafts/ and opens a draft PR", () => {
    expect(y).toMatch(/grep -v '\^\.\. drafts\/'/);
    expect(y).toMatch(/gh pr create --draft/);
  });
});

describe("smoke test workflow", () => {
  const y = wf("zai-smoke-test.yml");
  it("is manual-only with read-only permissions", () => {
    expect(y).toMatch(/on:\s*\n\s*workflow_dispatch:\s*\n\s*\n?permissions:\s*\n\s*contents: read/);
    expect(y).not.toMatch(/schedule|pull_request|write/);
  });
});
