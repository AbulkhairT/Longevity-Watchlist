# Operator guide: weekly routine and the paid-digest test

Short and practical. Read [PROVIDERS.md](PROVIDERS.md) for what was verified about Buttondown, Stripe and Vercel.

## Before the first send (one-time setup)

1. **Buttondown account** (free up to 100 subscribers). Settings → General: note your username.
2. In `config/digest.json`, replace the placeholders:
   - `signupFormAction`: `https://buttondown.com/api/emails/embed-subscribe/<username>`
   - `manageSubscriptionUrl`: your Buttondown subscriber portal URL
   - `paidUpgradeUrl` (only for the paid test): `https://buttondown.com/<username>/buy`
3. **Tags** (needs the tagging add-on): create one tag per intervention, named `follows-<intervention-id>`, e.g. `follows-creatine`. Mark them "Subscriber editable" so readers can change them in the Portal. Never create tags for conditions, symptoms, medications, diagnoses or goals.
4. Subscribe yourself through the site form and confirm the tags arrive. Until you have done this, the signup is untested.
5. **Paid test only**:
   - Move hosting to a plan that permits commercial use. Vercel Hobby forbids even advertising a sale.
   - Add Buttondown's paid subscriptions add-on and connect Stripe. Set the price to $6/month with a $49/year option; it must match `config/digest.json`.
   - Make one small real charge and refund it; Buttondown has no Stripe test mode.
   - Then set `paidOffer.enabled` to `true`.
6. Create a GitHub label `intervention-request` so request issues are labelled.

## Weekly routine (about 1 to 3 hours)

1. **Collect** (Phase 3, not built yet): the scheduled GitHub Action opens a draft PR with candidates and the week's monitoring log. Until then, there are no monitoring counts and the digest says so.
2. **Review**: for each candidate worth acting on, edit a draft in `drafts/claims/`, read the source, then:
   ```bash
   npm run approve -- <claim-id> --reviewer "Your Name" --reason "Why this is right"
   ```
   Commit, open a PR, let CI pass, merge. Vercel rebuilds the site.
3. **Generate the digest** for the week that just ended (weeks start Monday):
   ```bash
   npm run digest -- --week 2026-11-02 --combos combos.txt
   ```
   `combos.txt` has one line per distinct tag combination among paying subscribers, e.g. `follows-creatine,follows-sauna`. Build it from Buttondown's subscriber export.
4. **Review every file** in `digests/<week>/`. Open the `.html` in a browser. Check that each count matches the monitoring log and that every link works.
5. **Send** from Buttondown. Nothing is sent automatically.
   - Free roundup: paste `roundup.md` (or `.html`) and send to all subscribers.
   - Paid: paste each `personalized/<combo>` file and send it to subscribers with exactly that tag set (audience "Premium" plus tag filters). If filters can't do exact matching, send `sections/<intervention>` to each tag instead.
6. **Record the week** in [metrics.csv](metrics.csv).

## Intervention requests

- Requests arrive as GitHub issues from the "Request an intervention" link, labelled `intervention-request`. The issue form warns readers not to include health information. Delete or edit any issue that does.
- Count demand as one issue plus 👍 reactions per intervention. Tally them in the weekly metrics row (`requests_top`).
- Add a new intervention only when demand is clear and you have time for the full process: draft its claims, assess each one against the [rubric](EVIDENCE_RUBRIC.md), and approve each claim. Expand slowly, at most one new intervention at a time.

## Metrics and the decision rule

Fill in [metrics.csv](metrics.csv) by hand every week from Buttondown's dashboard and your own time log.

Run the paid digest for **6 to 8 weeks**.

- **Promising** if paying subscribers renew past their first month and the weekly workload (review plus digest hours) stays sustainable for you.
- **Free product only** if readers open the free roundup but won't pay. Keep the free roundup, stop the paid offer, and reassess.
- Cancel the paid add-ons when the test ends unless the result is promising.

## Possible later, based on subscriber requests (internal only)

Do not mention these on the site:
- Monthly reports
- Exportable reports
- Alerts between digests
