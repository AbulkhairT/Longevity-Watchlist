# Usage limits and paid-tier safeguards

All limits live in [config/pipeline.json](../config/pipeline.json) and are validated by `src/lib/pipeline-config.ts`. Only a person edits that file, in a reviewed pull request.

## Model pin

- The model ID is exactly `glm-4.7-flash`. The schema rejects any other value, so a fallback to GLM-4.7 or any paid model can't happen automatically or as an error fix.
- `freeTierConfirmed` is `false`. A person sets it to `true` only after reading Z.ai's official pricing page and confirming `glm-4.7-flash` is still free. They also record `freeTierConfirmedBy`, `freeTierConfirmedOn` and `freeTierSource`; the schema refuses `true` without them.
- If the model stops being free, set the flag back to `false`. The pipeline continues in manual mode: candidates are saved for a person to prepare.
- Endpoint, auth header and request fields were checked against Z.ai's official API reference on 2026-11-06 (see README, "What was verified"). The reference's model list does not include `glm-4.7-flash`; the smoke-test workflow is the proof that the ID is accepted.
- Two human switches must both be on before any AI call: the repository variable `ZAI_DRAFTING_ENABLED=true`, and the recorded pricing check in this config.

## Caps per scheduled run (defaults)

| Limit | Default |
| --- | --- |
| New candidates sent to AI | 10 |
| AI requests | 15, one at a time, at least 5 s apart |
| Input per candidate | the retrieved abstract or trial record only, truncated to 6,000 characters |
| Output tokens per request | 1,200 |
| Transient retries (timeouts, 5xx) | at most 2, with backoff |
| PubMed requests | 60 per run, at most 2 per second without a key and 8 with one (NCBI allows 3 and 10) |
| ClinicalTrials.gov requests | 40 per run, at least 1 s apart |
| New candidates per run | 60 |
| Schedule | weekly, plus manual dispatch for testing |

When a cap is reached, the run stops, saves checkpoints, and leaves the remaining candidates for the next run.

## Errors

On HTTP 401, 402, 403 or 429 (Z.ai reports "insufficient balance" as 429 with code 1113), an unknown or offline model (400, codes 1211/1221), or any quota, billing or authentication error, AI drafting stops for the rest of that run. Candidates are saved for manual preparation, and the error is reported in the draft PR. Secrets and full prompts are never logged.

## Account hygiene

- **Keep no payment method and no prepaid balance on the Z.ai account**, so a mistake can't create charges.
- Store the API key only as a GitHub Actions secret (`ZAI_API_KEY`), used only by the scheduled workflow on the default branch, never by `pull_request_target` or untrusted PR code.

## Per-run usage report

Each draft PR lists: papers screened and trial records checked per intervention, candidates collected, candidates sent to AI, AI requests made, input and output tokens as reported by the API, caps hit, and errors. The same counts are stored in `drafts/monitoring/runs/<run>.json`.
