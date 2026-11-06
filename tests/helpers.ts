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
