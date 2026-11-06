"use client";

import { pad2 } from "@/lib/labels";
import { useWatchlist } from "./watchlist-provider";

export function UpdatesList() {
  const { data, isUnread, openClaim } = useWatchlist();
  if (!data.updates.length) return <p className="empty">No reviewed updates have been published yet.</p>;
  return (
    <ol className="updates">
      {data.updates.map((u, i) => (
        <li key={u.id}>
          <a
            className="row update-row"
            href={`/claims/${u.claimId}/`}
            onClick={(e) => {
              if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
              e.preventDefault();
              openClaim(u.claimId);
            }}
          >
            <span className="num">[{pad2(i + 1)}]</span>
            <span className="row-main">
              <span className="tl-meta">
                {u.interventionName.toUpperCase()} · {u.dateLabel}
              </span>
              <span className="row-title">{u.claimTitle}</span>
              <span className="row-change">
                {u.change}.{isUnread(u.id) ? <span className="new"> NEW</span> : null}
              </span>
              <span className="row-plain">{u.summary}</span>
            </span>
            <span className="arrow row-arrow" aria-hidden="true">→</span>
          </a>
        </li>
      ))}
    </ol>
  );
}
