import { describe, expect, it } from "vitest";
import { ContentError, FIXTURES_DIR, readContentDir, resolveMode, selectPublishable } from "@/lib/content";
import { fixtureClaim, realClaim } from "./helpers";

const iv = { schemaVersion: 1 as const, id: "creatine", name: "Creatine", order: 0, summary: "x", aliases: [], fixture: false };

describe("publication guards", () => {
  it("defaults to published mode", () => {
    expect(resolveMode({})).toBe("published");
  });

  it("refuses fixtures on a production deployment", () => {
    expect(() => resolveMode({ LW_CONTENT_MODE: "fixtures", VERCEL_ENV: "production" })).toThrow(ContentError);
    expect(() => resolveMode({ LW_CONTENT_MODE: "fixtures", LW_DEPLOY_ENV: "production" })).toThrow(ContentError);
    expect(resolveMode({ LW_CONTENT_MODE: "fixtures", VERCEL_ENV: "preview" })).toBe("fixtures");
  });

  it("rejects unknown modes", () => {
    expect(() => resolveMode({ LW_CONTENT_MODE: "drafts" })).toThrow(ContentError);
  });

  it("throws if a fixture lands in published content", () => {
    expect(() => selectPublishable({ interventions: [iv], claims: [fixtureClaim()], evidence: [] })).toThrow(/Fixture/);
    expect(() =>
      selectPublishable({ interventions: [{ ...iv, fixture: true }], claims: [], evidence: [] }),
    ).toThrow(/Fixture/);
  });

  it("does not publish unreviewed claims or claims with unreviewed updates", () => {
    const unreviewed = realClaim({ id: "a", review: { status: "unreviewed" } });
    const approved = realClaim({ id: "b" });
    const pendingUpdate = realClaim({
      id: "c",
      updates: realClaim().updates.map((u, i, all) => (i === all.length - 1 ? { ...u, review: { status: "unreviewed" as const } } : u)),
    });
    const out = selectPublishable({ interventions: [iv], claims: [unreviewed, approved, pendingUpdate], evidence: [] });
    expect(out.claims.map((c) => c.id)).toEqual(["b"]);
    expect(out.skipped.map((s) => s.id).sort()).toEqual(["a", "c"]);
  });

  it("fails on citations to missing evidence", () => {
    const c = realClaim({ assessment: { ...realClaim().assessment, evidenceIds: ["pmid-123"] } });
    expect(() => selectPublishable({ interventions: [iv], claims: [c], evidence: [] })).toThrow(/missing evidence/);
  });

  it("keeps fixtures/ fixture-only", () => {
    const raw = readContentDir(FIXTURES_DIR);
    expect(raw.claims).toHaveLength(12);
    expect(raw.interventions).toHaveLength(6);
    expect([...raw.claims, ...raw.interventions].every((r) => r.fixture)).toBe(true);
  });
});
