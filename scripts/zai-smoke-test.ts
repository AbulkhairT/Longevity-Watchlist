/**
 * Z.ai smoke test: one tiny request to the pinned model. Run in GitHub Actions
 * ("Z.ai smoke test" workflow). Prints only the HTTP status, the model name the
 * API returned, whether the reply parsed as JSON, and token counts. Never the
 * key, headers, or response body.
 */
import { loadPipelineConfig, PINNED_MODEL } from "../src/lib/pipeline-config";
import { createHttp } from "../src/pipeline/http";
import { chat, parseJsonReply, ZaiError } from "../src/pipeline/zai";

async function main(): Promise<number> {
  const cfg = loadPipelineConfig();
  const key = process.env.ZAI_API_KEY ?? "";
  if (!key) {
    console.error("ZAI_API_KEY is not set. Add it as a repository secret and run this from GitHub Actions.");
    return 2;
  }
  console.log(`Model requested: ${PINNED_MODEL}`);
  console.log(`Fields: response_format=${cfg.ai.sendResponseFormat ? "json_object" : "(not sent)"}, thinking=${cfg.ai.sendThinkingDisabled ? "disabled" : "(not sent)"}`);
  const http = createHttp({ label: "Z.ai", timeoutMs: cfg.ai.requestTimeoutSeconds * 1000, maxRetries: 0, minIntervalMs: 0, maxRequests: 1 });
  try {
    const r = await chat(http, cfg.ai, key, {
      system: "You are a test endpoint. Output only JSON.",
      user: 'Reply with the JSON {"ok": true}',
      maxTokens: 64,
    });
    const parsed = parseJsonReply(r.content);
    const ok = !!parsed && typeof parsed === "object" && (parsed as { ok?: unknown }).ok === true;
    console.log(`HTTP status: ${r.status}`);
    console.log(`Model returned by API: ${r.model ?? "(not reported)"}`);
    console.log(`Reply parsed as JSON: ${parsed !== null ? "yes" : "no"}${ok ? ' (matches {"ok": true})' : ""}`);
    console.log(`Tokens: prompt ${r.usage.promptTokens}, completion ${r.usage.completionTokens}, total ${r.usage.totalTokens}`);
    if (r.model && r.model.toLowerCase() !== PINNED_MODEL) {
      console.error(`WARNING: the API reported model "${r.model}", not "${PINNED_MODEL}". Do not enable drafting until this is understood.`);
      return 1;
    }
    if (parsed === null) {
      console.error("The reply was not JSON. Drafting validates every reply, but check before enabling drafting.");
      return 1;
    }
    console.log("Smoke test passed.");
    return 0;
  } catch (err) {
    if (err instanceof ZaiError) {
      console.error(`Smoke test failed: ${err.message}`);
      if (err.kind === "parameter" && (err.field === "thinking" || err.field === "response_format")) {
        console.error(`Set ai.${err.field === "thinking" ? "sendThinkingDisabled" : "sendResponseFormat"} to false in config/pipeline.json, then rerun.`);
      }
      return 1;
    }
    console.error("Smoke test failed with an unexpected error (details withheld).");
    return 1;
  }
}

main().then((code) => process.exit(code));
