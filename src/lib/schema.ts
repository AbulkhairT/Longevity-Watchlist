import { z } from "zod";

/**
 * Content schemas for Longevity Watchlist.
 *
 * Evidence is assessed per claim, never per intervention. The dimensions below
 * are deliberately independent: high confidence does not imply benefit, and an
 * animal-only evidence base can never be graded as a demonstrated human effect.
 */

export const SCHEMA_VERSION = 1 as const;

const slug = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, digits and single hyphens");
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
const isoDateTime = z.string().datetime({ offset: true });
const text = z.string().trim().min(1);

export const Confidence = z.enum(["very-low", "low", "moderate", "high"]);
export type Confidence = z.infer<typeof Confidence>;

export const Finding = z.enum([
  "supports-benefit",
  "no-meaningful-benefit",
  "mixed",
  "suggests-harm",
  "insufficient",
]);
export type Finding = z.infer<typeof Finding>;

export const EvidenceBase = z.enum(["human", "animal"]);
export type EvidenceBase = z.infer<typeof EvidenceBase>;

export const OutcomeType = z.enum(["biomarker", "health-outcome"]);
export type OutcomeType = z.infer<typeof OutcomeType>;

export const StudyDesign = z.enum([
  "meta-analysis",
  "systematic-review",
  "randomized-trial",
  "non-randomized-trial",
  "cohort",
  "case-control",
  "cross-sectional",
  "case-series",
  "animal-study",
  "in-vitro",
  "trial-registration",
  "regulatory-notice",
  "other",
]);
export type StudyDesign = z.infer<typeof StudyDesign>;

/** "not reported" is required wherever a source does not state a value. */
export const NOT_REPORTED = "not reported" as const;
const orNotReported = <T extends z.ZodTypeAny>(schema: T) => z.union([schema, z.literal(NOT_REPORTED)]);

// ---------------------------------------------------------------------------
// Review metadata
// ---------------------------------------------------------------------------

export const Reviewer = z.object({
  name: text,
  github: z.string().regex(/^[A-Za-z0-9-]+$/).optional(),
});
export type Reviewer = z.infer<typeof Reviewer>;

export const Review = z.discriminatedUnion("status", [
  z.object({ status: z.literal("unreviewed") }).strict(),
  z
    .object({
      status: z.literal("approved"),
      reviewer: Reviewer,
      reviewedAt: isoDate,
      reasoning: text,
      /** sha256 of the canonical approved content. Approval is void if it no longer matches. */
      contentHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    })
    .strict(),
]);
export type Review = z.infer<typeof Review>;

// ---------------------------------------------------------------------------
// Evidence records (one per source document or registry record)
// ---------------------------------------------------------------------------

export const Identifiers = z
  .object({
    pmid: z.string().regex(/^\d+$/).optional(),
    doi: z.string().regex(/^10\.\d{4,9}\/\S+$/).optional(),
    nct: z.string().regex(/^NCT\d{8}$/).optional(),
    fda: z.string().optional(),
  })
  .strict();

export const RecordType = z.enum([
  /** A published result: what a study found. */
  "study-result",
  /** A registry entry describing a planned or ongoing trial. Not a result. */
  "trial-registration",
  /** A registry revision such as recruitment status or completion. Not a result. */
  "trial-status-change",
  /** Manually sourced regulator notice (FDA). */
  "regulatory-notice",
]);
export type RecordType = z.infer<typeof RecordType>;

export const EvidenceRecord = z
  .object({
    schemaVersion: z.literal(SCHEMA_VERSION),
    id: slug,
    fixture: z.literal(false),
    recordType: RecordType,
    provenance: z.enum(["pubmed", "clinicaltrials.gov", "fda", "manual"]),
    title: text,
    url: z.string().url(),
    identifiers: Identifiers,
    /** NCT ID that links several publications and registry revisions of one trial. */
    trialId: z.string().regex(/^NCT\d{8}$/).nullable(),
    publishedDate: isoDate.nullable(),
    /** Date the source itself was last revised (registry last update, erratum). */
    sourceRevisionDate: isoDate.nullable(),
    retrievedAt: isoDateTime,
    population: text,
    evidenceBase: EvidenceBase,
    design: StudyDesign,
    sampleSize: orNotReported(z.number().int().positive()),
    outcomeType: OutcomeType,
    findings: text,
    limitations: text,
    /** True when only the abstract or registry summary was read, not the full text. */
    abstractOnly: z.boolean(),
  })
  .strict()
  .superRefine((r, ctx) => {
    if (!r.identifiers.pmid && !r.identifiers.doi && !r.identifiers.nct && !r.identifiers.fda) {
      ctx.addIssue({ code: "custom", message: "An evidence record needs a PMID, DOI, NCT or FDA identifier" });
    }
    if ((r.recordType === "trial-registration" || r.recordType === "trial-status-change") && !r.identifiers.nct) {
      ctx.addIssue({ code: "custom", message: "Trial registry records need an NCT identifier" });
    }
  });
export type EvidenceRecord = z.infer<typeof EvidenceRecord>;

// ---------------------------------------------------------------------------
// Assessments, updates, claims, interventions
// ---------------------------------------------------------------------------

export const Grade = z.object({ confidence: Confidence, finding: Finding }).strict();
export type Grade = z.infer<typeof Grade>;

