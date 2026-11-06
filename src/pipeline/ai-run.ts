import fs from "node:fs";
import path from "node:path";
import { aiDraftingAllowed, PINNED_MODEL, type PipelineConfig } from "../lib/pipeline-config";
import { createHttp, type FetchLike } from "./http";
import { systemPrompt, userPrompt, validateDraft, type ClaimContext, type RejectedDraft, type StoredAiDraft, StoredAiDraft as StoredSchema } from "./draft";
import { Candidate } from "./types";
import { chat, FATAL_KINDS, parseJsonReply, ZaiError } from "./zai";

/**
 * One AI drafting pass over waiting candidates. Called by the scheduled
 * workflow after collection, only when both human switches are on.
 */

export interface AiRunDirs {
  candidates: string;
  ai: string;
  rejected: string;
}

export interface AiRunOptions {
  cfg: PipelineConfig;
  env: Record<string, string | undefined>;
  dirs: AiRunDirs;
  runId: string;
  claims: ReadonlyMap<string, ClaimContext>;
  fetch?: FetchLike;
  sleep?: (ms: number) => Promise<void>;
  now?: () => Date;
}

export interface AiRunResult {
  enabled: boolean;
  candidatesSent: number;
  requests: number;
  promptTokens: number;
  completionTokens: number;
  drafted: number;
  rejected: number;
  waiting: number;
  stopReason: string | null;
}

function readCandidates(dir: string): Candidate[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => Candidate.parse(JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"))))
    .sort((a, b) => (a.retrievedAt === b.retrievedAt ? a.id.localeCompare(b.id) : a.retrievedAt < b.retrievedAt ? -1 : 1));
}

/** Candidates with no AI draft and no rejection yet. A revised trial is drafted again. */
export function waitingCandidates(dirs: AiRunDirs): Candidate[] {
  return readCandidates(dirs.candidates).filter((c) => {
    for (const dir of [dirs.ai, dirs.rejected]) {
      const f = path.join(dir, `${c.id}.json`);
      if (!fs.existsSync(f)) continue;
      const prior = JSON.parse(fs.readFileSync(f, "utf8")) as { runId?: string; createdAt?: string };
      if ((prior.createdAt ?? "") >= c.retrievedAt) return false;
    }
    return true;
  });
}

function write(dir: string, id: string, data: unknown) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${id}.json`), `${JSON.stringify(data, null, 2)}\n`);
}

export async function runAiDrafting(o: AiRunOptions): Promise<AiRunResult> {
  const result: AiRunResult = {
    enabled: false,
    candidatesSent: 0,
    requests: 0,
    promptTokens: 0,
    completionTokens: 0,
    drafted: 0,
    rejected: 0,
    waiting: 0,
    stopReason: null,
  };
  const waiting = waitingCandidates(o.dirs);
  result.waiting = waiting.length;
  const gate = aiDraftingAllowed(o.cfg, o.env);
  if (!gate.ok) {
    result.stopReason = `AI drafting off: ${gate.reason}. Candidates are kept for manual preparation.`;
    return result;
  }
  result.enabled = true;
  const now = o.now ?? (() => new Date());
  const ai = o.cfg.ai;
  const http = createHttp({
    label: "Z.ai",
    fetch: o.fetch,
    sleep: o.sleep,
    timeoutMs: ai.requestTimeoutSeconds * 1000,
    maxRetries: ai.maxTransientRetries,
    minIntervalMs: ai.minSecondsBetweenRequests * 1000,
    maxRequests: ai.maxRequestsPerRun,
  });
  const key = o.env.ZAI_API_KEY ?? "";

  for (const cand of waiting.slice(0, ai.maxCandidatesPerRun)) {
    const claims = cand.claimIds.map(
      (id) => o.claims.get(id) ?? { id, title: id, intervention: cand.interventionIds.join(", "), publishedGrade: null },
    );
    const user = userPrompt(cand, ai.maxInputCharsPerCandidate);
    result.candidatesSent++;
    const createdAt = now().toISOString();
    try {
      const reply = await chat(http, ai, key, { system: systemPrompt(claims), user: user.text, maxTokens: ai.maxOutputTokensPerRequest });
      result.promptTokens += reply.usage.promptTokens;
      result.completionTokens += reply.usage.completionTokens;
      const parsed = parseJsonReply(reply.content);
      const verdict = parsed === null ? { ok: false as const, reason: "Reply was not JSON" } : validateDraft(parsed, cand);
      if (!verdict.ok) {
        const rej: RejectedDraft = {
          schemaVersion: 1,
          candidateId: cand.id,
          runId: o.runId,
          createdAt,
          reason: reply.finishReason === "length" ? `${verdict.reason} (reply hit the token limit)` : verdict.reason,
          modelReported: reply.model,
          response: reply.content.slice(0, 4000),
        };
        write(o.dirs.rejected, cand.id, rej);
        result.rejected++;
        continue;
      }
      const stored: StoredAiDraft = StoredSchema.parse({
        schemaVersion: 1,
        candidateId: cand.id,
        label: "AI-suggested draft. Not reviewed. Not published.",
        model: PINNED_MODEL,
        modelReported: reply.model,
        createdAt,
        runId: o.runId,
        input: { source: cand.source, chars: user.chars, truncated: user.truncated, abstractOnly: true },
        usage: { promptTokens: reply.usage.promptTokens, completionTokens: reply.usage.completionTokens },
        suggestion: verdict.draft,
      });
      write(o.dirs.ai, cand.id, stored);
      result.drafted++;
    } catch (err) {
      if (err instanceof ZaiError && !FATAL_KINDS.has(err.kind)) {
        write(o.dirs.rejected, cand.id, {
          schemaVersion: 1,
          candidateId: cand.id,
          runId: o.runId,
          createdAt,
          reason: err.message,
          modelReported: null,
          response: null,
        } satisfies RejectedDraft);
        result.rejected++;
        continue;
      }
      result.candidatesSent--; // not processed; it waits for the next run
      result.stopReason = err instanceof ZaiError ? err.message : "Unexpected error; AI drafting stopped for this run.";
      break;
    } finally {
      result.requests = http.requests;
    }
  }
  if (!result.stopReason && waiting.length > ai.maxCandidatesPerRun) {
    result.stopReason = `Candidate cap of ${ai.maxCandidatesPerRun} reached; ${waiting.length - ai.maxCandidatesPerRun} wait for the next run.`;
  }
  return result;
}
