import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { Claim, EvidenceRecord, Intervention } from "./schema";

/**
 * Loads site content at build time.
 *
 * - "published" (the default for every build) reads only `content/`, rejects
 *   fixture records outright and keeps only approved claims and updates.
 * - "fixtures" reads only `fixtures/` (design samples). It is refused on a
 *   production deployment so sample content can never be published.
 *
 * `drafts/` is never read by the website.
 */

export type ContentMode = "published" | "fixtures";

export interface ContentBundle {
  mode: ContentMode;
  interventions: Intervention[];
  claims: Claim[];
  evidence: EvidenceRecord[];
}

export class ContentError extends Error {
  override name = "ContentError";
}

export const ROOT = process.cwd();
export const PUBLISHED_DIR = path.join(ROOT, "content");
export const FIXTURES_DIR = path.join(ROOT, "fixtures");

export function resolveMode(env: Record<string, string | undefined> = process.env): ContentMode {
  const raw = env.LW_CONTENT_MODE?.trim() || "published";
  if (raw !== "published" && raw !== "fixtures") {
    throw new ContentError(`LW_CONTENT_MODE must be "published" or "fixtures", got "${raw}"`);
  }
  if (raw === "fixtures" && isProductionDeploy(env)) {
    throw new ContentError(
      "Refusing to build a production deployment from design fixtures. Unset LW_CONTENT_MODE for production.",
    );
  }
  return raw;
}

export function isProductionDeploy(env: Record<string, string | undefined>): boolean {
  return env.VERCEL_ENV === "production" || env.LW_DEPLOY_ENV === "production";
}

function readJsonDir<T>(dir: string, schema: z.ZodType<T>): T[] {
  if (!fs.existsSync(dir)) return [];
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort();
  return files.map((file) => {
    const full = path.join(dir, file);
    let raw: unknown;
    try {
      raw = JSON.parse(fs.readFileSync(full, "utf8"));
    } catch (err) {
      throw new ContentError(`${path.relative(ROOT, full)} is not valid JSON: ${(err as Error).message}`);
    }
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      throw new ContentError(`${path.relative(ROOT, full)} failed validation:\n${z.prettifyError(parsed.error)}`);
    }
    const id = (parsed.data as { id: string }).id;
    if (`${id}.json` !== file) {
      throw new ContentError(`${path.relative(ROOT, full)}: file name must match id "${id}"`);
    }
    return parsed.data;
  });
}

export interface RawContent {
  interventions: Intervention[];
  claims: Claim[];
  evidence: EvidenceRecord[];
}

export function readContentDir(dir: string): RawContent {
  return {
    interventions: readJsonDir(path.join(dir, "interventions"), Intervention),
    claims: readJsonDir(path.join(dir, "claims"), Claim),
    evidence: readJsonDir(path.join(dir, "evidence"), EvidenceRecord),
  };
}

/** Pluggable approval check, so the publication guard can verify content hashes. */
export type ApprovalCheck = (claim: Claim) => { ok: true } | { ok: false; reason: string };

const statusOnly: ApprovalCheck = (claim) =>
  claim.review.status === "approved" ? { ok: true } : { ok: false, reason: "not approved" };

/**
 * Reduce raw published-directory content to what may appear on the site.
 * Throws on anything that must never ship (fixtures, dangling references).
 */
export function selectPublishable(raw: RawContent, check: ApprovalCheck = statusOnly): Omit<ContentBundle, "mode"> & {
  skipped: { id: string; reason: string }[];
} {
  for (const r of [...raw.interventions, ...raw.claims]) {
    if (r.fixture) throw new ContentError(`Fixture record "${r.id}" found in content/. Fixtures live in fixtures/ only.`);
  }
  const skipped: { id: string; reason: string }[] = [];
  const claims: Claim[] = [];
  for (const claim of raw.claims) {
    const verdict = check(claim);
    if (!verdict.ok) {
      skipped.push({ id: claim.id, reason: verdict.reason });
      continue;
    }
    const updates = claim.updates.filter((u) => u.review.status === "approved");
    if (updates.length !== claim.updates.length) {
      skipped.push({ id: claim.id, reason: "has unapproved updates" });
      continue;
    }
    claims.push(claim);
  }
  const evidenceIds = new Set(raw.evidence.map((e) => e.id));
  for (const claim of claims) {
    const cited = [...claim.assessment.evidenceIds, ...claim.updates.flatMap((u) => u.evidenceIds)];
    for (const id of cited) {
      if (!evidenceIds.has(id)) throw new ContentError(`Claim "${claim.id}" cites missing evidence "${id}"`);
    }
  }
  const usedInterventions = new Set(claims.map((c) => c.interventionId));
  const interventions = raw.interventions.filter((i) => usedInterventions.has(i.id));
  for (const id of usedInterventions) {
    if (!interventions.some((i) => i.id === id)) throw new ContentError(`Unknown intervention "${id}"`);
  }
  const citedEvidence = new Set(claims.flatMap((c) => [...c.assessment.evidenceIds, ...c.updates.flatMap((u) => u.evidenceIds)]));
  const evidence = raw.evidence.filter((e) => citedEvidence.has(e.id));
  return { interventions, claims, evidence, skipped };
}

let cached: ContentBundle | null = null;

export function loadContent(): ContentBundle {
  if (cached) return cached;
  const mode = resolveMode();
  if (mode === "fixtures") {
    const raw = readContentDir(FIXTURES_DIR);
    for (const r of [...raw.interventions, ...raw.claims]) {
      if (!r.fixture) throw new ContentError(`fixtures/ must contain only fixture records; "${r.id}" is not marked fixture`);
    }
    if (raw.evidence.length) throw new ContentError("fixtures/ must not contain evidence records");
    cached = { mode, ...raw };
  } else {
    const { skipped, ...bundle } = selectPublishable(readContentDir(PUBLISHED_DIR));
    for (const s of skipped) console.warn(`[content] not published: ${s.id} (${s.reason})`);
    cached = { mode, ...bundle };
  }
  return cached;
}
