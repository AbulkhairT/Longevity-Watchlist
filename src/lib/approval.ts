import { createHash } from "node:crypto";
import type { ApprovalCheck } from "./content";
import type { Claim, ClaimUpdate, EvidenceRecord, Review, Reviewer } from "./schema";

/**
 * Content hashes for approvals.
 *
 * A claim approval covers the claim's content (assessment, history, flags) and
 * every evidence record it cites. An update approval covers that update. Review
 * blocks themselves are excluded from hashing. Changing any covered byte after
 * approval voids the approval, so the claim drops out of the site until a
 * human approves it again.
 */

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
}

function sha256(s: string): string {
  return `sha256:${createHash("sha256").update(s).digest("hex")}`;
}

function stripUpdate(u: ClaimUpdate): Omit<ClaimUpdate, "review"> {
  const { review: _r, ...rest } = u;
  return rest;
}

export function citedEvidenceIds(claim: Claim): string[] {
  return [...new Set([...claim.assessment.evidenceIds, ...claim.updates.flatMap((u) => u.evidenceIds)])].sort();
}

export function updateHash(update: ClaimUpdate): string {
  return sha256(canonical(stripUpdate(update)));
}

export function claimHash(claim: Claim, evidence: readonly EvidenceRecord[]): string {
  const byId = new Map(evidence.map((e) => [e.id, e]));
  const cited = citedEvidenceIds(claim).map((id) => byId.get(id) ?? { missing: id });
  const { review: _r, updates, ...rest } = claim;
  return sha256(canonical({ claim: { ...rest, updates: updates.map(stripUpdate) }, evidence: cited }));
}

/** Approval check used by every published build, the validator and the digest. */
export function hashApprovalCheck(evidence: readonly EvidenceRecord[]): ApprovalCheck {
  return (claim) => {
    if (claim.review.status !== "approved") return { ok: false, reason: "not approved" };
    if (claim.review.contentHash !== claimHash(claim, evidence)) {
      return { ok: false, reason: "approval void: content or cited sources changed after approval" };
    }
    for (const u of claim.updates) {
      if (u.review.status !== "approved") return { ok: false, reason: `update ${u.id} not approved` };
      if (u.review.contentHash !== updateHash(u)) {
        return { ok: false, reason: `approval void: update ${u.id} changed after approval` };
      }
    }
    return { ok: true };
  };
}

export interface ApprovalInput {
  reviewer: Reviewer;
  reviewedAt: string;
  reasoning: string;
}

/**
 * Apply a human approval to a claim. Updates that already carry a valid
 * approval keep it; every other update is approved with this review.
 * Callers must obtain reviewer, date and reasoning from a person.
 */
export function approveClaim(claim: Claim, evidence: readonly EvidenceRecord[], input: ApprovalInput): Claim {
  if (claim.fixture) throw new Error("Fixtures cannot be approved");
  if (!input.reviewer.name.trim() || !input.reasoning.trim()) throw new Error("Reviewer name and reasoning are required");
  const updates = claim.updates.map((u) => {
    if (u.review.status === "approved" && u.review.contentHash === updateHash(u)) return u;
    const review: Review = { status: "approved", ...input, contentHash: updateHash(u) };
    return { ...u, review };
  });
  const next: Claim = { ...claim, updates };
  return { ...next, review: { status: "approved", ...input, contentHash: claimHash(next, evidence) } };
}
