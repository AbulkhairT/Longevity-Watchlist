"use client";

import { useEffect, useRef } from "react";
import { ClaimDetail } from "./claim-detail";
import { useWatchlist } from "./watchlist-provider";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select, textarea, summary, [tabindex]:not([tabindex="-1"])';

export function ClaimDrawer() {
  const { openClaimId, claimsById, closeClaim } = useWatchlist();
  const claim = openClaimId ? claimsById.get(openClaimId) : undefined;
  const panelRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);

  // Remember the opener, lock page scroll, make the page inert, focus the close button.
  useEffect(() => {
    if (!claim) return;
    if (!returnFocus.current) returnFocus.current = document.activeElement as HTMLElement | null;
    const app = document.getElementById("lw-app");
    app?.setAttribute("inert", "");
    const html = document.documentElement;
    const prevOverflow = html.style.overflow;
    html.style.overflow = "hidden";
    closeRef.current?.focus({ preventScroll: true });
    panelRef.current?.scrollTo({ top: 0 });
    return () => {
      app?.removeAttribute("inert");
      html.style.overflow = prevOverflow;
    };
  }, [claim]);

  // Return focus to the opener once the drawer closes.
  useEffect(() => {
    if (claim) return;
    const el = returnFocus.current;
    returnFocus.current = null;
    if (el && document.contains(el)) el.focus({ preventScroll: true });
  }, [claim]);

  if (!claim) return null;

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      closeClaim();
      return;
    }
    if (e.key !== "Tab" || !panelRef.current) return;
    const items = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
      (el) => el.offsetParent !== null || el === document.activeElement,
    );
    const first = items[0];
    const last = items[items.length - 1];
    if (!first || !last) return;
    if (e.shiftKey && (document.activeElement === first || document.activeElement === panelRef.current)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const headingId = `drawer-${claim.id}`;
  return (
    <div className="drawer-root" onKeyDown={onKeyDown}>
      <div className="scrim" aria-hidden="true" onClick={closeClaim} />
      <aside
        ref={panelRef}
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        tabIndex={-1}
        key={claim.id}
      >
        <div className="drawer-bar">
          <button ref={closeRef} type="button" className="icon-btn" onClick={closeClaim} aria-label="Close details">
            ×
          </button>
        </div>
        <ClaimDetail claim={claim} headingId={headingId} />
      </aside>
    </div>
  );
}
