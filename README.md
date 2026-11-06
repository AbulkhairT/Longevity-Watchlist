# Longevity Watchlist

A source-backed tracker of how the research behind wellness interventions changes, one claim at a time. Visitors follow interventions on their own device and see what changed since they last opened each claim.

Evidence is graded per claim, never per intervention, on five separate dimensions: confidence, finding, evidence base (human or animal, plus the studied population), study design, and outcome type (biomarker or health outcome). See [docs/EVIDENCE_RUBRIC.md](docs/EVIDENCE_RUBRIC.md), which the site also renders at `/methodology/`.

## Status

Last checked 2026-11-06. "Tested live" means against the real service from this repository's code.

| Part | Status |
| --- | --- |
| Static site, schemas, fixtures, RSS, publication guards | Working. Built and checked in a browser |
| Review and approval command, content-hash checks, CI workflow | Working. Unit and CLI tests. CI workflow not yet run on GitHub |
| PubMed and ClinicalTrials.gov collectors | Working. **Tested live** (dry run and full run in a sandbox); unit tests use recorded responses |
| Search queries (`config/searches.json`) | Starting points only. **Need human tuning**: live results include off-topic trials |
| Scheduled collection workflow and draft PR | Written and statically tested. **Not yet run on GitHub** |
| Z.ai client and smoke test | Unit-tested with mocked responses. **No live call made**: needs the smoke-test workflow run |
| AI drafting with glm-4.7-flash | Unit-tested with mocked responses. **Off by default; never run live** |
| Weekly digest generator and page | Working. Newsletter provider not connected or tested |

There is no published, reviewed content yet. A production build therefore shows empty states. The design fixtures are illustrative samples and can never be published.

## Run it locally

Requires Node 20.9 or later.

```bash
npm install
```

```bash
npm run dev
```

`npm run dev` shows the design fixtures (`LW_CONTENT_MODE=fixtures`). Open http://localhost:3000.

## Scripts

| Command                         | What it does                                                         |
| ------------------------------- | -------------------------------------------------------------------- |
| `npm run build`                 | Static export of **published** content only, into `out/`             |
| `npm run build:fixtures`        | Static export of the design fixtures (previews only)                 |
| `npm run preview`               | Serves `out/` on http://localhost:4173                                |
| `npm run typecheck`             | TypeScript                                                            |
| `npm test`                      | Unit tests (schemas, publication guards, unread tracking, RSS)       |
| `npm run validate`              | Validates every content file and lists what would be published       |
| `npm run check:export`          | After a build: checks claim pages and feeds, and fails if any fixture content is in `out/` |
| `npm run approve -- <id> ...`   | A person approves an edited draft (see below)                        |
| `npm run digest -- --week <date>` | Builds the weekly digest files for review. Never sends anything    |
| `npm run digest -- --sample`    | Sample digest from fixtures, labelled sample data                    |
| `npm run collect:dry-run -- --claim <id> [--max 3]` | Fetches a few real PubMed and registry records for one claim and prints them. Writes nothing |
| `npm run collect`               | Full collection run (normally in GitHub Actions). Writes only `drafts/` |
| `npm run draft:ai`              | AI drafting of waiting candidates. Does nothing unless enabled (see below) |
| `npm run zai:smoke`             | One tiny Z.ai request (run it via the GitHub workflow, where the key lives) |
| `npm run pr:summary`            | Prints the draft PR text for the latest run                          |
| `npm run check`                 | Typecheck, tests and validation together                              |

## Content

```
content/          Published content. Only approved claims are built into the site.
  interventions/  One JSON file per intervention
  claims/         One JSON file per claim: assessment, review, update history
  evidence/       One JSON file per source (PMID, DOI, NCT or FDA identifier required)
fixtures/         Design fixtures. Illustrative, unreviewed, no sources, no dates.
drafts/           Never read by the website. Only the scheduled PR writes here.
  candidates/     Collected records (abstract or registry text, retrieval and revision dates)
  ai/             AI-suggested drafts, kept apart from approved assessments
  rejected/       AI replies that failed validation, with the reason
  checkpoints.json  Records already handled, so they are not collected again
  monitoring/runs/  Per-run, per-intervention counts (the digest reads only these counts)
  claims/, evidence/, interventions/  Drafts a person edits before approval
config/           pipeline.json (limits, model pin), searches.json (queries), digest.json (prices, links)
```

Schemas live in [src/lib/schema.ts](src/lib/schema.ts) (Zod). They enforce, among other things:

- An animal-only evidence base must be graded "insufficient", and always displays as "Insufficient evidence (animal data only)".
- Every change keeps the previous grade, the new grade, and the reasoning; history must be consistent.
- A trial registration or status change is a different record type from a study result.
- Fixtures can never carry approval metadata, citations, or dates.

### Review and approval

AI and scripts only propose. A person publishes:

```bash
npm run approve -- <claim-id> --reviewer "Your Name" --reason "Why the grade and wording are right"
```

