import type { PipelineConfig } from "../lib/pipeline-config";
import { HttpError, type HttpClient } from "./http";
import type { PubmedRecord } from "./types";

/**
 * PubMed via NCBI E-utilities: esearch (IDs, paginated) then efetch (abstracts,
 * in bounded batches). tool and email identify the caller; api_key is optional.
 * https://www.ncbi.nlm.nih.gov/books/NBK25499/
 */

export const EUTILS = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";

export interface NcbiIdentity {
  tool: string;
  email: string;
  apiKey?: string;
}

export function ncbiParams(id: NcbiIdentity): URLSearchParams {
  const p = new URLSearchParams({ tool: id.tool, email: id.email });
  if (id.apiKey) p.set("api_key", id.apiKey);
  return p;
}

/** Requests per second actually used: below NCBI's 3/s (no key) and 10/s (key). */
export function pubmedIntervalMs(cfg: PipelineConfig["collection"]["pubmed"], hasKey: boolean): number {
  return Math.ceil(1000 / (hasKey ? cfg.requestsPerSecondWithKey : cfg.requestsPerSecondWithoutKey));
}

export async function esearch(
  http: HttpClient,
  cfg: PipelineConfig["collection"]["pubmed"],
  identity: NcbiIdentity,
  term: string,
  limit = cfg.maxResultsPerQuery,
): Promise<{ ids: string[]; total: number }> {
  const ids: string[] = [];
  let total = 0;
  for (let start = 0; start < limit; start += cfg.esearchPageSize) {
    const p = ncbiParams(identity);
    p.set("db", "pubmed");
    p.set("retmode", "json");
    p.set("term", term);
    p.set("sort", "pub_date");
    p.set("datetype", "edat");
    p.set("reldate", String(cfg.lookbackDays));
    p.set("retstart", String(start));
    p.set("retmax", String(Math.min(cfg.esearchPageSize, limit - start)));
    const res = await http.request(`${EUTILS}/esearch.fcgi?${p}`);
    if (!res.ok) throw new HttpError(`PubMed esearch: HTTP ${res.status}`, res.status);
    const body = (await res.json()) as { esearchresult?: { count?: string; idlist?: string[]; ERROR?: string } };
    const r = body.esearchresult;
    if (!r || r.ERROR) throw new HttpError("PubMed esearch: unexpected response", res.status);
    total = Number(r.count ?? 0);
    const page = (r.idlist ?? []).filter((id) => /^\d+$/.test(id));
    ids.push(...page);
    if (page.length === 0 || start + page.length >= total) break;
  }
  return { ids: [...new Set(ids)], total };
}

