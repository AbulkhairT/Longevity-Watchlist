import { describe, expect, it } from "vitest";
import { Claim } from "@/lib/schema";
import { findingLabel } from "@/lib/labels";
import { fixtureClaim, realClaim } from "./helpers";

describe("claim schema", () => {
  it("accepts every design fixture", () => {
    for (const id of ["creatine-cognition", "rapamycin-lifespan", "omega-3-atrial-fibrillation"]) {
      expect(Claim.safeParse(fixtureClaim(id)).success).toBe(true);
    }
  });

  it("rejects animal-only evidence graded as anything but insufficient", () => {
    const c = fixtureClaim("rapamycin-lifespan");
    const bad = { ...c, assessment: { ...c.assessment, finding: "supports-benefit" } };
    expect(Claim.safeParse(bad).success).toBe(false);
  });

  it("labels animal-only findings explicitly", () => {
    expect(findingLabel("insufficient", "animal")).toBe("Insufficient evidence (animal data only)");
    expect(findingLabel("insufficient", "human")).toBe("Insufficient evidence");
  });

  it("refuses approval metadata on fixtures", () => {
    const c = fixtureClaim();
    const bad = { ...c, review: realClaim().review };
    expect(Claim.safeParse(bad).success).toBe(false);
  });

  it("refuses citations or real dates on fixtures", () => {
    const c = fixtureClaim();
    expect(Claim.safeParse({ ...c, assessment: { ...c.assessment, evidenceIds: ["pmid-1"] } }).success).toBe(false);
    expect(Claim.safeParse({ ...c, updates: c.updates.map((u) => ({ ...u, date: "2026-01-01" })) }).success).toBe(false);
  });

  it("requires a change to keep the previous grade, consistent with history", () => {
    const c = fixtureClaim("creatine-cognition");
    const [first, change] = c.updates;
    expect(Claim.safeParse({ ...c, updates: [first, { ...change!, previous: null }] }).success).toBe(false);
    const wrongPrev = { ...change!, previous: { confidence: "high", finding: "mixed" } };
    expect(Claim.safeParse({ ...c, updates: [first, wrongPrev] }).success).toBe(false);
  });

  it("requires the latest update to match the current grade", () => {
    const c = fixtureClaim("creatine-cognition");
    expect(Claim.safeParse({ ...c, assessment: { ...c.assessment, confidence: "high" } }).success).toBe(false);
  });

  it("rejects a 'new evidence' update that silently moves the grade", () => {
    const c = fixtureClaim("creatine-cognition");
    const [first, change] = c.updates;
    expect(Claim.safeParse({ ...c, updates: [first, { ...change!, kind: "new-evidence" }] }).success).toBe(false);
  });
});
