import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadPipelineConfig } from "@/lib/pipeline-config";
import { collect, doiKey, nctKey, type CollectDeps } from "@/pipeline/collect";
import { searchStudies } from "@/pipeline/ctgov";
import { createHttp, type FetchLike } from "@/pipeline/http";
import { esearch, parsePubmedXml, pubmedIntervalMs } from "@/pipeline/pubmed";
import { Candidate, EMPTY_CHECKPOINT, loadSearchConfig, type ClaimSearch } from "@/pipeline/types";

const FX = path.join(process.cwd(), "tests", "fixtures", "http");
const read = (f: string) => fs.readFileSync(path.join(FX, f), "utf8");
const base = loadPipelineConfig().collection;
const cfg = {
  ...base,
  pubmed: { ...base.pubmed, esearchPageSize: 2, maxResultsPerQuery: 4, efetchBatchSize: 3 },
  clinicaltrials: { ...base.clinicaltrials, pageSize: 2, maxPagesPerQuery: 3 },
};
const NOW = new Date("2026-11-06T06:00:00Z");

/** Routes requests to recorded responses. Records every URL requested. */
function recorded(log: string[] = []): FetchLike {
  const xml = read("pubmed-efetch.xml");
  return async (url) => {
    log.push(url);
    const u = new URL(url);
    if (u.pathname.endsWith("/esearch.fcgi")) {
      if (u.searchParams.get("term") === "LINKED") {
        return new Response(JSON.stringify({ esearchresult: { count: "1", idlist: ["42868132"] } }));
      }
      if (u.searchParams.get("term")?.includes("NO-RESULTS")) {
        return new Response(JSON.stringify({ esearchresult: { count: "0", idlist: [] } }));
      }
      return new Response(read(u.searchParams.get("retstart") === "0" ? "pubmed-esearch-p1.json" : "pubmed-esearch-p2.json"));
    }
    if (u.pathname.endsWith("/efetch.fcgi")) {
      const ids = new Set(u.searchParams.get("id")!.split(","));
      const [head, ...arts] = xml.split("<PubmedArticle>");
      const keep = arts.filter((a) => ids.has(/<PMID[^>]*>(\d+)<\/PMID>/.exec(a)![1]!));
      return new Response([head, ...keep].join("<PubmedArticle>"));
    }
    if (u.hostname === "clinicaltrials.gov") {
      if (u.searchParams.get("query.intr") === "linked") return new Response(read("ctgov-linked.json"));
      return new Response(read(u.searchParams.get("pageToken") ? "ctgov-p2.json" : "ctgov-p1.json"));
    }
    return new Response("not found", { status: 404 });
  };
}

function deps(over: { fetch?: FetchLike; pubmedMax?: number; ctMax?: number; cap?: number } = {}): CollectDeps {
  const f = over.fetch ?? recorded();
  const mk = (label: string, max: number) =>
    createHttp({ label, fetch: f, sleep: async () => {}, timeoutMs: 1000, maxRetries: 2, minIntervalMs: 0, maxRequests: max });
  return {
    pubmed: mk("PubMed", over.pubmedMax ?? 50),
    ctgov: mk("ClinicalTrials.gov", over.ctMax ?? 50),
    identity: { tool: "lw-test", email: "test@example.org" },
    cfg: { ...cfg, maxNewCandidatesPerRun: over.cap ?? 60 },
    now: () => NOW,
    runId: "2026-11-06T06-00-00Z",
  };
}

const search = (claimId: string, over: Partial<ClaimSearch> = {}): ClaimSearch => ({
  claimId,
  interventionId: "creatine",
  needsHumanTuning: true,
  pubmed: { term: "creatine[tiab] AND strength[tiab]" },
  clinicaltrials: { intervention: "creatine", term: "strength" },
  ...over,
});

