import type { ReactNode } from "react";

export function Eyebrow({ children, as: Tag = "span", id }: { children: ReactNode; as?: "span" | "p" | "h2" | "h3"; id?: string }) {
  return (
    <Tag className="eyebrow" id={id}>
      <span className="dot" aria-hidden="true" />
      {children}
    </Tag>
  );
}

/** 4-segment confidence indicator. The word label always accompanies it. */
export function ConfidenceMeter({ level, label }: { level: number; label: string }) {
  return (
    <span className="conf">
      <span className="meter" aria-hidden="true">
        {[1, 2, 3, 4].map((i) => (
          <span key={i} className={i <= level ? "seg on" : "seg"} />
        ))}
      </span>
      {label}
    </span>
  );
}

export function Stats({ level, confidence, finding, measured }: { level: number; confidence: string; finding: string; measured: string }) {
  return (
    <dl className="stats">
      <div>
        <dt>Confidence</dt>
        <dd>
          <ConfidenceMeter level={level} label={confidence} />
        </dd>
      </div>
      <div>
        <dt>Finding</dt>
        <dd>{finding}</dd>
      </div>
      <div>
        <dt>Measured</dt>
        <dd>{measured}</dd>
      </div>
    </dl>
  );
}

export function PulseMark() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
      <path
        d="M1.5 11 H5.5 L7.5 5.5 L10.5 15 L13 9 L14.5 11 H18.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
