"use client";

import { useState } from "react";
import { Eyebrow } from "./ui";
import { ClaimRow } from "./claim-row";
import { useWatchlist } from "./watchlist-provider";

export function FollowedClaims() {
  const { data, isFollowed, unreadCount } = useWatchlist();
  const followed = data.interventions.filter((iv) => isFollowed(iv.id));
  const claimCount = followed.reduce((n, iv) => n + iv.claims.length, 0);
  const [openId, setOpenId] = useState<string | null>(data.interventions[0]?.id ?? null);

  return (
    <section className="section" aria-labelledby="follow-title">
      <header className="section-head">
        <div className="section-title">
          <Eyebrow>Everything you follow</Eyebrow>
          <h2 className="h-section" id="follow-title">
            {claimCount === 1 ? "1 claim, graded on its own" : `${claimCount} claims, graded one by one`}
          </h2>
        </div>
        <p className="aside">Confidence is how trustworthy the evidence is, not how big the effect is.</p>
      </header>

      {followed.length === 0 ? (
        <p className="empty">
          {data.interventions.length ? (
            <>
              You are not following anything yet. <a href="#following">Choose interventions to follow</a>.
            </>
          ) : (
            "No reviewed claims have been published yet."
          )}
        </p>
      ) : (
        <div className="accordion">
          {followed.map((iv) => {
            const open = openId === iv.id;
            const n = unreadCount(iv.id);
            const panelId = `iv-panel-${iv.id}`;
            return (
              <div className="acc-item" key={iv.id}>
                <h3 className="acc-heading">
                  <button
                    type="button"
                    className="acc-btn"
                    aria-expanded={open}
                    aria-controls={panelId}
                    onClick={() => setOpenId(open ? null : iv.id)}
                  >
                    <span className="num acc-num">[{iv.num}]</span>
                    <span className="acc-name">{iv.name}</span>
                    <span className="acc-meta">
                      {n > 0 ? <span className="new">{n} NEW</span> : null}
                      <span>{iv.claims.length === 1 ? "1 claim" : `${iv.claims.length} claims`}</span>
                      <span className={open ? "toggle on" : "toggle"} aria-hidden="true">
                        {open ? "−" : "+"}
                      </span>
                    </span>
                  </button>
                </h3>
                <div id={panelId} className="acc-panel" hidden={!open}>
                  {iv.claims.map((c) => (
                    <ClaimRow key={c.id} claim={c} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
