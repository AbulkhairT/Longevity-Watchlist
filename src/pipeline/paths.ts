import path from "node:path";

/** Everything the pipeline writes lives under drafts/ (never read by the website). */
export const DRAFTS = path.join(process.cwd(), "drafts");
export const CANDIDATES_DIR = path.join(DRAFTS, "candidates");
export const AI_DIR = path.join(DRAFTS, "ai");
export const REJECTED_DIR = path.join(DRAFTS, "rejected");
export const CHECKPOINT_FILE = path.join(DRAFTS, "checkpoints.json");
export const RUNS_DIR = path.join(DRAFTS, "runs");
export const LATEST_RUN_FILE = path.join(RUNS_DIR, "latest-run-id");
export const MONITORING_RUNS_DIR = path.join(DRAFTS, "monitoring", "runs");
