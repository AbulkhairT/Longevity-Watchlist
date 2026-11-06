import fs from "node:fs";
import path from "node:path";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Search configuration (config/searches.json)
// ---------------------------------------------------------------------------

const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

export const SearchConfig = z
  .object({
    $comment: z.string().optional(),
    schemaVersion: z.literal(1),
    searches: z.array(
      z
        .object({
          claimId: slug,
          interventionId: slug,
          /** True until a person has tuned and checked the query. */
          needsHumanTuning: z.boolean(),
          pubmed: z.object({ term: z.string().min(3) }).strict().nullable(),
          clinicaltrials: z
            .object({ intervention: z.string().min(2), term: z.string().min(1).optional() })
            .strict()
            .nullable(),
        })
        .strict(),
    ),
  })
  .strict();
export type SearchConfig = z.infer<typeof SearchConfig>;
export type ClaimSearch = SearchConfig["searches"][number];

export function loadSearchConfig(file = path.join(process.cwd(), "config", "searches.json")): SearchConfig {
  return SearchConfig.parse(JSON.parse(fs.readFileSync(file, "utf8")));
}

// ---------------------------------------------------------------------------
// Parsed source records
// ---------------------------------------------------------------------------

export interface PubmedRecord {
  pmid: string;
  doi: string | null;
  title: string;
  abstract: string;
  journal: string | null;
  publicationTypes: string[];
  /** YYYY-MM-DD when complete, else YYYY-MM or YYYY. */
  publishedDate: string | null;
  /** MEDLINE DateRevised. Indexing changes; not treated as a new finding. */
  revisedDate: string | null;
  /** NCT IDs listed in the record's DataBankList or abstract. */
  trialIds: string[];
}

export interface TrialRecord {
  nct: string;
  title: string;
  status: string;
  /** Registry "last update posted" date: the revision marker. */
  lastUpdatePostDate: string | null;
  firstPostDate: string | null;
  hasResults: boolean;
  studyType: string | null;
  phases: string[];
  enrollment: number | null;
  conditions: string[];
  interventions: string[];
  summary: string;
  primaryOutcomes: string[];
  eligibility: string;
  /** PMIDs listed in the registry's references. */
  pmids: string[];
}

// ---------------------------------------------------------------------------
// Candidates (drafts/candidates/*.json) and checkpoints (drafts/checkpoints.json)
// ---------------------------------------------------------------------------

const date = z.string().regex(/^\d{4}(-\d{2}(-\d{2})?)?$/);

export const Candidate = z
  .object({
    schemaVersion: z.literal(1),
    id: slug,
    source: z.enum(["pubmed", "clinicaltrials.gov"]),
    /** study-result: a publication. trial-registration: a newly seen registry record. trial-status-change: a revised one. */
    recordType: z.enum(["study-result", "trial-registration", "trial-status-change"]),
    claimIds: z.array(slug).min(1),
    interventionIds: z.array(slug).min(1),
    identifiers: z
      .object({
        pmid: z.string().regex(/^\d+$/).optional(),
        doi: z.string().optional(),
        nct: z.string().regex(/^NCT\d{8}$/).optional(),
      })
      .strict(),
    /** Other records of the same trial: NCT IDs for publications, PMIDs for trials. */
    linkedTrialIds: z.array(z.string().regex(/^NCT\d{8}$/)),
    linkedPmids: z.array(z.string().regex(/^\d+$/)),
    title: z.string(),
    url: z.string().url(),
    /** The retrieved abstract or registry text. Untrusted input. */
    text: z.string(),
    abstractAvailable: z.boolean(),
    publicationTypes: z.array(z.string()),
    publishedDate: date.nullable(),
    sourceRevisionDate: date.nullable(),
    trial: z
      .object({
        status: z.string(),
        hasResults: z.boolean(),
        studyType: z.string().nullable(),
        phases: z.array(z.string()),
        enrollment: z.number().int().nullable(),
        conditions: z.array(z.string()),
      })
      .strict()
      .nullable(),
    /** For revised trials: what the previous checkpoint recorded. */
    previous: z
      .object({ status: z.string().nullable(), revisionDate: z.string().nullable(), hasResults: z.boolean().nullable() })
      .strict()
      .nullable(),
    retrievedAt: z.string().datetime({ offset: true }),
    runId: z.string(),
  })
  .strict();
export type Candidate = z.infer<typeof Candidate>;

export const CheckpointEntry = z
  .object({
    firstSeen: z.string(),
    runId: z.string(),
    /** For trials: registry last-update date, status and results flag at last check. */
    revision: z.string().nullable().optional(),
    status: z.string().nullable().optional(),
    hasResults: z.boolean().nullable().optional(),
  })
  .strict();

export const Checkpoint = z
  .object({
    schemaVersion: z.literal(1),
    updatedAt: z.string().nullable(),
    /** Keys: "pmid:<id>", "doi:<lowercased doi>", "nct:<NCT id>". */
    records: z.record(z.string(), CheckpointEntry),
  })
  .strict();
export type Checkpoint = z.infer<typeof Checkpoint>;

export const EMPTY_CHECKPOINT: Checkpoint = { schemaVersion: 1, updatedAt: null, records: {} };