export const Assessment = z
  .object({
    confidence: Confidence,
    finding: Finding,
    evidenceBase: EvidenceBase,
    /** The population actually studied, in plain words. */
    population: text,
    /** Study design summary, e.g. "Many randomized trials". */
    design: text,
    outcomeType: OutcomeType,
    /** One line, plain English. */
    plain: text,
    /** The current assessment, a short paragraph. */
    summary: text,
    /** Why this grade: retained with every published assessment. */
    rationale: text,
    limitations: text,
    evidenceIds: z.array(slug),
  })
  .strict()
  .superRefine((a, ctx) => {
    if (a.evidenceBase === "animal" && a.finding !== "insufficient") {
      ctx.addIssue({
        code: "custom",
        path: ["finding"],
        message: "Animal-only evidence cannot support a human claim: the finding must be 'insufficient'",
      });
    }
  });
export type Assessment = z.infer<typeof Assessment>;

export const UpdateKind = z.enum(["first-assessment", "grade-change", "new-evidence", "correction"]);
export type UpdateKind = z.infer<typeof UpdateKind>;

export const ClaimUpdate = z
  .object({
    id: slug,
    kind: UpdateKind,
    /** Publication date of the reviewed update. Null only for fixtures (shown as a placeholder). */
    date: isoDate.nullable(),
    /** What changed, one or two sentences. */
    summary: text,
    /** Why the change matters (or why it does not move the grade). */
    whyItMatters: text,
    /** Reviewer's reasoning for the change. */
    reasoning: text,
    previous: Grade.nullable(),
    next: Grade,
    evidenceIds: z.array(slug),
    review: Review,
  })
  .strict()
  .superRefine((u, ctx) => {
    if (u.kind === "first-assessment" && u.previous !== null) {
      ctx.addIssue({ code: "custom", path: ["previous"], message: "A first assessment has no previous grade" });
    }
    if (u.kind !== "first-assessment" && u.previous === null) {
      ctx.addIssue({ code: "custom", path: ["previous"], message: "A change must record the previous assessment" });
    }
    if (u.kind === "grade-change" && u.previous && sameGrade(u.previous, u.next)) {
      ctx.addIssue({ code: "custom", path: ["next"], message: "A grade change must change confidence or finding" });
    }
    if (u.kind === "new-evidence" && u.previous && !sameGrade(u.previous, u.next)) {
      ctx.addIssue({ code: "custom", path: ["kind"], message: "Grade moved: use kind 'grade-change'" });
    }
  });
export type ClaimUpdate = z.infer<typeof ClaimUpdate>;

export function sameGrade(a: Grade, b: Grade): boolean {
  return a.confidence === b.confidence && a.finding === b.finding;
}

const fixtureFlags = z.discriminatedUnion("fixture", [
  /** Real content: may be published once approved. */
  z.object({ fixture: z.literal(false), illustrative: z.literal(false) }),
  /** Design fixture: never published. */
  z.object({ fixture: z.literal(true), illustrative: z.literal(true) }),
]);

export const Claim = z
  .object({
    schemaVersion: z.literal(SCHEMA_VERSION),
    id: slug,
    interventionId: slug,
    /** Short claim name, e.g. "Muscle strength". */
    title: text,
    /** Display order within its intervention. */
    order: z.number().int().nonnegative(),
    fixture: z.boolean(),
    illustrative: z.boolean(),
    assessment: Assessment,
    review: Review,
    /** Oldest first. The last entry's `next` must equal the current assessment's grade. */
    updates: z.array(ClaimUpdate).min(1),
  })
  .strict()
  .superRefine((c, ctx) => {
    const flags = fixtureFlags.safeParse({ fixture: c.fixture, illustrative: c.illustrative });
    if (!flags.success) {
      ctx.addIssue({ code: "custom", path: ["fixture"], message: "Fixtures must be illustrative, and real claims must not be" });
    }
    if (c.updates[0]?.kind !== "first-assessment") {
      ctx.addIssue({ code: "custom", path: ["updates", 0], message: "The first update must be the first assessment" });
    }
    const last = c.updates[c.updates.length - 1];
    if (last && !sameGrade(last.next, c.assessment)) {
      ctx.addIssue({ code: "custom", path: ["updates"], message: "The latest update must match the current grade" });
    }
    for (let i = 1; i < c.updates.length; i++) {
      const prev = c.updates[i - 1]!;
      const cur = c.updates[i]!;
      if (cur.previous && !sameGrade(cur.previous, prev.next)) {
        ctx.addIssue({ code: "custom", path: ["updates", i, "previous"], message: "Previous grade must match the prior update" });
      }
    }
    const ids = new Set<string>();
    for (const u of c.updates) {
      if (ids.has(u.id)) ctx.addIssue({ code: "custom", path: ["updates"], message: `Duplicate update id ${u.id}` });
      ids.add(u.id);
    }
    if (c.fixture) {
      if (c.review.status !== "unreviewed" || c.updates.some((u) => u.review.status !== "unreviewed")) {
        ctx.addIssue({ code: "custom", path: ["review"], message: "Fixtures must never carry approval metadata" });
      }
      if (c.assessment.evidenceIds.length > 0 || c.updates.some((u) => u.evidenceIds.length > 0 || u.date !== null)) {
        ctx.addIssue({ code: "custom", message: "Fixtures must not cite sources or carry real dates" });
      }
    } else if (c.updates.some((u) => u.date === null)) {
      ctx.addIssue({ code: "custom", path: ["updates"], message: "Real updates need a date" });
    }
  });
export type Claim = z.infer<typeof Claim>;

export const Intervention = z
  .object({
    schemaVersion: z.literal(SCHEMA_VERSION),
    id: slug,
    name: text,
    /** Display order in lists. */
    order: z.number().int().nonnegative(),
    summary: text,
    aliases: z.array(text).default([]),
    fixture: z.boolean(),
  })
  .strict();
export type Intervention = z.infer<typeof Intervention>;
