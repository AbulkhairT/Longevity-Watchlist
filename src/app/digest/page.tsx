import type { Metadata } from "next";
import { Eyebrow } from "@/components/ui";
import { formatPrice, isPlaceholder, loadDigestConfig, showPaidOffer, tagFor } from "@/lib/digest-config";
import { getSiteData } from "@/lib/site";

export const metadata: Metadata = {
  title: "Weekly digest",
  description: "What we checked this week, what changed, and why it matters. The site stays free.",
};

export default function DigestPage() {
  const cfg = loadDigestConfig();
  const data = getSiteData();
  const paid = showPaidOffer(cfg);
  const signupLive = !isPlaceholder(cfg.links.signupFormAction);
  const paidLive = !isPlaceholder(cfg.links.paidUpgradeUrl);
  const requestLive = !isPlaceholder(cfg.links.requestInterventionUrl);
  const { monthly, yearly, label } = cfg.paidOffer;

  return (
    <article aria-labelledby="digest-title">
      <header className="section-head first">
        <div className="section-title">
          <Eyebrow>Weekly digest</Eyebrow>
          <h1 className="h-page" id="digest-title">
            What changed this week
          </h1>
        </div>
        <p className="aside">Follow your interventions. We monitor the research and explain which changes matter.</p>
      </header>

      <div className="plans">
        <section className="plan card" aria-labelledby="plan-free">
          <h2 className="plan-name" id="plan-free">
            Free
          </h2>
          <ul className="plan-list">
            <li>Every assessment and its sources</li>
            <li>Every published update, plus RSS</li>
            <li>Follow interventions on this device</li>
            <li>A general weekly roundup by email</li>
            <li>Safety notices and corrections</li>
          </ul>
        </section>

        {paid ? (
          <section className="plan card" aria-labelledby="plan-paid">
            <div className="plan-top">
              <h2 className="plan-name" id="plan-paid">
                Personalized digest
              </h2>
              <span className="kicker">{label}</span>
            </div>
            <p className="plan-price">
              {formatPrice(monthly)} a month <span className="muted">or {formatPrice(yearly)} a year</span>
            </p>
            <p className="body-sm">
              One email a week covering only the interventions you choose: what we checked, whether any grade changed and
              why, and the one finding most worth knowing. Cancel any time.
            </p>
            {paidLive ? (
              <a className="cta" href={cfg.links.paidUpgradeUrl} rel="noopener">
                Start the paid digest <span className="arrow" aria-hidden="true">→</span>
              </a>
            ) : (
              <p className="notice">Paid signup is not connected yet.</p>
            )}
          </section>
        ) : (
          <section className="plan card plan-muted" aria-labelledby="plan-paid">
            <h2 className="plan-name" id="plan-paid">
              Personalized digest
            </h2>
            <p className="body-sm">
              A weekly email covering only the interventions you choose. Not offered yet. Everything on this site stays
              free either way.
            </p>
          </section>
        )}
      </div>

      <section className="section digest-signup" aria-labelledby="signup-title">
        <header className="section-head">
          <div className="section-title">
            <Eyebrow>Sign up</Eyebrow>
            <h2 className="h-section" id="signup-title">
              Get the weekly roundup
            </h2>
          </div>
          <p className="aside">
            We only ask which interventions you follow. Never send us health details: no conditions, symptoms, medications
            or goals.
          </p>
        </header>
        <form
          className="signup card"
          action={signupLive ? cfg.links.signupFormAction : undefined}
          method="post"
          target="_blank"
          aria-describedby={signupLive ? undefined : "signup-off"}
        >
          <fieldset disabled={!signupLive}>
            <legend className="sr-only">Weekly roundup signup</legend>
            <input type="hidden" name="embed" value="1" />
            <label className="field-label" htmlFor="signup-email">
              Email
            </label>
            <input id="signup-email" className="field" type="email" name="email" autoComplete="email" required />
            {data.interventions.length ? (
              <fieldset className="choices">
                <legend className="field-label">Interventions you follow (optional)</legend>
                <div className="choice-grid">
                  {data.interventions.map((iv) => (
                    <label key={iv.id} className="choice">
                      <input type="checkbox" name="tag" value={tagFor(cfg, iv.id)} />
                      {iv.name}
                    </label>
                  ))}
                </div>
              </fieldset>
            ) : null}
            <button type="submit" className="cta">
              Subscribe <span className="arrow" aria-hidden="true">→</span>
            </button>
          </fieldset>
          {signupLive ? (
            <p className="fineprint">
              Your email and choices are kept by our newsletter provider. Unsubscribe from any email.
            </p>
          ) : (
            <p className="notice" id="signup-off">
              Signup is not connected yet. Use the <a href="/feed.xml">RSS feed</a> in the meantime.
            </p>
          )}
        </form>
      </section>

      <section className="section" aria-labelledby="request-title">
        <header className="section-head">
          <div className="section-title">
            <Eyebrow>Request an intervention</Eyebrow>
            <h2 className="h-section" id="request-title">
              Missing something?
            </h2>
          </div>
          <p className="aside">
            Tell us which intervention to cover next. New ones go through full claim review, so we add them slowly.
          </p>
        </header>
        {requestLive ? (
          <a className="cta" href={cfg.links.requestInterventionUrl} rel="noopener">
            Request an intervention <span className="arrow" aria-hidden="true">→</span>
          </a>
        ) : (
          <p className="notice">Requests are not connected yet.</p>
        )}
      </section>
    </article>
  );
}
