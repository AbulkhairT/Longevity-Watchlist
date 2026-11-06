import type { Confidence, EvidenceBase, Finding, Grade, OutcomeType, UpdateKind } from "./schema";

export const SITE_NAME = "Longevity Watchlist";
export const SITE_DESCRIPTION =
  "Tracks changes in the research behind wellness interventions, one claim at a time, with every grade tied to its sources.";

const CONFIDENCE_LABEL: Record<Confidence, string> = {
  high: "High",
  moderate: "Moderate",
  low: "Low",
  "very-low": "Very low",
};

/** Number of filled segments in the 4-segment confidence indicator. */
export const CONFIDENCE_LEVEL: Record<Confidence, number> = { "very-low": 1, low: 2, moderate: 3, high: 4 };

const FINDING_LABEL: Record<Finding, string> = {
  "supports-benefit": "Supports benefit",
  "no-meaningful-benefit": "No meaningful benefit found",
  mixed: "Mixed findings",
  "suggests-harm": "Suggests harm",
  insufficient: "Insufficient evidence",
};

export function confidenceLabel(c: Confidence): string {
  return CONFIDENCE_LABEL[c];
}

/**
 * Finding label. Animal-only evidence is never shown as a demonstrated human
 * effect: it always reads "Insufficient evidence (animal data only)".
 */
export function findingLabel(f: Finding, base: EvidenceBase): string {
  if (base === "animal") return "Insufficient evidence (animal data only)";
  return FINDING_LABEL[f];
}

export function outcomeLabel(o: OutcomeType): string {
  return o === "health-outcome" ? "Health outcome" : "Biomarker";
}

export function evidenceBaseLabel(b: EvidenceBase): string {
  return b === "human" ? "Human evidence" : "Animal evidence only";
}

export const UPDATE_KIND_LABEL: Record<UpdateKind, string> = {
  "first-assessment": "First assessment",
  "grade-change": "Grade change",
  "new-evidence": "New evidence",
  correction: "Correction",
};

/** "Confidence very low → low" or "New evidence, grade unchanged". No trailing period. */
export function changeLine(previous: Grade | null, next: Grade, base: EvidenceBase): string {
  if (!previous) return "First assessment";
  const parts: string[] = [];
  if (previous.confidence !== next.confidence) {
    parts.push(`Confidence ${confidenceLabel(previous.confidence).toLowerCase()} → ${confidenceLabel(next.confidence).toLowerCase()}`);
  }
  if (previous.finding !== next.finding) {
    parts.push(`Finding ${findingLabel(previous.finding, base).toLowerCase()} → ${findingLabel(next.finding, base).toLowerCase()}`);
  }
  return parts.length ? parts.join(". ") : "New evidence, grade unchanged";
}

/** Larger hero variant: "Very low → Low confidence". */
export function changeHero(previous: Grade | null, next: Grade, base: EvidenceBase): string {
  if (!previous) return "First assessment";
  if (previous.confidence !== next.confidence && previous.finding === next.finding) {
    return `${confidenceLabel(previous.confidence)} → ${confidenceLabel(next.confidence)} confidence`;
  }
  return changeLine(previous, next, base);
}

export function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export function formatDate(iso: string | null): string {
  if (!iso) return "[Date]";
  const [y, m, d] = iso.split("-").map(Number);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${d} ${months[(m ?? 1) - 1]} ${y}`;
}
