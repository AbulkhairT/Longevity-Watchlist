import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ClaimDetail } from "@/components/claim-detail";
import { MarkSeen } from "@/components/mark-seen";
import { getSiteData } from "@/lib/site";
import { allClaims } from "@/lib/view";

export const dynamicParams = false;

// Static export needs at least one path; "none" renders a not-found page when nothing is published.
export function generateStaticParams() {
  const claims = allClaims(getSiteData());
  return claims.length ? claims.map((c) => ({ id: c.id })) : [{ id: "none" }];
}

function find(id: string) {
  return allClaims(getSiteData()).find((c) => c.id === id);
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const claim = find((await params).id);
  if (!claim) return { title: "Claim not found" };
  return { title: `${claim.interventionName}: ${claim.title}`, description: `${claim.confidence} confidence. ${claim.finding}. ${claim.plain}` };
}

export default async function ClaimPage({ params }: { params: Promise<{ id: string }> }) {
  const claim = find((await params).id);
  if (!claim) notFound();
  return (
    <article className="claim-page">
      <Link href="/claims/" className="back">
        <span className="arrow back-arrow" aria-hidden="true">←</span> All claims
      </Link>
      <div className="card claim-card">
        <ClaimDetail claim={claim} headingId="claim-title" headingLevel={1} />
      </div>
      <MarkSeen claimId={claim.id} />
    </article>
  );
}
