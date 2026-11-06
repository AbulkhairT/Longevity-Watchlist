import { describe, expect, it } from "vitest";
import { approveClaim, claimHash, hashApprovalCheck, updateHash } from "@/lib/approval";
import { selectPublishable } from "@/lib/content";
import { Claim } from "@/lib/schema";
import { fixtureClaim, publishedRaw, testEvidence } from "./helpers";

describe("approval and content hashes", () => {
  it("approved content passes the publication check", () => {
    const raw = publishedRaw();
    const out = selectPublishable(raw, hashApprovalCheck(raw.evidence));
    expect(out.claims).toHaveLength(3);
    expect(out.skipped).toEqual([]);
    for (const c of out.claims) expect(Claim.safeParse(c).success).toBe(true);
  });

  it("voids approval when the assessment changes afterwards", () => {
    const raw = publishedRaw();
    const edited = { ...raw.claims[0]!, assessment: { ...raw.claims[0]!.assessment, summary: "Edited after approval." } };
    const out = selectPublishable({ ...raw, claims: [edited] }, hashApprovalCheck(raw.evidence));
    expect(out.claims).toHaveLength(0);
    expect(out.skipped[0]!.reason).toMatch(/approval void/);
  });

  it("voids approval when an update's reasoning changes afterwards", () => {
    const raw = publishedRaw();
    const c = raw.claims[0]!;
    const updates = c.updates.map((u, i) => (i === 1 ? { ...u, reasoning: "Rewritten." } : u));
    const out = selectPublishable({ ...raw, claims: [{ ...c, updates }] }, hashApprovalCheck(raw.evidence));
    expect(out.claims).toHaveLength(0);
  });

  it("voids approval when a cited source record changes afterwards", () => {
    const raw = publishedRaw();
    const changed = { ...testEvidence(), findings: "Different findings." };
    const out = selectPublishable({ ...raw, evidence: [changed] }, hashApprovalCheck([changed]));
    expect(out.claims.map((c) => c.id)).not.toContain("alpha-claim");
  });

  it("ignores key order (canonical hashing)", () => {
    const c = publishedRaw().claims[1]!;
    const reverse = (v: unknown): unknown =>
      Array.isArray(v)
        ? v.map(reverse)
        : v && typeof v === "object"
          ? Object.fromEntries(Object.entries(v).reverse().map(([k, x]) => [k, reverse(x)]))
          : v;
    const reordered = reverse(c) as Claim;
    expect(Object.keys(reordered)[0]).not.toBe(Object.keys(c)[0]);
    expect(claimHash(reordered, [])).toBe(claimHash(c, []));
  });

  it("re-approval keeps earlier valid update approvals", () => {
    const raw = publishedRaw();
    const c = raw.claims[0]!;
    const again = approveClaim(c, raw.evidence, { reviewer: { name: "Second" }, reviewedAt: "2026-12-01", reasoning: "Recheck." });
    expect(again.updates[1]!.review).toEqual(c.updates[1]!.review);
    expect(again.updates[1]!.review.status === "approved" && again.updates[1]!.review.contentHash).toBe(updateHash(c.updates[1]!));
  });

  it("refuses to approve fixtures or approve without a reviewer", () => {
    expect(() => approveClaim(fixtureClaim(), [], { reviewer: { name: "X" }, reviewedAt: "2026-01-01", reasoning: "y" })).toThrow();
    const c = publishedRaw().claims[1]!;
    expect(() => approveClaim(c, [], { reviewer: { name: " " }, reviewedAt: "2026-01-01", reasoning: "y" })).toThrow();
  });
});
