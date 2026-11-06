"use client";

import { useEffect } from "react";
import { useWatchlist } from "./watchlist-provider";

/** Rendered only on a claim's full detail page: opening it marks its updates read. */
export function MarkSeen({ claimId }: { claimId: string }) {
  const { markClaimSeen, hydrated } = useWatchlist();
  useEffect(() => {
    if (hydrated) markClaimSeen(claimId);
  }, [hydrated, claimId, markClaimSeen]);
  return null;
}
