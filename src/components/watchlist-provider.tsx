"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  EMPTY_STATE,
  createPersistence,
  isFollowed as isFollowedIn,
  isUnread as isUnreadIn,
  markSeen as markSeenIn,
  setFollowed,
  unreadIds,
  type LocalState,
  type Persistence,
} from "@/lib/local-state";
import { allClaims, type ClaimView, type SiteData } from "@/lib/view";

interface WatchlistContext {
  data: SiteData;
  claimsById: Map<string, ClaimView>;
  state: LocalState;
  hydrated: boolean;
  storageAvailable: boolean;
  isFollowed(interventionId: string): boolean;
  toggleFollow(interventionId: string): void;
  isUnread(updateId: string): boolean;
  unreadCount(interventionId?: string): number;
  /** Marks every reviewed update of a claim read. Only call when its full detail is shown. */
  markClaimSeen(claimId: string): void;
  openClaimId: string | null;
  openClaim(claimId: string): void;
  closeClaim(): void;
}

const Ctx = createContext<WatchlistContext | null>(null);

export function useWatchlist(): WatchlistContext {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useWatchlist must be used inside <WatchlistProvider>");
  return ctx;
}

const claimPath = (id: string) => `/claims/${id}/`;

export function WatchlistProvider({ data, children }: { data: SiteData; children: ReactNode }) {
  const claimsById = useMemo(() => new Map(allClaims(data).map((c) => [c.id, c])), [data]);
  const [state, setState] = useState<LocalState>(EMPTY_STATE);
  const [hydrated, setHydrated] = useState(false);
  const [storageAvailable, setStorageAvailable] = useState(true);
  const persistence = useRef<Persistence | null>(null);

  useEffect(() => {
    const p = createPersistence(() => window.localStorage);
    persistence.current = p;
    setStorageAvailable(p.available);
    setState(p.load());
    setHydrated(true);
    const onStorage = (e: StorageEvent) => {
      if (e.key === null || e.key.startsWith("longevity-watchlist")) setState(p.load());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const update = useCallback((fn: (s: LocalState) => LocalState) => {
    setState((prev) => {
      const next = fn(prev);
      if (next !== prev) persistence.current?.save(next);
      return next;
    });
  }, []);

  const markClaimSeen = useCallback(
    (claimId: string) => {
      const claim = claimsById.get(claimId);
      if (claim?.updateIds.length) update((s) => markSeenIn(s, claim.updateIds));
    },
    [claimsById, update],
  );

  // ----- Drawer + URL ------------------------------------------------------
  const [openClaimId, setOpenClaimId] = useState<string | null>(null);
  const pushedRef = useRef(false);

  const openClaim = useCallback(
    (claimId: string) => {
      if (!claimsById.has(claimId)) return;
      setOpenClaimId(claimId);
      markClaimSeen(claimId);
      const target = claimPath(claimId);
      if (window.location.pathname !== target) {
        try {
          window.history.pushState({ lwDrawer: claimId }, "", target);
          pushedRef.current = true;
        } catch {
          pushedRef.current = false;
        }
      }
    },
    [claimsById, markClaimSeen],
  );

  const closeClaim = useCallback(() => {
    if (pushedRef.current) {
      pushedRef.current = false;
      setOpenClaimId(null);
      window.history.back();
    } else {
      setOpenClaimId(null);
    }
  }, []);

  useEffect(() => {
    const onPop = () => {
      setOpenClaimId((current) => {
        if (current && window.location.pathname !== claimPath(current)) {
          pushedRef.current = false;
          return null;
        }
        return current;
      });
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const value = useMemo<WatchlistContext>(
    () => ({
      data,
      claimsById,
      state,
      hydrated,
      storageAvailable,
      isFollowed: (id) => isFollowedIn(state, id),
      toggleFollow: (id) => update((s) => setFollowed(s, id, !isFollowedIn(s, id))),
      isUnread: (id) => isUnreadIn(state, id),
      unreadCount: (ivId) =>
        ivId
          ? unreadIds(state, data.updates.filter((u) => u.interventionId === ivId), false).length
          : unreadIds(state, data.updates, true).length,
      markClaimSeen,
      openClaimId,
      openClaim,
      closeClaim,
    }),
    [data, claimsById, state, hydrated, storageAvailable, update, markClaimSeen, openClaimId, openClaim, closeClaim],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