describe("search config", () => {
  it("covers the six fixture interventions and is marked for human tuning", () => {
    const s = loadSearchConfig().searches;
    expect(new Set(s.map((x) => x.interventionId))).toEqual(new Set(["creatine", "sauna", "rapamycin", "nmn-nr", "vitamin-d", "omega-3"]));
    expect(s.every((x) => x.needsHumanTuning)).toBe(true);
  });
});

describe("PubMed parsing", () => {
  const recs = parsePubmedXml(read("pubmed-efetch.xml"));

  it("parses every article with its own DOI, not one from its reference list", () => {
    expect(recs.map((r) => r.pmid)).toEqual(["42826085", "42765482", "42730713", "42141930", "42868132"]);
    const xml = read("pubmed-efetch.xml").split("<PubmedArticle>")[1]!;
    const own = /<PubmedData>[\s\S]*?<ArticleIdList>[\s\S]*?<ArticleId IdType="doi">([^<]+)</.exec(xml)![1];
    expect(recs[0]!.doi).toBe(own);
    expect(new Set(recs.map((r) => r.doi)).size).toBe(5);
  });

  it("reads abstracts, dates and publication types", () => {
    for (const r of recs) {
      expect(r.title.length).toBeGreaterThan(10);
      expect(r.publishedDate).toMatch(/^\d{4}(-\d{2}){0,2}$/);
      expect(r.publicationTypes.length).toBeGreaterThan(0);
    }
    expect(recs.filter((r) => r.abstract.length > 200).length).toBeGreaterThanOrEqual(4);
  });

  it("reads trial registry links", () => {
    expect(recs.find((r) => r.pmid === "42868132")!.trialIds).toContain("NCT07233707");
  });
});

describe("pagination and rate limits", () => {
  it("pages through esearch with retstart", async () => {
    const log: string[] = [];
    const http = deps({ fetch: recorded(log) }).pubmed;
    const { ids, total } = await esearch(http, cfg.pubmed, { tool: "t", email: "e@example.org" }, "x", 4);
    expect(ids).toEqual(["42826085", "42765482", "42730713", "42141930"]);
    expect(total).toBe(2457);
    expect(log.map((u) => new URL(u).searchParams.get("retstart"))).toEqual(["0", "2"]);
    expect(new URL(log[0]!).searchParams.get("tool")).toBe("t");
    expect(new URL(log[0]!).searchParams.get("email")).toBe("e@example.org");
  });

  it("follows ClinicalTrials.gov nextPageToken until it ends", async () => {
    const log: string[] = [];
    const { studies } = await searchStudies(deps({ fetch: recorded(log) }).ctgov, cfg.clinicaltrials, { intervention: "creatine", term: "strength" }, { now: NOW });
    expect(studies.map((s) => s.nct)).toEqual(["NCT07914270", "NCT07213063", "NCT07902206", "NCT07891936"]);
    expect(log).toHaveLength(2);
    expect(new URL(log[1]!).searchParams.get("pageToken")).toBeTruthy();
    expect(new URL(log[0]!).searchParams.get("filter.advanced")).toBe("AREA[LastUpdatePostDate]RANGE[2026-10-23,MAX]");
  });

  it("stays under NCBI's limits (3/s without a key, 10/s with one)", () => {
    expect(1000 / pubmedIntervalMs(base.pubmed, false)).toBeLessThan(3);
    expect(1000 / pubmedIntervalMs(base.pubmed, true)).toBeLessThan(10);
  });

  it("spaces requests by the minimum interval", async () => {
    let t = 0;
    const waits: number[] = [];
    const http = createHttp({
      label: "x",
      fetch: async () => new Response("{}"),
      sleep: async (ms) => {
        waits.push(ms);
        t += ms;
      },
      now: () => t,
      timeoutMs: 1000,
      maxRetries: 0,
      minIntervalMs: 500,
      maxRequests: 5,
    });
    await http.request("https://x.test/a");
    await http.request("https://x.test/b");
    await http.request("https://x.test/c");
    expect(waits).toEqual([500, 500]);
  });

  it("retries timeouts and 5xx at most twice, never 4xx", async () => {
    let calls = 0;
    const timeouts: FetchLike = async () => {
      calls++;
      const e = new Error("aborted");
      e.name = "AbortError";
      throw e;
    };
    const d = deps({ fetch: timeouts });
    await expect(d.pubmed.request("https://eutils.ncbi.nlm.nih.gov/x?api_key=SECRET")).rejects.toThrow(/timeout/);
    expect(calls).toBe(3);
    calls = 0;
    const err = await deps({
      fetch: async () => {
        calls++;
        return new Response("", { status: 429 });
      },
    }).pubmed.request("https://x.test/y");
    expect(err.status).toBe(429);
    expect(calls).toBe(1);
  });

  it("never puts query strings (api_key, email) in error messages", async () => {
    const d = deps({ fetch: async () => new Response("", { status: 503 }) });
    const err = await d.pubmed.request("https://eutils.ncbi.nlm.nih.gov/x?api_key=SECRET&email=a@b.c").catch((e) => e);
    expect(err.message).not.toMatch(/SECRET|a@b\.c/);
  });
});

