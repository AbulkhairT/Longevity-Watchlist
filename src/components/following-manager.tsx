"use client";

import { Eyebrow } from "./ui";
import { useWatchlist } from "./watchlist-provider";

export function FollowingManager() {
  const { data, isFollowed, toggleFollow, unreadCount, storageAvailable, hydrated } = useWatchlist();
  if (!data.interventions.length) return null;
  const count = data.interventions.filter((iv) => isFollowed(iv.id)).length;
  return (
    <section className="section" id="following" aria-labelledby="manage-title">
      <header className="section-head">
        <div className="section-title">
          <Eyebrow>Following</Eyebrow>
          <h2 className="h-section" id="manage-title">
            {count} of {data.interventions.length} interventions
          </h2>
        </div>
        <p className="aside">
          {hydrated && !storageAvailable
            ? "Your browser is blocking storage, so follows and read updates reset when you leave."
            : "Follows and read updates stay on this device. No account, nothing sent anywhere."}
        </p>
      </header>
      <ul className="follow-list">
        {data.interventions.map((iv) => {
          const on = isFollowed(iv.id);
          const n = unreadCount(iv.id);
          return (
            <li key={iv.id} className="follow-item">
              <span className="num">[{iv.num}]</span>
              <span className="follow-name">
                <span className="follow-title">{iv.name}</span>
                <span className="meta">
                  {iv.claims.length === 1 ? "1 claim" : `${iv.claims.length} claims`}
                  {n > 0 ? ` · ${n} unread` : ""}
                  {" · "}
                  <a href={`/feeds/${iv.id}.xml`}>RSS</a>
                </span>
              </span>
              <button
                type="button"
                className={on ? "pill on" : "pill"}
                aria-pressed={on}
                aria-label={`${on ? "Following" : "Follow"} ${iv.name}`}
                onClick={() => toggleFollow(iv.id)}
              >
                {on ? "Following" : "Follow"}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
