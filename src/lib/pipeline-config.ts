import fs from "node:fs";
import path from "node:path";
import { z } from "zod";

/**
 * Pipeline limits, from config/pipeline.json. The model ID is a literal: the
 * schema rejects anything except "glm-4.7-flash", so switching models (for
 * example to a paid GLM model) needs a deliberate human edit to both the
 * config and this schema, reviewed in a pull request.
 */
export const PINNED_MODEL = "glm-4.7-flash" as const;

const positiveInt = z.number().int().positive();

export const PipelineConfig = z
  .object({
    $comment: z.string().optional(),
    schemaVersion: z.literal(1),
    schedule: z.literal("weekly"),
    ai: z
      .object({
        provider: z.literal("z.ai"),
        model: z.literal(PINNED_MODEL),
        endpoint: z.string().url().startsWith("https://api.z.ai/"),
        /** Set to true only by a person who checked Z.ai's official pricing page that this model is free. */
        freeTierConfirmed: z.boolean(),
        freeTierConfirmedBy: z.string().nullable(),
        freeTierConfirmedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
        freeTierSource: z.string().url().nullable(),
        maxCandidatesPerRun: positiveInt.max(10),
        maxRequestsPerRun: positiveInt.max(15),
        maxConcurrentRequests: z.literal(1),
        minSecondsBetweenRequests: z.number().min(3),
        maxInputCharsPerCandidate: positiveInt.max(12000),
        maxOutputTokensPerRequest: positiveInt.max(2000),
        requestTimeoutSeconds: positiveInt.max(120),
        maxTransientRetries: z.number().int().min(0).max(2),
        stopOnStatus: z.array(z.number().int()).refine((s) => [401, 402, 403, 429].every((c) => s.includes(c)), {
          message: "Must stop on 401, 402, 403 and 429",
        }),
      })
      .strict()
      .superRefine((ai, ctx) => {
        if (ai.freeTierConfirmed && (!ai.freeTierConfirmedBy || !ai.freeTierConfirmedOn || !ai.freeTierSource)) {
          ctx.addIssue({ code: "custom", message: "freeTierConfirmed needs who confirmed it, when, and the pricing page URL" });
        }
      }),
    collection: z
      .object({
        pubmed: z.object({
          maxRequestsPerRun: positiveInt.max(200),
          /** NCBI allows 3/s without a key and 10/s with one; stay below both. */
          requestsPerSecondWithoutKey: z.number().positive().max(3),
          requestsPerSecondWithKey: z.number().positive().max(10),
          maxResultsPerQuery: positiveInt.max(100),
          lookbackDays: positiveInt.max(60),
        }),
        clinicaltrials: z.object({
          maxRequestsPerRun: positiveInt.max(200),
          minSecondsBetweenRequests: z.number().min(0.5),
          pageSize: positiveInt.max(100),
          maxPagesPerQuery: positiveInt.max(10),
        }),
        requestTimeoutSeconds: positiveInt.max(120),
        maxTransientRetries: z.number().int().min(0).max(2),
      })
      .strict(),
  })
  .strict();
export type PipelineConfig = z.infer<typeof PipelineConfig>;

export function loadPipelineConfig(file = path.join(process.cwd(), "config", "pipeline.json")): PipelineConfig {
  return PipelineConfig.parse(JSON.parse(fs.readFileSync(file, "utf8")));
}

/** Gate checked before a run's first AI call. False means manual mode. */
export function aiDraftingAllowed(cfg: PipelineConfig, env: Record<string, string | undefined> = process.env): { ok: boolean; reason: string } {
  if (!cfg.ai.freeTierConfirmed) return { ok: false, reason: "free tier not confirmed by a human in config/pipeline.json" };
  if (!env.ZAI_API_KEY) return { ok: false, reason: "ZAI_API_KEY is not set" };
  return { ok: true, reason: "free tier confirmed" };
}
