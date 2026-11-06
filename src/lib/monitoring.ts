import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { Claim } from "./schema";

/**
 * Monitoring log: what each collection run actually did, per intervention.
 * Stored as versioned JSON in monitoring/runs/ (outside public content).
 * Counts come only from real pipeline runs. Fixture runs live in
 * fixtures/monitoring/ and are always labelled sample data.
 */

const count = z.number().int().nonnegative();

export const InterventionCounts = z
  .object({
    papersScreened: count,
    trialRecordsChecked: count,
    candidatesFound: count,
    rejectedIrrelevant: count,
    rejectedDuplicate: count,
    updatesPublished: count,
    gradeChanges: count,
  })
  .strict()
  .superRefine((c, ctx) => {
    if (c.rejectedIrrelevant + c.rejectedDuplicate > c.candidatesFound) {
      ctx.addIssue({ code: "custom", message: "More candidates rejected than found" });
    }
    if (c.gradeChanges > c.updatesPublished) {
      ctx.addIssue({ code: "custom", message: "More grade changes than published updates" });
    }
  });
export type InterventionCounts = z.infer<typeof InterventionCounts>;

export const MonitoringRun = z
  .object({
    schemaVersion: z.literal(1),
    runId: z.string().regex(/^[0-9TZ:.-]+$/),
    fixture: z.boolean(),
    startedAt: z.string().datetime({ offset: true }),
    finishedAt: z.string().datetime({ offset: true }),
    /** Which part of the pipeline produced the counts. */
    producedBy: z.enum(["collection-pipeline", "fixture"]),
    /** Caps or errors that ended the run early, in plain words. */
    notes: z.array(z.string()).default([]),
    interventions: z.record(z.string(), InterventionCounts),
  })
  .strict()
  .superRefine((r, ctx) => {
    if (r.fixture !== (r.producedBy === "fixture")) {
      ctx.addIssue({ code: "custom", message: "Fixture runs must be producedBy 'fixture' and vice versa" });
    }
    if (r.finishedAt < r.startedAt) ctx.addIssue({ code: "custom", message: "finishedAt before startedAt" });
  });
export type MonitoringRun = z.infer<typeof MonitoringRun>;

export const MONITORING_DIR = path.join(process.cwd(), "monitoring", "runs");
export const FIXTURE_MONITORING_DIR = path.join(process.cwd(), "fixtures", "monitoring");

export function readRuns(dir: string): MonitoringRun[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => {
      const parsed = MonitoringRun.safeParse(JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")));
      if (!parsed.success) throw new Error(`monitoring ${f}: ${z.prettifyError(parsed.error)}`);
      return parsed.data;
    });
}

export const ZERO: InterventionCounts = {
  papersScreened: 0,
  trialRecordsChecked: 0,
  candidatesFound: 0,
  rejectedIrrelevant: 0,
  rejectedDuplicate: 0,
  updatesPublished: 0,
  gradeChanges: 0,
};

export interface WeekTotals {
  runs: number;
  fixture: boolean;
  byIntervention: Map<string, InterventionCounts>;
}

/** Sum runs that finished inside [start, end) (ISO dates, UTC). */
export function weekTotals(runs: readonly MonitoringRun[], start: string, end: string): WeekTotals {
  const inWeek = runs.filter((r) => r.finishedAt.slice(0, 10) >= start && r.finishedAt.slice(0, 10) < end);
  const byIntervention = new Map<string, InterventionCounts>();
  for (const r of inWeek) {
    for (const [iv, c] of Object.entries(r.interventions)) {
      const prev = byIntervention.get(iv) ?? ZERO;
      byIntervention.set(iv, {
        papersScreened: prev.papersScreened + c.papersScreened,
        trialRecordsChecked: prev.trialRecordsChecked + c.trialRecordsChecked,
        candidatesFound: prev.candidatesFound + c.candidatesFound,
        rejectedIrrelevant: prev.rejectedIrrelevant + c.rejectedIrrelevant,
        rejectedDuplicate: prev.rejectedDuplicate + c.rejectedDuplicate,
        updatesPublished: prev.updatesPublished + c.updatesPublished,
        gradeChanges: prev.gradeChanges + c.gradeChanges,
      });
    }
  }
  return { runs: inWeek.length, fixture: inWeek.some((r) => r.fixture), byIntervention };
}

/**
 * Published updates and grade changes between two dates, counted from
 * approved content. The collection pipeline calls this when it records a run,
 * so these two numbers are counted, not estimated.
 */
export function publishedSince(claims: readonly Claim[], sinceDate: string, untilDate: string) {
  const out = new Map<string, { updatesPublished: number; gradeChanges: number }>();
  for (const c of claims) {
    for (const u of c.updates) {
      if (u.kind === "first-assessment" || !u.date || u.date < sinceDate || u.date >= untilDate) continue;
      if (u.review.status !== "approved") continue;
      const cur = out.get(c.interventionId) ?? { updatesPublished: 0, gradeChanges: 0 };
      cur.updatesPublished++;
      if (u.kind === "grade-change" || (u.previous && (u.previous.confidence !== u.next.confidence || u.previous.finding !== u.next.finding))) {
        cur.gradeChanges++;
      }
      out.set(c.interventionId, cur);
    }
  }
  return out;
}

/** Write one run to monitoring/runs/. Used by the collection pipeline (Phase 3). */
export function recordRun(run: MonitoringRun, dir = MONITORING_DIR): string {
  const parsed = MonitoringRun.parse(run);
  if (parsed.fixture) throw new Error("Fixture runs are never written to monitoring/runs");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${parsed.runId.replace(/[:.]/g, "-")}.json`);
  if (fs.existsSync(file)) throw new Error(`Run ${parsed.runId} already recorded`);
  fs.writeFileSync(file, `${JSON.stringify(parsed, null, 2)}\n`);
  return file;
}