The command takes the edited draft from `drafts/claims/` (or an edited file in `content/claims/` for re-approval), validates it, asks for confirmation, and records the reviewer, date, reasoning and a sha256 **content hash** of the claim and every source it cites. It refuses to run in CI. Any later edit to approved content, or to a source it cites, voids the approval: the claim drops out of the build, and `npm run validate` fails until someone re-approves it or reverts the edit.

### Publication guards

- Builds default to published mode and read only `content/`.
- A fixture record found in `content/` fails the build.
- Unreviewed claims, claims with unreviewed updates, and claims whose approval hash no longer matches are left out of the site.
- Merging a draft publishes nothing: the build never reads `drafts/`.
- `LW_CONTENT_MODE=fixtures` is refused when `VERCEL_ENV=production` or `LW_DEPLOY_ENV=production`.
- `npm run check:export` scans the built output for fixture content.

## Local personalization

Follows and read updates are stored in `localStorage` under `longevity-watchlist:v1`. Interventions are followed by default. An update is marked read only when its claim's full detail is opened (the drawer or the claim page). The rotating "Since your last visit" list never marks anything read. If storage is blocked, the site still works and says that follows will reset. There are no accounts, analytics or tracking scripts.

## Weekly digest (paid test)

The site offers a free weekly roundup and, as an early test, a personalized weekly digest for the interventions a reader chooses. Details:
- [docs/OPERATOR_GUIDE.md](docs/OPERATOR_GUIDE.md): weekly routine, tagging, requests, metrics, decision rule.
- [docs/PROVIDERS.md](docs/PROVIDERS.md): what was verified about Buttondown, Stripe and Vercel, and the recommended setup.
- [docs/USAGE_LIMITS.md](docs/USAGE_LIMITS.md): AI and collection caps, and paid-tier safeguards.

Prices and links live in `config/digest.json`. The paid offer is **off** (`paidOffer.enabled: false`) because Vercel Hobby forbids commercial use, including advertising a sale. Leave it off until the site is on a plan or host that permits commercial use. `npm run dev` previews it locally.

Signup asks only for an email and intervention choices, which become provider tags. There are no free-text fields and nothing about health. All assessments, sources, updates, RSS and corrections stay free.

## Research pipeline

Everything below runs only in GitHub Actions (or locally by you). The website never calls PubMed, ClinicalTrials.gov or Z.ai, and builds only from approved content in `content/`.

### Collection (`.github/workflows/collect.yml`)

Weekly on Mondays (06:23 UTC), and from the Actions tab with **Run workflow**. Each run:

1. Continues the `research/drafts` branch (or starts it from the default branch). It runs the default branch's code and refuses a branch that changes anything outside `drafts/`.
2. Searches PubMed (E-utilities esearch and efetch) and ClinicalTrials.gov (API v2) for each claim in `config/searches.json`.
   - Throttled to 2 requests/s without an NCBI key and 8/s with one (NCBI allows 3 and 10).
   - Timeouts, at most 2 retries for timeouts and 5xx only, pagination, bounded batches, and per-run caps from `config/pipeline.json`.
3. Deduplicates by PMID, DOI and NCT ID against `drafts/checkpoints.json` and published evidence, and links publications to their trial registrations when either record lists the other.
   - A registry record whose "last update posted" date is unchanged is skipped.
   - A changed date without a status or results change is recorded quietly.
   - A status or results change becomes a `trial-status-change` candidate.
4. Optionally drafts summaries with AI (below).
5. Commits only `drafts/` changes and opens or updates one **draft** PR. The PR lists per-intervention counts, request and token counts, caps hit, errors, and every new candidate. Merging it publishes nothing.

To try the collectors without AI or GitHub, run `npm run collect:dry-run -- --claim creatine-strength`. In a sandbox behind a proxy, add `NODE_USE_ENV_PROXY=1`.

### Z.ai smoke test (`.github/workflows/zai-smoke-test.yml`)

Run it before relying on AI drafting: **Actions tab → "Z.ai smoke test" → Run workflow**. It sends one tiny request to `glm-4.7-flash`. It prints only the HTTP status, the model name the API returned, whether the reply parsed as JSON, and token counts. Errors name the kind of failure: key problem (401/403), model or parameter rejected (400), billing or quota (402, or 429 with a balance code), or rate limit (429).

If it reports that `thinking` or `response_format` was rejected, set only that switch to `false` in `config/pipeline.json` (`sendThinkingDisabled` / `sendResponseFormat`). Every reply is validated with Zod either way. Never change the model.

### What was verified in Z.ai's documentation (2026-11-06)

