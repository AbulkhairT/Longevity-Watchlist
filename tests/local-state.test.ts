import { describe, expect, it } from "vitest";
import {
  EMPTY_STATE,
  STORAGE_KEY,
  carouselReducer,
  createPersistence,
  headline,
  isUnread,
  markSeen,
  parseState,
  setFollowed,
  shouldAutoAdvance,
  unreadIds,
} from "@/lib/local-state";

const updates = [
  { id: "u1", interventionId: "creatine" },
  { id: "u2", interventionId: "sauna" },
  { id: "u3", interventionId: "omega-3" },
];

describe("unread tracking", () => {
  it("counts every unread update across followed interventions", () => {
    expect(unreadIds(EMPTY_STATE, updates)).toEqual(["u1", "u2", "u3"]);
    expect(headline(3)).toBe("3 updates to read");
    expect(headline(1)).toBe("1 update to read");
    expect(headline(0)).toBe("You are up to date");
  });

  it("marks only the opened claim's updates read", () => {
    const s = markSeen(EMPTY_STATE, ["u2"]);
    expect(unreadIds(s, updates)).toEqual(["u1", "u3"]);
    expect(markSeen(s, ["u2"])).toBe(s); // idempotent, no needless writes
  });

  it("handles a claim with several unread updates", () => {
    const s = markSeen(EMPTY_STATE, ["u1", "u3"]);
    expect(unreadIds(s, updates)).toEqual(["u2"]);
  });

  it("excludes unfollowed interventions from the headline count", () => {
    const s = setFollowed(EMPTY_STATE, "sauna", false);
    expect(unreadIds(s, updates)).toEqual(["u1", "u3"]);
    expect(unreadIds(setFollowed(s, "sauna", true), updates)).toEqual(["u1", "u2", "u3"]);
  });

  it("never marks anything read when the carousel advances", () => {
    const ids = updates.map((u) => u.id);
    let carousel = { activeId: "u1" as string | null };
    const state = EMPTY_STATE;
    for (let i = 0; i < 7; i++) carousel = carouselReducer(carousel, { type: "auto-advance", ids });
    carousel = carouselReducer(carousel, { type: "select", id: "u3" });
    expect(carousel.activeId).toBe("u3");
    // The reducer has no access to read state; read state is untouched.
    expect(ids.every((id) => isUnread(state, id))).toBe(true);
  });

  it("wraps around when advancing", () => {
    expect(carouselReducer({ activeId: "u3" }, { type: "auto-advance", ids: ["u1", "u2", "u3"] }).activeId).toBe("u1");
  });

  it("pauses on hover, focus, open drawer, hidden tab, and reduced motion", () => {
    const base = { reducedMotion: false, hovered: false, focused: false, drawerOpen: false, hidden: false, itemCount: 3 };
    expect(shouldAutoAdvance(base)).toBe(true);
    for (const k of ["reducedMotion", "hovered", "focused", "drawerOpen", "hidden"] as const) {
      expect(shouldAutoAdvance({ ...base, [k]: true })).toBe(false);
    }
    expect(shouldAutoAdvance({ ...base, itemCount: 1 })).toBe(false);
  });
});

describe("storage", () => {
  it("round-trips through storage", () => {
    const mem = new Map<string, string>();
    const p = createPersistence(() => ({ getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => void mem.set(k, v) }));
    expect(p.available).toBe(true);
    expect(p.save(markSeen(EMPTY_STATE, ["u1"]))).toBe(true);
    expect(p.load().seen).toEqual(["u1"]);
    expect(JSON.parse(mem.get(STORAGE_KEY)!).seen).toEqual(["u1"]);
  });

  it("fails gracefully when storage throws", () => {
    const p = createPersistence(() => ({
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    }));
    expect(p.available).toBe(false);
    expect(p.load()).toEqual(EMPTY_STATE);
    expect(p.save(EMPTY_STATE)).toBe(false);
    const q = createPersistence(() => {
      throw new Error("SecurityError");
    });
    expect(q.available).toBe(false);
  });

  it("ignores corrupt stored data", () => {
    expect(parseState("{not json")).toEqual(EMPTY_STATE);
    expect(parseState(JSON.stringify({ seen: [1, "u1"], unfollowed: "x" }))).toEqual({ seen: ["u1"], unfollowed: [] });
  });
});