describe("collection run", () => {
  it("creates valid candidates with retrieval and revision dates, and counts them", async () => {
    const r = await collect(deps(), { searches: [search("creatine-strength")], checkpoint: EMPTY_CHECKPOINT, known: new Set() });
    expect(r.candidates).toHaveLength(8);
    for (const c of r.candidates) expect(Candidate.safeParse(c).success).toBe(true);
    const pub = r.candidates.find((c) => c.id === "pmid-42826085")!;
    expect(pub).toMatchObject({ source: "pubmed", recordType: "study-result", retrievedAt: NOW.toISOString() });
    expect(pub.sourceRevisionDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const trial = r.candidates.find((c) => c.id === "nct-nct07914270")!;
    expect(trial).toMatchObject({ recordType: "trial-registration", sourceRevisionDate: "2026-11-03" });
    expect(trial.text).toMatch(/trial registration, not a published result/);
    expect(r.counts.creatine).toMatchObject({ papersScreened: 4, trialRecordsChecked: 4, candidatesFound: 8, rejectedDuplicate: 0 });
  });

  it("does not collect records again once they are in the checkpoint", async () => {
    const first = await collect(deps(), { searches: [search("creatine-strength")], checkpoint: EMPTY_CHECKPOINT, known: new Set() });
    const second = await collect(deps(), { searches: [search("creatine-strength")], checkpoint: first.checkpoint, known: new Set() });
    expect(second.candidates).toHaveLength(0);
    expect(second.counts.creatine).toMatchObject({ papersScreened: 4, trialRecordsChecked: 4, candidatesFound: 0 });
  });

  it("deduplicates by DOI and NCT against published evidence", async () => {
    const recs = parsePubmedXml(read("pubmed-efetch.xml"));
    const known = new Set([doiKey(recs[0]!.doi!.toUpperCase()), nctKey("NCT07213063")]);
    const r = await collect(deps(), { searches: [search("creatine-strength")], checkpoint: EMPTY_CHECKPOINT, known });
    expect(r.candidates.map((c) => c.id)).not.toContain("pmid-42826085");
    expect(r.candidates.map((c) => c.id)).not.toContain("nct-nct07213063");
    expect(r.counts.creatine!.rejectedDuplicate).toBe(1);
  });

  it("merges the same record found by two claims into one candidate", async () => {
    const r = await collect(deps(), {
      searches: [search("creatine-strength"), search("creatine-cognition"), search("sauna-blood-pressure", { interventionId: "sauna" })],
      checkpoint: EMPTY_CHECKPOINT,
      known: new Set(),
    });
    expect(r.candidates).toHaveLength(8);
    const c = r.candidates.find((x) => x.id === "pmid-42826085")!;
    expect(c.claimIds).toEqual(["creatine-strength", "creatine-cognition", "sauna-blood-pressure"]);
    expect(c.interventionIds).toEqual(["creatine", "sauna"]);
    expect(r.counts.creatine!.rejectedDuplicate).toBe(8);
    expect(r.counts.sauna!.candidatesFound).toBe(8);
  });

  it("detects trial revisions without treating unchanged records as new", async () => {
    const records = (await collect(deps(), { searches: [search("x", { pubmed: null })], checkpoint: EMPTY_CHECKPOINT, known: new Set() })).checkpoint.records;
    // Unchanged registry dates: nothing new.
    let r = await collect(deps(), { searches: [search("x", { pubmed: null })], checkpoint: { schemaVersion: 1, updatedAt: null, records }, known: new Set() });
    expect(r.candidates).toHaveLength(0);
    // Date changed, nothing material: checkpoint updated quietly.
    const minor = { ...records, [nctKey("NCT07914270")]: { ...records[nctKey("NCT07914270")]!, revision: "2026-09-01" } };
    r = await collect(deps(), { searches: [search("x", { pubmed: null })], checkpoint: { schemaVersion: 1, updatedAt: null, records: minor }, known: new Set() });
    expect(r.candidates).toHaveLength(0);
    expect(r.checkpoint.records[nctKey("NCT07914270")]!.revision).toBe("2026-11-03");
    // Status changed: a trial-status-change candidate with the previous state.
    const material = { ...records, [nctKey("NCT07914270")]: { ...records[nctKey("NCT07914270")]!, revision: "2026-09-01", status: "NOT_YET_RECRUITING" } };
    r = await collect(deps(), { searches: [search("x", { pubmed: null })], checkpoint: { schemaVersion: 1, updatedAt: null, records: material }, known: new Set() });
    expect(r.candidates).toHaveLength(1);
    expect(r.candidates[0]).toMatchObject({
      recordType: "trial-status-change",
      trial: { status: "RECRUITING" },
      previous: { status: "NOT_YET_RECRUITING", revisionDate: "2026-09-01" },
    });
    expect(r.candidatesRevised).toBe(1);
  });

  it("links a publication and its registry record", async () => {
    const r = await collect(deps(), {
      searches: [search("x", { pubmed: { term: "LINKED" }, clinicaltrials: { intervention: "linked" } })],
      checkpoint: EMPTY_CHECKPOINT,
      known: new Set(),
    });
    const pub = r.candidates.find((c) => c.id === "pmid-42868132")!;
    const trial = r.candidates.find((c) => c.id === "nct-nct07233707")!;
    expect(pub.linkedTrialIds).toEqual(["NCT07233707"]);
    expect(trial.linkedPmids).toContain("42868132");
  });

  it("stops at the PubMed request cap and keeps going with the registry", async () => {
    const r = await collect(deps({ pubmedMax: 1 }), { searches: [search("creatine-strength")], checkpoint: EMPTY_CHECKPOINT, known: new Set() });
    expect(r.notes.join(" ")).toMatch(/PubMed request cap reached/);
    expect(r.candidates.every((c) => c.source === "clinicaltrials.gov")).toBe(true);
    expect(r.candidates).toHaveLength(4);
  });

  it("stops creating candidates at the per-run cap and leaves the rest for next time", async () => {
    const r = await collect(deps({ cap: 3 }), { searches: [search("creatine-strength")], checkpoint: EMPTY_CHECKPOINT, known: new Set() });
    expect(r.candidates).toHaveLength(3);
    expect(r.notes.join(" ")).toMatch(/Candidate cap of 3/);
    const next = await collect(deps(), { searches: [search("creatine-strength")], checkpoint: r.checkpoint, known: new Set() });
    expect(next.candidates).toHaveLength(5);
  });

  it("an empty search is screened as zero, not an error", async () => {
    const r = await collect(deps(), { searches: [search("x", { pubmed: { term: "NO-RESULTS" }, clinicaltrials: null })], checkpoint: EMPTY_CHECKPOINT, known: new Set() });
    expect(r.counts.creatine).toMatchObject({ papersScreened: 0, candidatesFound: 0 });
    expect(r.notes).toEqual([]);
  });
});
