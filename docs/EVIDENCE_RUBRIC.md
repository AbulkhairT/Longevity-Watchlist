# How we grade evidence

Longevity Watchlist grades **claims**, not interventions. "Creatine" has no grade. "Creatine improves muscle strength in adults who resistance train" does. Each claim is graded on five separate dimensions, and none of them stands in for another.

## The five dimensions

- **Confidence**: how much we trust the body of evidence for this claim. It is not the size of the effect, and high confidence does not mean the intervention works. High confidence that something does nothing is a common and useful result.
- **Finding**: what the evidence shows, in one of five words: supports benefit, no meaningful benefit found, mixed findings, suggests harm, or insufficient evidence.
- **Evidence base**: whether the data come from humans or only from animals, plus the population actually studied (for example "generally healthy adults over 50, not selected for deficiency").
- **Study design**: the kinds of studies behind the grade, such as large randomized trials, small randomized trials, observational cohorts, meta-analyses, or animal studies.
- **Outcome type**: whether the studies measured a **health outcome** people feel or die from (fractures, heart attacks, strength, death) or a **biomarker** (blood NAD+, blood pressure, insulin sensitivity). A biomarker change is not a health outcome, and we never present one as the other.

## Confidence levels

We start from the study design and move down, or occasionally up, for specific reasons. The approach follows the logic of GRADE, simplified for public reading.

- **High**: several well-conducted randomized trials, or a sound meta-analysis of them, in people like the claim describes, measuring the claim's outcome, with consistent results. Further research is unlikely to change the conclusion.
- **Moderate**: randomized evidence with one important weakness, such as some inconsistency, a population that differs from the claim, or limited precision. Further research could change the conclusion.
- **Low**: small or short trials, trials with serious weaknesses, or consistent observational evidence. Further research is likely to change the conclusion.
- **Very low**: a single small study, conflicting low-quality studies, indirect evidence from related compounds, or animal data only.

Randomized human trials start at high. Observational human studies start at low. We move down one level for each serious problem with:

- **Risk of bias**: poor randomization or blinding, high dropout, selective reporting.
- **Inconsistency**: studies disagree without a good explanation.
- **Indirectness**: a different population, a different compound or dose, or a biomarker standing in for a health outcome.
- **Imprecision**: few participants or events, wide uncertainty.
- **Publication bias**: signs that negative results are missing.

Observational evidence can move up one level for a very large effect or a clear dose response, and only when confounding is unlikely to explain it.

## Findings

- **Supports benefit**: the best evidence shows a benefit on the claim's outcome that is large enough to matter.
- **No meaningful benefit found**: adequate studies looked and found no benefit, or one too small to matter.
- **Mixed findings**: comparable studies disagree and the disagreement is not explained.
- **Suggests harm**: the evidence points to more of the bad outcome, or a new harm, with the intervention.
- **Insufficient evidence**: there is not enough human evidence on this outcome to say.

## Animal data

Animal studies can be important early signals, but they do not show what happens in people. **A claim about people that is supported only by animal data is always graded "Insufficient evidence (animal data only)"**, at very low confidence, whatever the animal results show. The content schema rejects any other finding for an animal-only evidence base.

## What a published grade must carry

- The confidence, finding, evidence base and population, study design, and outcome type.
- A plain-English summary and the reason for the grade.
- Limitations.
- Every source, with its PMID, DOI or NCT identifier where one exists, its publication or registry revision date, and when we retrieved it.
- Whether a source was read in full or only as an abstract or registry summary.
- The name of the human reviewer, the review date, their reasoning, and a hash of the exact content they approved.

A trial registration or status change (for example, a trial starting recruitment or finishing) is recorded separately from a study result. It can be news, but it is not evidence that the intervention works or does not work, and it does not move a grade on its own.

## Updates

When a grade changes, we keep the previous grade, the new grade, and the reasoning. New evidence that does not move the grade is still recorded as an update, labelled "New evidence, grade unchanged", so readers can see that the claim is being watched.

## How automation is used

Scheduled scripts search PubMed and ClinicalTrials.gov for new records that match each claim. An AI model may draft a summary of a retrieved abstract or registry record and suggest whether it could change a grade. Those drafts are stored separately from published content and are never shown on the site. A person reads the source, edits the draft, and approves it before anything is published. AI never publishes or approves anything.

## Corrections

If we get something wrong, we fix it and say so.

- Errors of fact, such as a misread result, a wrong population, or a broken or wrong source link, are corrected as soon as they are confirmed.
- A correction that changes a grade is published as a dated update of type "Correction", with the previous grade, the corrected grade, and what went wrong. It is never edited away silently.
- Small wording fixes that do not change meaning are made without a separate update, and still require re-approval, because any change to approved content voids its approval.
- To report an error, open an issue in the project's GitHub repository with the claim's link and the source that shows the problem.

## What this site is not

These are research summaries, not medical advice, dosing guidance, or product recommendations. A grade describes the published evidence, not what any one person should do.
