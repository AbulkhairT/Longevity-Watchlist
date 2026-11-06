# Longevity Watchlist

A source-backed tracker of how the research behind wellness interventions changes, one claim at a time. Visitors follow interventions on their own device and see what changed since they last opened each claim.

Evidence is graded per claim, never per intervention, on five separate dimensions: confidence, finding, evidence base (human or animal, plus the studied population), study design, and outcome type (biomarker or health outcome). See [docs/EVIDENCE_RUBRIC.md](docs/EVIDENCE_RUBRIC.md), which the site also renders at `/methodology/`.

## Status

| Part                                                         | Status                         |
| ------------------------------------------------------------ | ------------------------------ |
| Content schemas, design fixtures, static site, RSS           | Working (Phase 1)              |
| Review and approval command, content-hash approval checks    | Not built yet (Phase 2)        |
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

## Content

```
content/          Published content. Only approved claims are built into the site.
  interventions/  One JSON file per intervention
  claims/         One JSON file per claim: assessment, review, update history
  evidence/       One JSON file per source (PMID, DOI, NCT or FDA identifier required)
fixtures/         Design fixtures. Illustrative, unreviewed, no sources, no dates.
drafts/           (Phase 2+) Candidates and AI drafts. Never read by the website.
```

Schemas live in [src/lib/schema.ts](src/lib/schema.ts) (Zod). They enforce, among other things:

- An animal-only evidence base must be graded "insufficient", and always displays as "Insufficient evidence (animal data only)".
- Every change keeps the previous grade, the new grade, and the reasoning; history must be consistent.
- A trial registration or status change is a different record type from a study result.
- Fixtures can never carry approval metadata, citations, or dates.

### Publication guards

- Builds default to published mode and read only `content/`.
- A fixture record found in `content/` fails the build.
- Unreviewed claims, or claims with unreviewed updates, are left out of the site.
- `LW_CONTENT_MODE=fixtures` is refused when `VERCEL_ENV=production` or `LW_DEPLOY_ENV=production`.
- `npm run check:export` scans the built output for fixture content.

## Local personalization

Follows and read updates are stored in `localStorage` under `longevity-watchlist:v1`. Interventions are followed by default. An update is marked read only when its claim's full detail is opened (the drawer or the claim page). The rotating "Since your last visit" list never marks anything read. If storage is blocked, the site still works and says that follows will reset. There are no accounts, analytics or tracking scripts.

## Deploying on Vercel (static, Hobby plan)

Not deployed by this project. To deploy it yourself:

1. Import the repository in Vercel. Framework preset: Next.js. Build command `npm run build`, output is the static `out/` directory produced by `output: "export"`.
2. Set `NEXT_PUBLIC_SITE_URL` to your production URL so feeds use absolute links.
3. Optional: to show the design fixtures on preview deployments only, set `LW_CONTENT_MODE=fixtures` for the **Preview** environment. Do not set it for Production; the build refuses.

Vercel Hobby is for personal, non-commercial use. Every merge to the production branch triggers a normal rebuild.

## Feeds

- `/feed.xml`: all reviewed updates.
- `/feeds/<intervention>.xml`: one per intervention.

Both are titled "Longevity Watchlist" and generated at build time.

## Credits

Fonts (Outfit, Inter) are self-hosted under the SIL Open Font License. See [NOTICE.md](NOTICE.md).
