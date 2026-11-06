import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FIXTURES_DIR, readContentDir } from "@/lib/content";
import { NOTHING_CHANGED, buildDigest, renderHtml, renderMarkdown, renderText } from "@/lib/digest";
import { FIXTURE_MONITORING_DIR, readRuns } from "@/lib/monitoring";
import { TEST_WEEK, counts, fixtureClaim, publishedRaw, testRun } from "./helpers";

const base = { mode: "published" as const, weekStart: TEST_WEEK, siteUrl: "https://lw.test", correctionsUrl: "/methodology/#corrections" };
const runs = [
  testRun("2026-11-03T06:00:00Z", { alpha: counts(5, 1), beta: counts(2, 0) }),
  testRun("2026-11-06T06:00:00Z", { alpha: counts(4, 1, { candidatesFound: 2, rejectedDuplicate: 1 }), gamma: counts(3, 2) }),
  testRun("2026-10-27T06:00:00Z", { alpha: counts(100, 100) }), // previous week: excluded
];

describe("production digest guards", () => {
  it("throws if fixture content is passed as published content", () => {
    const raw = publishedRaw();
    expect(() => buildDigest({ ...base, raw: { ...raw, claims: [...raw.claims, fixtureClaim()] }, runs })).toThrow(/Fixture/);
  });

  it("throws if fixture monitoring runs are used for a production digest", () => {
    expect(() => buildDigest({ ...base, raw: publishedRaw(), runs: readRuns(FIXTURE_MONITORING_DIR) })).toThrow(/Fixture monitoring/);
  });

  it("excludes unreviewed drafts and AI-edited content", () => {
    const raw = publishedRaw();
    const draft = { ...raw.claims[0]!, review: { status: "unreviewed" as const } };
    const aiEdited = { ...raw.claims[2]!, assessment: { ...raw.claims[2]!.assessment, summary: "AI suggested text." } };
    const d = buildDigest({ ...base, raw: { ...raw, claims: [draft, raw.claims[1]!, aiEdited] }, runs });
    expect(d.sections.map((s) => s.interventionId)).toEqual(["beta"]);
    const all = renderMarkdown(d) + renderHtml(d) + renderText(d);
    expect(all).not.toContain("A new trial added comparable data");
    expect(all).not.toContain("AI suggested text");
  });

  it("the digest command never reads drafts/ or fixtures in production", () => {
    const src = fs.readFileSync(path.join(process.cwd(), "scripts", "digest.ts"), "utf8");
    expect(src).not.toMatch(/["'`]drafts/);
    expect(src).toMatch(/sample \? FIXTURES_DIR : PUBLISHED_DIR/);
  });
});

describe("digest content", () => {
  it("monitoring counts match the log for the week", () => {
    const d = buildDigest({ ...base, raw: publishedRaw(), runs });
    const alpha = d.sections.find((s) => s.interventionId === "alpha")!;
    expect(alpha.counts).toMatchObject({ papersScreened: 9, trialRecordsChecked: 2, candidatesFound: 2, rejectedDuplicate: 1 });
    expect(alpha.checked).toBe("We screened 9 new papers and 2 trial updates. 2 records looked relevant enough to read; 1 turned out to be a duplicate.");
    expect(d.sections.find((s) => s.interventionId === "gamma")!.checked).toBe("We screened 3 new papers and 2 trial updates.");
  });

  it("reports grade changes with previous and new assessment and reasoning", () => {
    const d = buildDigest({ ...base, raw: publishedRaw(), runs });
    const g = d.sections[0]!.gradeChanges[0]!;
    expect(g).toMatchObject({ previous: "Very low confidence, mixed findings", next: "Low confidence, mixed findings", reasoning: "Second comparable trial." });
    expect(renderText(d)).toContain("Very low → Low confidence");
    expect(d.sections[0]!.sourceLinks[0]!.url).toBe("https://example.org/test-study");
  });

  it("states plainly when nothing changed", () => {
    const d = buildDigest({ ...base, raw: publishedRaw(), runs });
    const beta = d.sections.find((s) => s.interventionId === "beta")!;
    expect(beta.highlight).toBeNull();
    expect(beta.gradeChanges).toEqual([]);
    for (const out of [renderMarkdown(d), renderHtml(d), renderText(d)]) expect(out).toContain(NOTHING_CHANGED);
  });

  it("a week with no monitoring run says so instead of inventing counts", () => {
    const d = buildDigest({ ...base, raw: publishedRaw(), runs: [], weekStart: "2026-12-07" });
    expect(d.sections[0]!.checked).toMatch(/No monitoring run was recorded/);
    expect(d.sections.every((s) => s.highlight === null)).toBe(true);
  });

  it("personalized digests include only the subscriber's interventions", () => {
    const d = buildDigest({ ...base, raw: publishedRaw(), runs, follow: ["gamma", "alpha"] });
    expect(d.kind).toBe("personalized");
    expect(d.sections.map((s) => s.interventionId)).toEqual(["alpha", "gamma"]);
    const text = renderText(d);
    expect(text).not.toMatch(/BETA/);
    expect(text).not.toContain("/claims/beta-claim/");
  });

  it("rejects unknown follows", () => {
    expect(() => buildDigest({ ...base, raw: publishedRaw(), runs, follow: ["creatine"] })).toThrow(/Unknown/);
  });

  it("new evidence is the highlight when no grade moved", () => {
    const d = buildDigest({ ...base, raw: publishedRaw(), runs, follow: ["gamma"] });
    expect(d.sections[0]!.highlight?.text).toBe("A meta-analysis agrees.");
  });

  it("every format carries the disclaimer and a corrections link", () => {
    const d = buildDigest({ ...base, raw: publishedRaw(), runs });
    for (const out of [renderMarkdown(d), renderHtml(d), renderText(d)]) {
      expect(out).toContain("Research summary only. Not medical advice.");
      expect(out).toContain("https://lw.test/methodology/#corrections");
    }
  });

  it("escapes HTML from content", () => {
    const raw = publishedRaw();
    const d = buildDigest({ ...base, raw, runs });
    d.sections[0]!.name = "<script>x</script>";
    expect(renderHtml(d)).not.toContain("<script>x");
  });
});

describe("sample digests", () => {
  it("labels fixture digests and counts as sample data", () => {
    const d = buildDigest({ ...base, mode: "fixtures", raw: readContentDir(FIXTURES_DIR), runs: readRuns(FIXTURE_MONITORING_DIR) });
    expect(d.sample).toBe(true);
    expect(d.title).toMatch(/^\[SAMPLE\]/);
    for (const out of [renderMarkdown(d), renderHtml(d), renderText(d)]) expect(out).toMatch(/Sample data/);
    expect(renderText(d)).toContain("(sample data)");
  });

  it("refuses real content in sample mode", () => {
    expect(() => buildDigest({ ...base, mode: "fixtures", raw: publishedRaw(), runs: [] })).toThrow(/fixtures only/);
  });
});
