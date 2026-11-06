import Link from "next/link";
import type { ContentMode } from "@/lib/content";

export function SiteFooter({ mode }: { mode: ContentMode }) {
  return (
    <footer className="footer">
      <p>
        {mode === "fixtures"
          ? "Illustrative prototype. Claims, grades, updates, source counts, and dates are sample placeholders, not reviewed assessments. "
          : "Every published grade was approved by a named human reviewer against the evidence rubric. "}
        Research summaries only, not medical advice. Follows stay on this device.
      </p>
      <p className="footer-links">
        <Link href="/methodology/">How we grade evidence</Link>
        <Link href="/methodology/#corrections">Corrections</Link>
        <Link href="/digest/">Weekly digest</Link>
        <a href="/feed.xml">RSS</a>
      </p>
    </footer>
  );
}
