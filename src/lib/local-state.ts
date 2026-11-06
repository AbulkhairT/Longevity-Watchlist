/**
 * Local personalization: which interventions a visitor follows and which
 * reviewed updates they have read. Stored only in this browser's localStorage.
 * No accounts, no analytics, nothing leaves the device.
 *
 * Interventions are followed by default; the store records the ones a visitor
 * unfollowed, so newly added interventions appear without extra steps.
 */

export const STORAGE_KEY = "longevity-watchlist:v1";
const MAX_SEEN = 5000;

export interface LocalState {
  unfollowed: string[];
  seen: string[];
}

export const EMPTY_STATE: LocalState = { unfollowed: [], seen: [] };

export function parseState(raw: string | null): LocalState {
  if (!raw) return EMPTY_STATE;
  try {
    const v = JSON.parse(raw) as Partial<LocalState>;
    const strings = (x: unknown) => (Array.isArray(x) ? x.filter((s): s is string => typeof s === "string") : []);
    return { unfollowed: strings(v.unfollowed), seen: strings(v.seen).slice(-MAX_SEEN) };
  } catch {
    return EMPTY_STATE;
  }
}

export function isFollowed(state: LocalState, interventionId: string): boolean {
  return !state.unfollowed.includes(interventionId);
}

export function setFollowed(state: LocalState, interventionId: string, follow: boolean): LocalState {
  const rest = state.unfollowed.filter((id) => id !== interventionId);
  return { ...state, unfollowed: follow ? rest : [...rest, interventionId] };
}

/**
 * Mark updates read. Call only when a claim's full detail is opened, with the
 * IDs of every reviewed update shown in that detail.
 */
export function markSeen(state: LocalState, updateIds: readonly string[]): LocalState {
  const missing = updateIds.filter((id) => !state.seen.includes(id));
  if (!missing.length) return state;
  return { ...state, seen: [...state.seen, ...missing].slice(-MAX_SEEN) };
}

export function isUnread(state: LocalState, updateId: string): boolean {
  return !state.seen.includes(updateId);
}

export function unreadIds(
  state: LocalState,
  updates: readonly { id: string; interventionId: string }[],
  onlyFollowed = true,
): string[] {
  return updates
    .filter((u) => (!onlyFollowed || isFollowed(state, u.interventionId)) && isUnread(state, u.id))
    .map((u) => u.id);
}

export function headline(unread: number): string {
  if (unread === 0) return "You are up to date";
  return unread === 1 ? "1 update to read" : `${unread} updates to read`;
}

/** Minimal Storage surface so tests and broken browsers can supply their own. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface Persistence {
  available: boolean;
  load(): LocalState;
  save(state: LocalState): boolean;
}

/** Never throws: storage may be disabled, full, or blocked by privacy settings. */
export function createPersistence(getStorage: () => StorageLike | null | undefined): Persistence {
  let storage: StorageLike | null = null;
  try {
    const s = getStorage();
    if (s) {
      const probe = `${STORAGE_KEY}:probe`;
      s.setItem(probe, "1");
      storage = s;
    }
  } catch {
    storage = null;
  }
  return {
    available: storage !== null,
    load() {
      if (!storage) return EMPTY_STATE;
      try {
        return parseState(storage.getItem(STORAGE_KEY));
      } catch {
        return EMPTY_STATE;
      }
    },
    save(state) {
      if (!storage) return false;
      try {
        storage.setItem(STORAGE_KEY, JSON.stringify(state));
        return true;
      } catch {
        return false;
      }
    },
  };
}

// ---------------------------------------------------------------------------
// "Since your last visit" carousel. Pure, so tests can prove that advancing
// (automatically or by choice) never touches read state.
// ---------------------------------------------------------------------------

export const ADVANCE_MS = 6000;

export interface CarouselState {
  activeId: string | null;
}

export type CarouselAction =
  | { type: "auto-advance"; ids: readonly string[] }
  | { type: "select"; id: string }
  | { type: "sync"; ids: readonly string[] };

export function carouselReducer(state: CarouselState, action: CarouselAction): CarouselState {
  switch (action.type) {
    case "auto-advance": {
      if (!action.ids.length) return { activeId: null };
      const i = state.activeId ? action.ids.indexOf(state.activeId) : -1;
      return { activeId: action.ids[(i + 1) % action.ids.length] ?? null };
    }
    case "select":
      return { activeId: action.id };
    case "sync":
      if (state.activeId && action.ids.includes(state.activeId)) return state;
      return { activeId: action.ids[0] ?? null };
  }
}

export interface PauseInputs {
  reducedMotion: boolean;
  hovered: boolean;
  focused: boolean;
  drawerOpen: boolean;
  hidden: boolean;
  itemCount: number;
}

export function shouldAutoAdvance(p: PauseInputs): boolean {
  return !p.reducedMotion && !p.hovered && !p.focused && !p.drawerOpen && !p.hidden && p.itemCount > 1;
}
