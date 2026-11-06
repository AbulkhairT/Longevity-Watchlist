"use client";

import Link from "next/link";
import { useEffect, useMemo, useReducer, useState, useSyncExternalStore } from "react";
import { ADVANCE_MS, carouselReducer, headline, shouldAutoAdvance } from "@/lib/local-state";
import { Eyebrow, Stats } from "./ui";
import { useWatchlist } from "./watchlist-provider";
import { pad2 } from "@/lib/labels";

const MAX_ITEMS = 6;

function subscribeReducedMotion(cb: () => void) {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}
const getReducedMotion = () => (typeof window !== "undefined" && window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)").matches : false);

function subscribeVisibility(cb: () => void) {
  document.addEventListener("visibilitychange", cb);
  return () => document.removeEventListener("visibilitychange", cb);
}

export function SinceLastVisit() {
  const { data, isFollowed, isUnread, unreadCount, openClaim, openClaimId, claimsById, hydrated } = useWatchlist();
  const items = useMemo(
    () => data.updates.filter((u) => isFollowed(u.interventionId)).slice(0, MAX_ITEMS),
    [data.updates, isFollowed],
  );
  const ids = useMemo(() => items.map((i) => i.id), [items]);
  const [{ activeId }, dispatch] = useReducer(carouselReducer, { activeId: ids[0] ?? null });
  useEffect(() => dispatch({ type: "sync", ids }), [ids]);

  const reducedMotion = useSyncExternalStore(subscribeReducedMotion, getReducedMotion, () => true);
  const hidden = useSyncExternalStore(subscribeVisibility, () => document.hidden, () => false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const autoplay = shouldAutoAdvance({
    reducedMotion,
    hovered,
    focused,
    drawerOpen: openClaimId !== null,
    hidden,
    itemCount: items.length,
  });
  // Show the progress line only when advancing is possible at all; paused keeps its position.
  const showProgress = hydrated && !reducedMotion && items.length > 1;

  const unread = unreadCount();
  const active = items.find((i) => i.id === activeId) ?? items[0];
  const activeClaim = active ? claimsById.get(active.claimId) : undefined;

  return (
    <section className="slv" aria-labelledby="slv-title">
      <header className="section-head first">
        <div className="section-title">
          <Eyebrow>Since your last visit</Eyebrow>
          <h1 className="h-page" id="slv-title" aria-live="polite">
            {items.length ? headline(unread) : data.updates.length ? "Nothing new in what you follow" : "No updates yet"}
          </h1>
        </div>
        <p className="aside">Each update says what changed in the evidence and whether it moves the grade.</p>
      </header>

      {items.length === 0 ? (
        <p className="empty">
          {data.updates.length ? (
            <>
              You are not following any intervention with updates. <a href="#following">Choose what to follow</a>.
            </>
          ) : (
            "Reviewed updates will appear here once claims are published."
          )}
        </p>
      ) : (
        <div
          className="slv-grid"
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          onFocus={() => setFocused(true)}
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false);
          }}
        >
          <div className="steps" role="group" aria-label="Recent updates">
            {items.map((u, i) => {
              const on = u.id === active?.id;
              const isNew = isUnread(u.id);
              return (
                <button
                  key={u.id}
                  type="button"
                  className={on ? "step on" : "step"}
                  aria-pressed={on}
                  aria-controls="slv-panel"
                  onClick={() => dispatch({ type: "select", id: u.id })}
                >
                  <span className="num">[{pad2(i + 1)}]</span>
                  <span className="step-text">
                    <span className="step-title">
                      {u.interventionName}: {u.claimTitle}
                    </span>
                    {on ? <span className="step-move">{u.change}.</span> : null}
                  </span>
                  {isNew ? <span className="new">NEW</span> : null}
                  {on && showProgress ? (
                    <span className="progress" aria-hidden="true">
                      <span
                        key={`${u.id}`}
                        className="progress-fill"
                        style={{ animationDuration: `${ADVANCE_MS}ms`, animationPlayState: autoplay ? "running" : "paused" }}
                        onAnimationEnd={() => dispatch({ type: "auto-advance", ids })}
                      />
                    </span>
                  ) : null}
                </button>
              );
            })}
            {data.updates.length > items.length ? (
              <Link className="text-link" href="/updates/">
                All updates <span className="arrow" aria-hidden="true">→</span>
              </Link>
            ) : null}
          </div>

          {active && activeClaim ? (
            <article className="panel card" id="slv-panel" key={active.id} aria-live="polite">
              <div className="panel-top">
                <span className="kicker">{active.interventionName}</span>
                <span className="meta">{activeClaim.provenance}</span>
              </div>
              <div className="panel-title">
                <h2 className="h-section">{active.claimTitle}</h2>
                <span className="hero-change">{active.hero}</span>
              </div>
              <Stats
                level={activeClaim.confidenceLevel}
                confidence={activeClaim.confidence}
                finding={activeClaim.finding}
                measured={activeClaim.measured}
              />
              <p className="body">{active.summary}</p>
              <button type="button" className="cta" onClick={() => openClaim(active.claimId)}>
                View full evidence <span className="arrow" aria-hidden="true">→</span>
              </button>
            </article>
          ) : null}
        </div>
      )}
    </section>
  );
}
