import type { Metadata } from "next";
import { UpdatesList } from "@/components/updates-list";
import { Eyebrow } from "@/components/ui";
import { getSiteData } from "@/lib/site";

export const metadata: Metadata = { title: "Updates" };

export default function UpdatesPage() {
  const data = getSiteData();
  return (
    <section aria-labelledby="updates-title">
      <header className="section-head first">
        <div className="section-title">
          <Eyebrow>{data.mode === "fixtures" ? "Sample updates" : "Reviewed updates"}</Eyebrow>
          <h1 className="h-page" id="updates-title">
            {data.updates.length === 1 ? "1 change" : `${data.updates.length} changes`}, newest first
          </h1>
        </div>
        <p className="aside">
          Every change keeps the previous grade, the new grade and the reasoning. <a href="/feed.xml">RSS feed</a>
        </p>
      </header>
      <UpdatesList />
    </section>
  );
}
