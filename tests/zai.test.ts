import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadPipelineConfig } from "@/lib/pipeline-config";
import { createHttp, type FetchLike } from "@/pipeline/http";
import { buildBody, chat, classify, parseJsonReply, ZaiError } from "@/pipeline/zai";

const cfg = loadPipelineConfig();
const KEY = "sk-test-SECRET-123";

function fakeFetch(responses: (() => Response)[], seen: { url: string; init?: RequestInit }[] = []): FetchLike {
  let i = 0;
  return async (url, init) => {
    seen.push({ url, init });
    const r = responses[Math.min(i++, responses.length - 1)]!;
    return r();
  };
}
const json = (status: number, body: unknown) => () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const http = (f: FetchLike, maxRequests = 5) =>
  createHttp({ label: "Z.ai", fetch: f, sleep: async () => {}, timeoutMs: 1000, maxRetries: 2, minIntervalMs: 0, maxRequests });
const req = { system: "s", user: "u", maxTokens: 64 };

describe("Z.ai request", () => {
  it("always uses the pinned model, endpoint and documented fields", () => {
    const body = buildBody(cfg.ai, { ...req, maxTokens: 99999 });
    expect(body).toMatchObject({
      model: "glm-4.7-flash",
      response_format: { type: "json_object" },
      thinking: { type: "disabled" },
      temperature: 0.2,
      max_tokens: cfg.ai.maxOutputTokensPerRequest,
      stream: false,
    });
    expect(cfg.ai.endpoint).toBe("https://api.z.ai/api/paas/v4/chat/completions");
  });

  it("drops only the switched-off field", () => {
    const body = buildBody({ ...cfg.ai, sendThinkingDisabled: false }, req);
    expect(body.thinking).toBeUndefined();
    expect(body.response_format).toEqual({ type: "json_object" });
  });

  it("sends the key only in the Authorization header", async () => {
    const seen: { url: string; init?: RequestInit }[] = [];
    const f = fakeFetch([json(200, { model: "glm-4.7-flash", choices: [{ message: { content: '{"ok": true}' } }], usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 } })], seen);
    const r = await chat(http(f), cfg.ai, KEY, req);
    expect(r).toMatchObject({ status: 200, model: "glm-4.7-flash", usage: { totalTokens: 8 } });
    expect(parseJsonReply(r.content)).toEqual({ ok: true });
    expect(seen[0]!.url).toBe("https://api.z.ai/api/paas/v4/chat/completions");
    expect((seen[0]!.init!.headers as Record<string, string>).Authorization).toBe(`Bearer ${KEY}`);
    expect(String(seen[0]!.init!.body)).not.toContain(KEY);
  });
});

describe("Z.ai errors", () => {
  const cases: [number, unknown, string][] = [
    [401, { error: { code: "1000", message: "Authentication Failed" } }, "auth"],
    [403, { error: { code: "1220", message: "no permission" } }, "auth"],
    [400, { error: { code: "1211", message: "Unknown Model, please check the model code." } }, "model"],
    [400, { error: { code: "1214", message: "Parameter thinking is invalid" } }, "parameter"],
    [402, { error: { message: "payment required" } }, "billing"],
    [429, { error: { code: "1113", message: "Insufficient balance or no resource package. Please recharge." } }, "billing"],
    [429, { error: { code: "1302", message: "Rate limit reached for requests" } }, "rate_limit"],
    [400, { error: { code: "1301", message: "sensitive content" } }, "content"],
  ];
  for (const [status, body, kind] of cases) {
    it(`${status} ${JSON.stringify(body).slice(0, 40)} → ${kind}, without leaking the key or body`, async () => {
      const err = await chat(http(fakeFetch([json(status, body)])), cfg.ai, KEY, req).catch((e) => e);
      expect(err).toBeInstanceOf(ZaiError);
      expect(err.kind).toBe(kind);
      expect(err.message).not.toContain(KEY);
      expect(err.message).not.toMatch(/Authentication Failed|Insufficient balance|sensitive content/);
    });
  }

  it("names the rejected field so the operator can switch only that one off", () => {
    expect(classify(400, "1214", "Parameter response_format is invalid")).toEqual({ kind: "parameter", field: "response_format" });
    expect(classify(400, "1214", "this model does not support thinking")).toEqual({ kind: "parameter", field: "thinking" });
  });

  it("retries 5xx at most twice, then stops", async () => {
    let calls = 0;
    const f: FetchLike = async () => {
      calls++;
      return new Response("upstream", { status: 503 });
    };
    const err = await chat(http(f), cfg.ai, KEY, req).catch((e) => e);
    expect(err.kind).toBe("transient");
    expect(calls).toBe(3);
  });

  it("never retries 429", async () => {
    let calls = 0;
    const f: FetchLike = async () => {
      calls++;
      return new Response(JSON.stringify({ error: { code: "1302" } }), { status: 429 });
    };
    await chat(http(f), cfg.ai, KEY, req).catch(() => {});
    expect(calls).toBe(1);
  });

  it("stops at the request cap", async () => {
    const h = http(fakeFetch([json(200, { choices: [{ message: { content: "{}" } }] })]), 1);
    await chat(h, cfg.ai, KEY, req);
    const err = await chat(h, cfg.ai, KEY, req).catch((e) => e);
    expect(err.kind).toBe("cap");
  });
});

describe("key isolation", () => {
  it("website code never references Z.ai, the key, or the pipeline", () => {
    const walk = (d: string): string[] =>
      fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
    for (const dir of ["src/app", "src/components"]) {
      for (const file of walk(path.join(process.cwd(), dir)).filter((f) => /\.(ts|tsx)$/.test(f))) {
        const src = fs.readFileSync(file, "utf8");
        expect(src, file).not.toMatch(/ZAI_|z\.ai|@\/pipeline|NEXT_PUBLIC_ZAI/i);
      }
    }
  });

  it("workflows pass the key only via secrets, and never use pull_request_target", () => {
    const dir = path.join(process.cwd(), ".github", "workflows");
    for (const f of fs.readdirSync(dir)) {
      const y = fs.readFileSync(path.join(dir, f), "utf8");
      expect(y, f).not.toMatch(/pull_request_target/);
      for (const line of y.split("\n").filter((l) => l.includes("ZAI_API_KEY") && l.includes(":") && !l.trim().startsWith("#"))) {
        expect(line.trim(), f).toBe("ZAI_API_KEY: ${{ secrets.ZAI_API_KEY }}");
      }
    }
  });
});
