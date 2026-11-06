import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MonitoringRun, publishedSince, readRuns, recordRun, weekTotals, FIXTURE_MONITORING_DIR } from "@/lib/monitoring";
import { PINNED_MODEL, PipelineConfig, aiDraftingAllowed, loadPipelineConfig } from "@/lib/pipeline-config";
import { loadDigestConfig, showPaidOffer } from "@/lib/digest-config";
import { counts, publishedRaw, testRun } from "./helpers";

describe("pipeline config", () => {
  const cfg = loadPipelineConfig();

  it("pins glm-4.7-flash and refuses any other model", () => {
    expect(cfg.ai.model).toBe(PINNED_MODEL);
    expect(PipelineConfig.safeParse({ ...cfg, ai: { ...cfg.ai, model: "glm-4.7" } }).success).toBe(false);
  });

  it("enforces conservative caps", () => {
    expect(cfg.ai.maxCandidatesPerRun).toBeLessThanOrEqual(10);
    expect(cfg.ai.maxRequestsPerRun).toBeLessThanOrEqual(15);
    expect(cfg.ai.maxConcurrentRequests).toBe(1);
    expect(PipelineConfig.safeParse({ ...cfg, ai: { ...cfg.ai, maxRequestsPerRun: 50 } }).success).toBe(false);
    expect(PipelineConfig.safeParse({ ...cfg, ai: { ...cfg.ai, maxTransientRetries: 3 } }).success).toBe(false);
    expect(PipelineConfig.safeParse({ ...cfg, ai: { ...cfg.ai, stopOnStatus: [429] } }).success).toBe(false);
    expect(cfg.collection.pubmed.requestsPerSecondWithoutKey).toBeLessThan(3);
    expect(cfg.collection.pubmed.requestsPerSecondWithKey).toBeLessThan(10);
  });

  it("stays in manual mode until a human confirms the free tier", () => {
    expect(cfg.ai.freeTierConfirmed).toBe(false);
    expect(aiDraftingAllowed(cfg, { ZAI_API_KEY: "x" }).ok).toBe(false);
    const confirmedNoProof = { ...cfg, ai: { ...cfg.ai, freeTierConfirmed: true } };
    expect(PipelineConfig.safeParse(confirmedNoProof).success).toBe(false);
  });
});

describe("monitoring log", () => {
  it("sample runs are fixtures", () => {
    expect(readRuns(FIXTURE_MONITORING_DIR).every((r) => r.fixture)).toBe(true);
  });

  it("rejects impossible counts", () => {
    const bad = testRun("2026-11-03T00:00:00Z", { alpha: counts(1, 1, { candidatesFound: 1, rejectedIrrelevant: 2 }) });
    expect(MonitoringRun.safeParse(bad).success).toBe(false);
  });

  it("sums runs inside the week only", () => {
    const t = weekTotals([testRun("2026-11-03T00:00:00Z", { a: counts(1, 2) }), testRun("2026-11-09T00:00:00Z", { a: counts(5, 5) })], "2026-11-02", "2026-11-09");
    expect(t.runs).toBe(1);
    expect(t.byIntervention.get("a")).toMatchObject({ papersScreened: 1, trialRecordsChecked: 2 });
  });

  it("counts published updates and grade changes from approved content", () => {
    const m = publishedSince(publishedRaw().claims, "2026-11-02", "2026-11-09");
    expect(m.get("alpha")).toEqual({ updatesPublished: 1, gradeChanges: 1 });
    expect(m.get("gamma")).toEqual({ updatesPublished: 1, gradeChanges: 0 });
    expect(m.get("beta")).toBeUndefined();
  });

  it("never records fixture runs into the real log", () => {
    const dir = fs.mkdtempSync(path.join(process.cwd(), "node_modules", ".tmp-monitoring-"));
    const fx = readRuns(FIXTURE_MONITORING_DIR)[0]!;
    expect(() => recordRun(fx, dir)).toThrow(/Fixture/);
    const file = recordRun(testRun("2026-11-03T00:00:00Z", { a: counts(1, 0) }), dir);
    expect(fs.existsSync(file)).toBe(true);
    fs.rmSync(dir, { recursive: true });
  });
});

describe("digest config", () => {
  it("keeps the paid offer off by default (Vercel Hobby is non-commercial)", () => {
    const cfg = loadDigestConfig();
    expect(cfg.paidOffer.enabled).toBe(false);
    expect(cfg.paidOffer).toMatchObject({ monthly: 6, yearly: 49 });
    expect(showPaidOffer(cfg, {})).toBe(false);
    expect(showPaidOffer(cfg, { LW_PREVIEW_PAID_OFFER: "1", VERCEL: "1" })).toBe(false);
    expect(showPaidOffer(cfg, { LW_PREVIEW_PAID_OFFER: "1" })).toBe(true);
  });
});