export async function efetch(
  http: HttpClient,
  cfg: PipelineConfig["collection"]["pubmed"],
  identity: NcbiIdentity,
  pmids: string[],
): Promise<PubmedRecord[]> {
  const out: PubmedRecord[] = [];
  for (let i = 0; i < pmids.length; i += cfg.efetchBatchSize) {
    const batch = pmids.slice(i, i + cfg.efetchBatchSize);
    const p = ncbiParams(identity);
    p.set("db", "pubmed");
    p.set("retmode", "xml");
    p.set("rettype", "abstract");
    p.set("id", batch.join(","));
    const res = await http.request(`${EUTILS}/efetch.fcgi?${p}`);
    if (!res.ok) throw new HttpError(`PubMed efetch: HTTP ${res.status}`, res.status);
    out.push(...parsePubmedXml(await res.text()));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Minimal, dependency-free parsing of PubMed efetch XML.
// ---------------------------------------------------------------------------

export function decodeXml(s: string): string {
  return s
    .replace(/<[^>]+>/g, "") // inline markup such as <i>, <sup>
    .replace(/&#x([0-9a-f]+);/gi, (_m, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_m, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function first(xml: string, re: RegExp): string | null {
  const m = re.exec(xml);
  return m ? m[1]! : null;
}

const MONTHS: Record<string, string> = { jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06", jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12" };

function ymd(block: string | null): string | null {
  if (!block) return null;
  const y = first(block, /<Year>(\d{4})<\/Year>/);
  if (!y) {
    const medline = first(block, /<MedlineDate>(\d{4})/);
    return medline;
  }
  let m = first(block, /<Month>([^<]+)<\/Month>/);
  if (m && !/^\d+$/.test(m)) m = MONTHS[m.slice(0, 3).toLowerCase()] ?? null;
  const d = first(block, /<Day>(\d{1,2})<\/Day>/);
  if (!m) return y;
  const mm = m.padStart(2, "0");
  return d ? `${y}-${mm}-${d.padStart(2, "0")}` : `${y}-${mm}`;
}

export function parsePubmedXml(xml: string): PubmedRecord[] {
  const articles = xml.split(/<PubmedArticle>/).slice(1).map((a) => a.split(/<\/PubmedArticle>/)[0]!);
  return articles.flatMap((raw) => {
    // Never read identifiers from the cited-reference list or comment links.
    const a = raw.replace(/<ReferenceList>[\s\S]*?<\/ReferenceList>/g, "").replace(/<CommentsCorrectionsList>[\s\S]*?<\/CommentsCorrectionsList>/g, "");
    const pmid = first(a, /<MedlineCitation[^>]*>[\s\S]*?<PMID[^>]*>(\d+)<\/PMID>/);
    if (!pmid) return [];
    const articleIds = first(a, /<PubmedData>[\s\S]*?<ArticleIdList>([\s\S]*?)<\/ArticleIdList>/) ?? "";
    const doi =
      first(articleIds, /<ArticleId IdType="doi">([^<]+)<\/ArticleId>/) ?? first(a, /<ELocationID EIdType="doi"[^>]*>([^<]+)<\/ELocationID>/);
    const abstractBlock = first(a, /<Abstract>([\s\S]*?)<\/Abstract>/) ?? "";
    const parts = [...abstractBlock.matchAll(/<AbstractText([^>]*)>([\s\S]*?)<\/AbstractText>/g)].map(([, attrs, body]) => {
      const label = first(attrs ?? "", /Label="([^"]+)"/);
      const text = decodeXml(body ?? "");
      return label ? `${label}: ${text}` : text;
    });
    const abstract = parts.join("\n");
    const dataBanks = [...a.matchAll(/<AccessionNumber>(NCT\d{8})<\/AccessionNumber>/g)].map((m) => m[1]!);
    const inText = [...abstract.matchAll(/\b(NCT\d{8})\b/g)].map((m) => m[1]!);
    const articleDate = first(a, /<ArticleDate[^>]*>([\s\S]*?)<\/ArticleDate>/);
    const pubDate = first(a, /<PubDate>([\s\S]*?)<\/PubDate>/);
    return [
      {
        pmid,
        doi: doi ? decodeXml(doi) : null,
        title: decodeXml(first(a, /<ArticleTitle>([\s\S]*?)<\/ArticleTitle>/) ?? ""),
        abstract,
        journal: (() => {
          const j = first(a, /<Journal>[\s\S]*?<Title>([\s\S]*?)<\/Title>/);
          return j ? decodeXml(j) : null;
        })(),
        publicationTypes: [...a.matchAll(/<PublicationType[^>]*>([^<]+)<\/PublicationType>/g)].map((m) => decodeXml(m[1]!)),
        publishedDate: ymd(articleDate) ?? ymd(pubDate),
        revisedDate: ymd(first(a, /<DateRevised>([\s\S]*?)<\/DateRevised>/)),
        trialIds: [...new Set([...dataBanks, ...inText])],
      },
    ];
  });
}

/** Publication types that are not evidence about an outcome. Retractions and errata are kept. */
export const NON_EVIDENCE_TYPES = new Set(["Comment", "Editorial", "News", "Newspaper Article", "Letter", "Biography", "Portrait", "Interview"]);
