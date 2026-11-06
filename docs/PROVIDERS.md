# Newsletter and payment providers: what was verified

Checked on 2026-11-06 by reading the official pages below. Prices and plans change; re-check before you pay for anything. **No account was created and no integration was tested.**

## Buttondown (recommended)

| Question | What the official page says | Source |
| --- | --- | --- |
| Free plan | "Absolutely nothing for your first 100 subscribers." Includes the editor, custom sending domain, hosted archives. | https://buttondown.com/pricing |
| Tags / segments | "Tagging & segmentation +$9/month" add-on. Docs: tags "Available on the Basic plan". | https://buttondown.com/pricing, https://docs.buttondown.com/tags |
| Paid subscriptions | "Paid subscriptions +$9/month" add-on. Docs: "Available on the Basic plan." Stripe only. | https://buttondown.com/pricing, https://docs.buttondown.com/paid-subscriptions |
| Buttondown fee on payments | "You keep all of the money you make after credit card fees: we don't take a cut of your paid subscriptions." | https://buttondown.com/features/integrations/stripe |
| Surveys | "Comments and surveys +$9/month" add-on. | https://buttondown.com/pricing |
| Standalone forms | "Forms are available on the Standard plan ($29/month) and above." Not needed: we use the embed form. | https://docs.buttondown.com/forms |
| Tag choice at signup | Embedded forms accept `input` elements named `tag`; resubmitting appends tags rather than replacing them. | https://docs.buttondown.com/tags |
| Send to a tag | In the send dialog, audience "Custom…", choose "Tag". | https://docs.buttondown.com/tags |
| Subscribers edit own tags | Mark a tag "Subscriber editable" and it appears as a checkbox in the subscriber Portal. | https://docs.buttondown.com/tags |
| Paid upgrade link | `https://buttondown.com/<username>/buy`. Free subscribers also see an upgrade link in emails unless "Upsell text" is turned off. | https://docs.buttondown.com/paid-subscriptions |
| Paid-only emails | Audience "Premium" sends to paying subscribers only. | https://docs.buttondown.com/paid-subscriptions |
| Cancellation | Paid subscriptions renew until cancelled; unsubscribing stops payment. | https://docs.buttondown.com/paid-subscriptions |
| Test mode | "Buttondown does not currently support Stripe's test mode"; test with a small real charge and refund it. | https://docs.buttondown.com/paid-subscriptions |
| Personalizing inside one email | Templating supports Django-style `if` blocks and `subscriber.subscriber_type`, `subscriber.metadata`, `subscriber.can_view_premium_content`. **Tags are not listed as a template variable**, so per-tag sections inside one email are not confirmed. | https://docs.buttondown.com/templating |

The pricing page is interactive and showed add-on prices at its default slider position. Check the price at your actual subscriber count.

## Stripe

| Question | What the official page says | Source |
| --- | --- | --- |
| Card fee | "2.9% + 30¢" per successful transaction for domestic cards; "+0.5%" for manually entered cards. | https://stripe.com/pricing |
| Subscriptions without code | "No-code subscriptions are available. Create a payment link for a subscription." | https://docs.stripe.com/payment-links |
| Cancellation without code | A hosted customer portal can be set up "without writing code". | https://docs.stripe.com/customer-management |

Not verified: limits on custom fields in Payment Links.

## beehiiv

**Not verified.** `www.beehiiv.com/pricing` returned HTTP 403 to automated requests. No beehiiv facts are used in this project. Check it in a browser if you want to compare.

## Vercel Hobby (hosting)

- "Hobby teams are restricted to non-commercial personal use only. All commercial usage of the platform requires either a Pro or Enterprise plan." Commercial use includes "Any method of requesting or processing payment from visitors of the site" and "Advertising the sale of a product or service." Source: https://vercel.com/docs/limits/fair-use-guidelines
- So **showing the paid offer counts as commercial use**, not only taking payment. Keep `paidOffer.enabled` set to `false` in `config/digest.json` while the site is on Hobby. Before you enable it, move to a plan or host that permits commercial use. This project does not change hosting.

## Recommendation

Use **Buttondown with its built-in Stripe connection**, and skip a separate Payment Link.

- One system holds subscribers, intervention tags, paid status and cancellations. The site needs no billing code.
- Signup is a plain HTML form. Intervention checkboxes become tags, so the form can't collect free-text health details.
- Buttondown takes no cut of payments. Stripe charges its card fee.
- Costs while testing (from the pricing page; confirm at your list size):
  - **Free roundup only:** $0 up to 100 subscribers. Tags aren't needed for one general email.
  - **Paid test with personalization:** tagging (+$9/month) and paid subscriptions (+$9/month) add-ons, plus Stripe fees, plus commercial hosting. This is the first point where money is spent; it is the operator's decision.
- Delivering personalized digests: the generator writes one file per intervention combination that subscribers actually have (export tags, then `npm run digest -- --combos combos.txt`). Send each one to the matching subscribers using Buttondown's audience filters. Check in the Buttondown app that a filter can match "has tag A and tag B and not tag C" before relying on it. If it can't, send one section email per tag (`digests/<week>/sections/`) as a fallback.
