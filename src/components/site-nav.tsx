"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useId, useMemo, useRef, useState } from "react";
import { SITE_NAME } from "@/lib/labels";
import { allClaims } from "@/lib/view";
import { PulseMark } from "./ui";
import { useWatchlist } from "./watchlist-provider";

function Search() {
  const { data, openClaim } = useWatchlist();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const listId = useId();
  const wrap = useRef<HTMLDivElement>(null);
  const claims = useMemo(() => allClaims(data), [data]);
  const query = q.trim().toLowerCase();
  const results = useMemo(() => {
    if (!query) return [];
    return claims
      .filter((c) =>
        [c.title, c.interventionName, c.plain, c.finding, c.population].some((s) => s.toLowerCase().includes(query)),
      )
      .slice(0, 8);
  }, [claims, query]);

  const focusResult = (i: number) => {
    const items = wrap.current?.querySelectorAll<HTMLButtonElement>(".search-result");
    if (!items?.length) return;
    items[(i + items.length) % items.length]?.focus();
  };

  const choose = (id: string) => {
    setOpen(false);
    setQ("");
    openClaim(id);
  };

  return (
    <div
      className="search"
      ref={wrap}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false);
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape" && open) {
          e.stopPropagation();
          setOpen(false);
          wrap.current?.querySelector("input")?.focus();
        }
      }}
    >
      <label className="sr-only" htmlFor={`${listId}-input`}>
        Search claims
      </label>
      <input
        id={`${listId}-input`}
        type="search"
        placeholder="Search claims"
        autoComplete="off"
        value={q}
        aria-controls={listId}
        aria-expanded={open && !!query}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            focusResult(0);
          } else if (e.key === "Enter" && results[0]) {
            e.preventDefault();
            choose(results[0].id);
          }
        }}
      />
      {open && query ? (
        <div className="search-pop" id={listId} role="region" aria-label="Search results">
          {results.length ? (
            <ul>
              {results.map((c, i) => (
                <li key={c.id}>
                  <button
                    type="button"
                    className="search-result"
                    onClick={() => choose(c.id)}
                    onKeyDown={(e) => {
                      if (e.key === "ArrowDown") {
                        e.preventDefault();
                        focusResult(i + 1);
                      } else if (e.key === "ArrowUp") {
                        e.preventDefault();
                        if (i === 0) wrap.current?.querySelector("input")?.focus();
                        else focusResult(i - 1);
                      }
                    }}
                  >
                    <span className="sr-title">
                      {c.interventionName}: {c.title}
                    </span>
                    <span className="meta">
                      {c.confidence} confidence · {c.finding}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="search-empty" role="status">
              No claims match “{q.trim()}”.
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}

export function SiteNav() {
  const { data, isFollowed } = useWatchlist();
  const pathname = usePathname();
  const following = data.interventions.filter((iv) => isFollowed(iv.id)).length;
  const link = (href: string, label: string) => {
    const current = href === "/" ? pathname === "/" : pathname?.startsWith(href) && !(href === "/claims/" && pathname !== "/claims/");
    return (
      <Link href={href} className="nav-link" aria-current={current ? "page" : undefined}>
        {label}
      </Link>
    );
  };
  return (
    <nav className="nav" aria-label="Main">
      <Link href="/" className="brand">
        <PulseMark />
        {SITE_NAME}
      </Link>
      <Search />
      <span className="nav-links">
        {link("/claims/", "All claims")}
        {link("/updates/", "Updates")}
        {link("/digest/", "Weekly digest")}
        <Link href="/#following" className="nav-link">
          Following · {following}
        </Link>
      </span>
      {data.mode === "fixtures" ? <span className="nav-flag">Illustrative prototype · sample data</span> : null}
    </nav>
  );
}
