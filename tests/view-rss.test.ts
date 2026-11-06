import { describe, expect, it } from "vitest";
import { FIXTURES_DIR, readContentDir } from "@/lib/content";
import { changeLine } from "@/lib/labels";
import { buildFeed } from "@/lib/rss";
import { buildSiteData } from "@/lib/view";

const data = buildSiteData({ mode: "fixtures", ...readContentDir(FIXTURES_DIR) });

describe("view model", () => {
  it("lists reviewed changes, not first assessments, and keeps prototype order", () => {
    expect(data.updates.map((u) => u.claimId)).toEqual([
      "creatine-cognition",
      "sauna-blood-pressure",
      "omega-3-atrial-fibrillation",
    ]);
    expect(data.interventions[0]!.claims.map((c) => c.id)).toEqual(["creatine-strength", "creatine-cognition"]);
  });

  it("shows placeholders, never invented counts or dates, for fixtures", () => {
    const c = data.interventions[0]!.claims[1]!;
    expect(c.sourceCount).toBe("[#] sources");
    expect(c.provenance).not.toMatch(/reviewed \d/i);
    expect(c.timeline.every((t) => t.date === "[Date]")).toBe(true);
  });

  it("writes change lines as specified", () => {
    expect(changeLine({ confidence: "very-low", finding: "mixed" }, { confidence: "low", finding: "mixed" }, "human")).toBe(
      "Confidence very low → low",
    );
    expect(changeLine({ confidence: "low", finding: "suggests-harm" }, { confidence: "low", finding: "suggests-harm" }, "human")).toBe(
      "New evidence, grade unchanged",
    );
  });
});

describe("rss", () => {
  it("builds a site feed titled Longevity Watchlist", () => {
    const xml = buildFeed({ siteUrl: "https://example.test", data });
    expect(xml).toContain("<title>Longevity Watchlist</title>");
    expect(xml.match(/<item>/g)).toHaveLength(3);
    expect(xml).toContain("[Sample]");
    expect(xml).toContain('<atom:link href="https://example.test/feed.xml"');
  });

  it("builds per-intervention feeds", () => {
    const xml = buildFeed({ siteUrl: "https://example.test", data, interventionId: "sauna" });
    expect(xml).toContain("<title>Longevity Watchlist: Sauna</title>");
    expect(xml.match(/<item>/g)).toHaveLength(1);
  });

  it("escapes XML", () => {
    const tricky = { ...data, mode: "published" as const, updates: [{ ...data.updates[0]!, summary: "a < b & c" }] };
    expect(buildFeed({ siteUrl: "https://x.test", data: tricky })).toContain("a &lt; b &amp; c");
  });
});
