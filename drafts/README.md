# drafts/

Work in progress. **Nothing in this directory is ever published or read by the website or the digest.**

- `candidates/`: records collected by the research pipeline, awaiting a person (Phase 3).
- `ai/`: raw AI responses and suggested assessments, kept separate from approved content (Phase 4).
- `claims/`, `evidence/`, `interventions/`: drafts a person is editing for approval.

To publish a draft claim, edit it until you agree with every word and source, then run:

```bash
npm run approve -- <claim-id> --reviewer "Your Name" --reasoning "Why the grade and wording are right"
```

The command validates the draft, records your name, the date, your reasoning and a content hash, and moves it into `content/`. Merging a draft without running it publishes nothing: the build only includes claims with a valid approval.
