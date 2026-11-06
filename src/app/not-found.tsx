import Link from "next/link";
import { Eyebrow } from "@/components/ui";

export default function NotFound() {
  return (
    <section className="section-head first">
      <div className="section-title">
        <Eyebrow>Not found</Eyebrow>
        <h1 className="h-page">This page is not published</h1>
      </div>
      <p className="aside">
        It may have been renamed or not reviewed yet. <Link href="/claims/">Browse all claims</Link>.
      </p>
    </section>
  );
}
