# Longevity Watchlist

A source-backed tracker of how the research behind wellness interventions changes, one claim at a time. Visitors follow interventions on their own device and see what changed since they last opened each claim.

Evidence is graded per claim, never per intervention, on five separate dimensions: confidence, finding, evidence base (human or animal, plus the studied population), study design, and outcome type (biomarker or health outcome). See [docs/EVIDENCE_RUBRIC.md](docs/EVIDENCE_RUBRIC.md), which the site also renders at `/methodology/`.

## Status

| Part                                                         | Status                         |
| ------------------------------------------------------------ | ------------------------------ |
| Content schemas, design fixtures, static site, RSS           | Working (Phase 1)              |
| Review and approval command, content-hash approval checks, CI | Working (Phase 2)              |
| Weekly digest generator, digest page, monitoring log format  | Working, provider not connected or tested |
| Usage-limit config (model pin, caps, free-tier flag)         | Config and validation only; enforced from Phase 3 |
| PubMed and ClinicalTrials.gov collection, scheduled Action   | Not built yet (Phase 3)        |
| AI drafting with GLM-4.7-Flash                               | Not built yet, not verified (Phase 4) |

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

## Content

```
content/          Published content. Only approved claims are built into the site.
  interventions/  One JSON file per intervention
  claims/         One JSON file per claim: assessment, review, update history
  evidence/       One JSON file per source (PMID, DOI, NCT or FDA identifier required)
fixtures/         Design fixtures. Illustrative, unreviewed, no sources, no dates.
drafts/           Candidates, AI output and drafts being edited. Never read by the website or digest.
monitoring/runs/  What each collection run checked, per intervention. Not public content.
config/           pipeline.json (limits, model pin) and digest.json (prices, provider links).
```

Schemas live in [src/lib/schema.ts](src/lib/schema.ts) (Zod). They enforce, among other things:

- An animal-only evidence base must be graded "insufficient", and always displays as "Insufficient evidence (animal data only)".
- Every change keeps the previous grade, the new grade, and the reasoning; history must be consistent.
- A trial registration or status change is a different record type from a study result.
- Fixtures can never carry approval metadata, citations, or dates.

### Review and approval

AI and scripts only propose. A person publishes:

```bash
npm run approve -- <claim-id> --reviewer "Your Name" --reasoning "Why the grade and wording are right"
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

## GitHub settings

Not re-verified this session: docs.github.com was not reachable from here. Check the linked GitHub docs before relying on them.
- **CI** (`.github/workflows/ci.yml`) runs on every pull request with `contents: read` and no secrets.
- **Draft PRs from Actions (Phase 3)**: Settings → Actions → General → Workflow permissions → tick "Allow GitHub Actions to create and approve pull requests". The workflow requests only `contents: write` and `pull-requests: write`. Secrets are used only by the scheduled workflow on the default branch, never with `pull_request_target`.
- **Branch protection**: on GitHub Free, branch protection rules and rulesets are available for public repositories; private repositories need a paid plan. Recommended for main: require a pull request and require the CI check to pass.
- **Actions minutes**: standard runners are free for public repositories; private repositories on GitHub Free have a monthly allowance of free minutes (2,000 at the time of writing). The weekly schedule uses a few minutes per run.

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
