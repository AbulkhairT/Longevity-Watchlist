import type { PipelineConfig } from "@/lib/pipeline-config";
import { PINNED_MODEL } from "@/lib/pipeline-config";
import { CapReachedError, HttpError, type HttpClient } from "./http";

/**
 * Z.ai chat completions client for GitHub Actions only.
 *
 * Verified 2026-11-06 against https://docs.z.ai/api-reference/llm/chat-completion.md:
 *   POST https://api.z.ai/api/paas/v4/chat/completions, "Authorization: Bearer <key>",
 *   fields model, messages, response_format {type: json_object}, thinking {type: disabled},
 *   temperature, max_tokens; response has model, choices[0].message.content, usage.
 * Error codes from https://docs.z.ai/api-reference/api-code.md (e.g. 1113 balance = HTTP 429,
 * 1211 unknown model = HTTP 400).
 *
 * The model is always PINNED_MODEL. There is no fallback model, ever.
 */

export type ZaiErrorKind =
  | "auth" // 401/403: key missing, wrong, expired, or no permission
  | "model" // 400: model unknown or taken offline
  | "parameter" // 400: a request field was rejected
  | "billing" // 402, or 429 with a balance/quota/plan code
  | "rate_limit" // 429 request rate / overload
  | "content" // 400: provider refused this input; skip the candidate
  | "too_long" // 400: prompt too long; skip the candidate
  | "transient" // timeouts / 5xx after retries
  | "cap" // per-run request cap reached
  | "bad_response"; // 200 but unusable body

/** Kinds that stop all AI drafting for the rest of the run. */
export const FATAL_KINDS: ReadonlySet<ZaiErrorKind> = new Set(["auth", "model", "parameter", "billing", "rate_limit", "cap", "transient"]);

export class ZaiError extends Error {
  override name = "ZaiError";
  constructor(
    readonly kind: ZaiErrorKind,
    readonly status: number,
    readonly code: string | null,
    /** Which request field was rejected, when the provider names a known one. */
    readonly field: string | null = null,
  ) {
    super(describe(kind, status, code, field));
  }
}

function describe(kind: ZaiErrorKind, status: number, code: string | null, field: string | null): string {
  const c = `HTTP ${status}${code ? `, Z.ai code ${code}` : ""}`;
  switch (kind) {
    case "auth":
      return `Key problem (${c}): ZAI_API_KEY is missing, invalid, expired, or lacks access. Check the repository secret.`;
    case "model":
      return `Model rejected (${c}): "${PINNED_MODEL}" is unknown or offline. Not switching models; use the manual workflow.`;
    case "parameter":
      return `Request parameter rejected (${c})${field ? `: "${field}"` : ""}. See README for the documented field switches.`;
    case "billing":
      return `Billing or quota error (${c}). Stopping. Do not add a payment method; use the manual workflow.`;
    case "rate_limit":
      return `Rate limited (${c}). Stopping AI drafting for this run.`;
    case "content":
      return `Provider refused this input (${c}). Candidate left for manual preparation.`;
    case "too_long":
      return `Input too long (${c}). Candidate left for manual preparation.`;
    case "transient":
      return `Temporary failure after retries (${c}). Stopping AI drafting for this run.`;
    case "cap":
      return "Per-run AI request cap reached. Remaining candidates wait for the next run.";
    case "bad_response":
      return `Unusable response (${c}).`;
  }
}

const BILLING_CODES = new Set(["1113", "1308", "1309", "1310", "1311", "1313", "1314", "1315", "1316", "1317", "1318", "1319", "1320", "1321"]);
const KNOWN_FIELDS = ["response_format", "thinking", "max_tokens", "temperature", "messages", "model"];