- [Chat completion reference](https://docs.z.ai/api-reference/llm/chat-completion.md):
  - `POST https://api.z.ai/api/paas/v4/chat/completions` with `Authorization: Bearer <key>`.
  - Fields used: `response_format` (`json_object`), `thinking` (`enabled`/`disabled`), `temperature`, `max_tokens`.
  - The response carries `model`, `choices[].message.content` and `usage`.
  - **Its `model` list does not include `glm-4.7-flash`**. It lists glm-5.x, glm-4.7, glm-4.6 and the glm-5.3-flash family. Only the smoke test can confirm the ID is accepted.
- [Pricing](https://docs.z.ai/guides/overview/pricing.md): under "Other Pricing", GLM-4.7-Flash is "Free" for input, cached input, cached-input storage and output. The [GLM-4.7 page](https://docs.z.ai/guides/llm/glm-4.7.md) calls it "Lightweight, Completely Free". Paid look-alikes listed there include GLM-4.7 and GLM-4.7-FlashX.
- [Error codes](https://docs.z.ai/api-reference/api-code.md):
  - 1113 "Insufficient balance" is HTTP **429**, not 402, so the client treats 429 balance and quota codes as billing errors.
  - 1211 "Unknown Model" is HTTP 400.
- [API key notice](https://docs.z.ai/devpack/notice/api-key-management.md): from 16 October 2026, standard API keys and GLM Coding Plan keys are separate. A **Standard API Key** is billed against the account balance. Keep no balance or payment method on the account.
- The rate-limit page could not be read from this environment, so concurrency limits for this model were not verified. The pipeline sends one request at a time, at least 5 s apart.

### AI drafting (off by default)

When on, up to 10 waiting candidates per run are sent to `glm-4.7-flash`:
- one request at a time, at least 5 s apart, at most 15 requests per run;
- input is the retrieved abstract or registry text only, truncated to 6,000 characters and marked as untrusted data;
- output is fixed at 1,200 tokens.

Each reply must be strict JSON matching the draft schema, with "not reported" for missing values. It is rejected if it cites an identifier or number that isn't in the record. Valid suggestions go to `drafts/ai/`, rejected replies to `drafts/rejected/` with the reason. The AI only suggests whether a grade might change; it never approves or publishes.

On 401, 402, 403 or 429, a quota or billing code, an unknown or offline model, or repeated server errors, AI drafting stops for that run. Candidates are kept for manual preparation and the PR notes why. There is no fallback model.

Drafting runs only when **both** are true:
1. Repository variable `ZAI_DRAFTING_ENABLED` is `true`.
2. `config/pipeline.json` records the pricing check: `freeTierConfirmed: true` with your name, the date, and the pricing page URL. This is a reviewed commit.

With either off, the workflow collects only (manual mode).

### Manual workflow (no AI key needed)

Open the draft PR. For each candidate worth acting on, read the source at its PMID or NCT link and write or edit a claim in `drafts/claims/` (and evidence in `drafts/evidence/`). Then run `npm run approve` (see Review and approval). AI suggestions, when present, are only a starting point.

## GitHub settings

Verified against docs.github.com on 2026-11-06.

- **Workflow permissions**: Settings → Actions → General → Workflow permissions. Choose "Read and write permissions" and tick **"Allow GitHub Actions to create and approve pull requests"**; new personal repositories don't allow this by default. The collect job still declares only `contents: write` and `pull-requests: write`; everything else gets no permissions.
- **Secrets** (Settings → Secrets and variables → Actions → Secrets): `ZAI_API_KEY` (already added), optional `NCBI_API_KEY`.
- **Variables** (same page, Variables tab): `NCBI_TOOL` (e.g. `longevity-watchlist`), `NCBI_EMAIL` (a contact address for NCBI), `ZAI_DRAFTING_ENABLED` (`false` until the smoke test passes and you have checked pricing).
- **CI on the drafts PR**: PRs created with `GITHUB_TOKEN` start their `pull_request` workflow runs in an approval-required state. Approve the CI run on the PR when you want it, or rely on CI for the later approval PR.
- **Branch protection**: available for public repositories on GitHub Free (private repositories need Pro, Team or Enterprise). Recommended for the default branch: require a pull request and the CI check.
- **Actions usage**: standard GitHub-hosted runners are free in public repositories. For private repositories, GitHub Free includes $12 of compute per month (Linux runners cost $0.006 per minute). A weekly run takes a few minutes.

## Deploying on Vercel (static, Hobby plan)

Not deployed by this project. To deploy it yourself:

1. Import the repository in Vercel. Framework preset: Next.js. Build command `npm run build`, output is the static `out/` directory produced by `output: "export"`.
2. Set `NEXT_PUBLIC_SITE_URL` to your production URL so feeds use absolute links.
3. Optional: to show the design fixtures on preview deployments only, set `LW_CONTENT_MODE=fixtures` for the **Preview** environment. Do not set it for Production; the build refuses.

Vercel Hobby is for personal, non-commercial use. Its fair-use guidelines count requesting payment from visitors and advertising the sale of a product as commercial. Before you show or take payments for the digest, move to a plan or host that permits commercial use. Every merge to the production branch triggers a normal rebuild.

## Feeds

- `/feed.xml`: all reviewed updates.
- `/feeds/<intervention>.xml`: one per intervention.

Both are titled "Longevity Watchlist" and generated at build time.

## Credits

Fonts (Outfit, Inter) are self-hosted under the SIL Open Font License. See [NOTICE.md](NOTICE.md).
