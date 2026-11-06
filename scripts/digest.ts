/**
 * Build the weekly digest for the operator to review and paste into the
 * newsletter provider. It never sends anything.
 *
 *   npm run digest -- --week 2026-11-02                    # production: approved content + real monitoring runs
 *   npm run digest -- --week 2026-11-02 --follow creatine,sauna --follow omega-3
 *   npm run digest -- --week 2026-11-02 --combos combos.txt   # one comma-separated tag set per line
 *   npm run digest -- --sample                             # design fixtures, labelled sample data
 *
 * Output (git-ignored): digests/<week>/ or digests/sample/
 *   roundup.{html,md,txt}                 free general roundup, all interventions
 *   sections/<intervention>.{html,md,txt} one per intervention (personalized for a single follow)
 *   personalized/<a+b>.{html,md,txt}      one per requested combination
 *   manifest.json                         which file goes to which subscriber tags
 *
 * Production digests read only content/ (with approval hashes verified) and
 * drafts/monitoring/runs/ (monitoring counts only). They never read draft
 * claims, candidates, AI output (drafts/ai, drafts/rejected) or fixtures/.
 */
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { FIXTURES_DIR, PUBLISHED_DIR, readContentDir } from "../src/lib/content";
import { addDays, buildDigest, renderHtml, renderMarkdown, renderText, type Digest } from "../src/lib/digest";
import { loadDigestConfig, tagFor } from "../src/lib/digest-config";
import { FIXTURE_MONITORING_DIR, MONITORING_DIR, readRuns } from "../src/lib/monitoring";
import { siteUrl } from "../src/lib/site";

function lastMonday(today = new Date()): string {
  const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const day = d.getUTCDay() || 7; // Monday = 1
  d.setUTCDate(d.getUTCDate() - (day - 1) - 7); // Monday of the last full week
  return d.toISOString().slice(0, 10);
}

function main() {
  const { values } = parseArgs({
    options: {
      week: { type: "string" },
      sample: { type: "boolean", default: false },
      follow: { type: "string", multiple: true, default: [] },
      combos: { type: "string" },
      "all-combinations": { type: "boolean", default: false },
      out: { type: "string" },
    },
  });
  const sample = values.sample;
  const week = values.week ?? lastMonday();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(week)) throw new Error("--week must be YYYY-MM-DD");

  const cfg = loadDigestConfig();
  const raw = readContentDir(sample ? FIXTURES_DIR : PUBLISHED_DIR);
  const runs = readRuns(sample ? FIXTURE_MONITORING_DIR : MONITORING_DIR);
  const base = {
    mode: sample ? ("fixtures" as const) : ("published" as const),
    raw,
    runs,
    weekStart: week,
    siteUrl: siteUrl(),
    correctionsUrl: cfg.links.correctionsUrl,
  };

  const roundup = buildDigest(base);
  const available = roundup.sections.map((s) => s.interventionId);
  if (!available.length) {
    console.log("No published interventions yet. Nothing to build.");
    return;
  }

  const combos = new Set<string>();
  const addCombo = (ids: string[]) => {
    const clean = [...new Set(ids.map((s) => s.trim()).filter(Boolean))].sort((a, b) => available.indexOf(a) - available.indexOf(b));
    if (clean.length) combos.add(clean.join(","));
  };
  for (const f of values.follow ?? []) addCombo(f.split(","));
  if (values.combos) {
    for (const line of fs.readFileSync(values.combos, "utf8").split(/\r?\n/)) {
      // Accept intervention IDs or provider tags (with the tag prefix).
      addCombo(line.split(",").map((t) => t.trim().replace(new RegExp(`^${cfg.tagPrefix}`), "")));
    }
  }
  if (values["all-combinations"]) {
    for (let mask = 1; mask < 1 << available.length; mask++) addCombo(available.filter((_, i) => mask & (1 << i)));
  }

  const outDir = values.out ?? path.join(process.cwd(), "digests", sample ? "sample" : week);
  fs.mkdirSync(path.join(outDir, "sections"), { recursive: true });
  const manifest: { file: string; kind: string; tags: string[]; title: string }[] = [];
  const write = (rel: string, d: Digest, tags: string[]) => {
    const full = path.join(outDir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(`${full}.html`, renderHtml(d));
    fs.writeFileSync(`${full}.md`, renderMarkdown(d));
    fs.writeFileSync(`${full}.txt`, renderText(d));
    manifest.push({ file: rel, kind: d.kind, tags, title: d.title });
  };

  write("roundup", roundup, []);
  for (const id of available) write(`sections/${id}`, buildDigest({ ...base, follow: [id] }), [tagFor(cfg, id)]);
  for (const combo of combos) {
    const ids = combo.split(",");
    write(`personalized/${ids.join("+")}`, buildDigest({ ...base, follow: ids }), ids.map((id) => tagFor(cfg, id)));
  }

  const usage = {
    week,
    sample,
    builtAt: new Date().toISOString(),
    monitoringRunsInWeek: sample
      ? runs.length
      : runs.filter((r) => r.finishedAt.slice(0, 10) >= week && r.finishedAt.slice(0, 10) < addDays(week, 7)).length,
    note: "Review every file before sending. This command never sends email.",
    files: manifest,
  };
  fs.writeFileSync(path.join(outDir, "manifest.json"), `${JSON.stringify(usage, null, 2)}\n`);
  console.log(`${sample ? "SAMPLE digest" : "Digest"} for ${sample ? "fixtures" : `week of ${week}`}: ${manifest.length} digests in ${path.relative(process.cwd(), outDir)}/`);
  console.log("Review each one before sending. Nothing was sent.");
}

main();
