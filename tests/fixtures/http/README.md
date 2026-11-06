# Recorded API responses (tests only)

Real responses recorded on 2026-11-06 from the public APIs, used so tests make no live calls.

- `pubmed-esearch-p1.json`, `pubmed-esearch-p2.json`: NCBI esearch, `creatine[tiab] AND strength[tiab]`, retmax 2, retstart 0 and 2.
- `pubmed-efetch.xml`: NCBI efetch for those four PMIDs plus PMID 42868132, which lists NCT07233707 in its DataBankList. Reference lists were removed from all but the first article to keep the file small.
- `ctgov-p1.json`, `ctgov-p2.json`: ClinicalTrials.gov v2, `query.intr=creatine&query.term=strength`, pageSize 2, pages 1 and 2. `nextPageToken` was removed from page 2 to end pagination.
- `ctgov-linked.json`: NCT07233707, whose references include PMID 42868132.

Contact, location, sponsor and oversight modules were removed from registry records. These are fixtures, not evidence: never copy them into `content/`.