/** Classify a non-2xx response from status, provider code and (only) a field name in the message. */
export function classify(status: number, code: string | null, message: string): { kind: ZaiErrorKind; field: string | null } {
  const field = KNOWN_FIELDS.find((f) => message.toLowerCase().includes(f)) ?? null;
  if (status === 401 || status === 403) return { kind: "auth", field: null };
  if (status === 402) return { kind: "billing", field: null };
  if (status === 429) {
    if (code && BILLING_CODES.has(code)) return { kind: "billing", field: null };
    if (/balance|quota|recharge|package|plan|limit exhausted/i.test(message) && code !== "1302") return { kind: "billing", field: null };
    return { kind: "rate_limit", field: null };
  }
  if (status === 400) {
    if (code === "1211" || code === "1221" || code === "1222" || (field === "model" && code !== "1301")) return { kind: "model", field: "model" };
    if (code === "1301") return { kind: "content", field: null };
    if (code === "1261") return { kind: "too_long", field: null };
    return { kind: "parameter", field };
  }
  return { kind: "bad_response", field: null };
}

export interface ChatRequest {
  system: string;
  user: string;
  maxTokens: number;
}

export interface ChatResult {
  status: number;
  model: string | null;
  content: string;
  finishReason: string | null;
  usage: { promptTokens: number; completionTokens: number; totalTokens: number };
}

export const ZAI_ENDPOINT = "https://api.z.ai/api/paas/v4/chat/completions";

export function buildBody(cfg: PipelineConfig["ai"], req: ChatRequest): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: PINNED_MODEL,
    messages: [
      { role: "system", content: req.system },
      { role: "user", content: req.user },
    ],
    temperature: cfg.temperature,
    max_tokens: Math.min(req.maxTokens, cfg.maxOutputTokensPerRequest),
    stream: false,
  };
  if (cfg.sendResponseFormat) body.response_format = { type: "json_object" };
  if (cfg.sendThinkingDisabled) body.thinking = { type: "disabled" };
  return body;
}

export async function chat(http: HttpClient, cfg: PipelineConfig["ai"], apiKey: string, req: ChatRequest): Promise<ChatResult> {
  if (cfg.model !== PINNED_MODEL) throw new ZaiError("model", 0, null, "model");
  if (!apiKey) throw new ZaiError("auth", 0, null);
  let res: Response;
  try {
    res = await http.request(cfg.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(buildBody(cfg, req)),
    });
  } catch (err) {
    if (err instanceof CapReachedError) throw new ZaiError("cap", 0, null);
    if (err instanceof HttpError) throw new ZaiError("transient", err.status, null);
    throw new ZaiError("transient", 0, null);
  }
  const text = await res.text().catch(() => "");
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  if (!res.ok) {
    const err = (json as { error?: { code?: unknown; message?: unknown } } | null)?.error;
    const code = err?.code != null ? String(err.code).replace(/[^0-9A-Za-z_-]/g, "").slice(0, 12) : null;
    const message = typeof err?.message === "string" ? err.message : "";
    const { kind, field } = classify(res.status, code, message);
    throw new ZaiError(kind, res.status, code, field);
  }
  const body = json as {
    model?: unknown;
    choices?: { message?: { content?: unknown }; finish_reason?: unknown }[];
    usage?: { prompt_tokens?: unknown; completion_tokens?: unknown; total_tokens?: unknown };
  } | null;
  const content = body?.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new ZaiError("bad_response", res.status, null);
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  return {
    status: res.status,
    model: typeof body?.model === "string" ? body.model.slice(0, 64) : null,
    content,
    finishReason: typeof body?.choices?.[0]?.finish_reason === "string" ? (body.choices[0]!.finish_reason as string) : null,
    usage: {
      promptTokens: n(body?.usage?.prompt_tokens),
      completionTokens: n(body?.usage?.completion_tokens),
      totalTokens: n(body?.usage?.total_tokens),
    },
  };
}

/** Parse a model reply as JSON, tolerating a ```json fence. Returns null when it is not JSON. */
export function parseJsonReply(content: string): unknown {
  const trimmed = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}
