"use client";

import type { ClaimView } from "@/lib/view";
import { ConfidenceMeter } from "./ui";
import { useWatchlist } from "./watchlist-provider";

/** Compact claim row. Opens the detail drawer; the href keeps a real link for no-JS and new tabs. */
export function ClaimRow({ claim, showIntervention = false }: { claim: ClaimView; showIntervention?: boolean }) {
  const { openClaim, openClaimId, isUnread } = useWatchlist();
  const unread = claim.latest ? claim.updateIds.some((id) => isUnread(id)) : false;
  return (
    <a
      href={claim.href}
      className={openClaimId === claim.id ? "row on" : "row"}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
        e.preventDefault();
        openClaim(claim.id);
      }}
      aria-label={`${showIntervention ? `${claim.interventionName}: ` : ""}${claim.title}. ${claim.confidence} confidence. ${claim.finding}.${unread ? " New update." : ""} View evidence.`}
    >
      <span className="row-main">
        <span className="row-title">
          {showIntervention ? <span className="row-iv">{claim.interventionName} · </span> : null}
          {claim.title}
        </span>
        <span className="row-plain">{claim.plain}</span>
        {claim.latest ? (
          <span className="row-change">
            {claim.latest.change}
            {unread ? <span className="new"> NEW</span> : null}
          </span>
        ) : null}
      </span>
      <span className="row-conf">
        <ConfidenceMeter level={claim.confidenceLevel} label={claim.confidence} />
      </span>
      <span className="row-finding">
        {claim.finding}
        <span className="row-src">
          {claim.measured} · {claim.sourceCount}
        </span>
      </span>
      <span className="arrow row-arrow" aria-hidden="true">
        →
      </span>
    </a>
  );
}
