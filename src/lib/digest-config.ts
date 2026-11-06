import fs from "node:fs";
import path from "node:path";
import { z } from "zod";

const link = z.string().min(1);

export const DigestConfig = z
  .object({
    $comment: z.string().optional(),
    schemaVersion: z.literal(1),
    provider: z.enum(["buttondown"]),
    paidOffer: z
      .object({
        /** Keep false on Vercel Hobby: advertising or taking payment is commercial use. */
        enabled: z.boolean(),
        label: z.string().min(1),
        currency: z.literal("USD"),
        monthly: z.number().positive(),
        yearly: z.number().positive(),
      })
      .strict(),
    links: z
      .object({
        signupFormAction: link,
        paidUpgradeUrl: link,
        manageSubscriptionUrl: link,
        requestInterventionUrl: link,
        correctionsUrl: link,
      })
      .strict(),
    /** Subscriber tag for an intervention is `${tagPrefix}${interventionId}`. Tags never describe health. */
    tagPrefix: z.string().regex(/^[a-z0-9-]*$/),
  })
  .strict();
export type DigestConfig = z.infer<typeof DigestConfig>;

export function loadDigestConfig(file = path.join(process.cwd(), "config", "digest.json")): DigestConfig {
  return DigestConfig.parse(JSON.parse(fs.readFileSync(file, "utf8")));
}

export function isPlaceholder(url: string): boolean {
  return url.startsWith("PLACEHOLDER");
}

export function tagFor(cfg: DigestConfig, interventionId: string): string {
  return `${cfg.tagPrefix}${interventionId}`;
}

/** Show the paid offer only when enabled in config, or locally (never on Vercel) for design review. */
export function showPaidOffer(cfg: DigestConfig, env: Record<string, string | undefined> = process.env): boolean {
  if (cfg.paidOffer.enabled) return true;
  return env.LW_PREVIEW_PAID_OFFER === "1" && !env.VERCEL;
}

export function formatPrice(n: number): string {
  return Number.isInteger(n) ? `$${n}` : `$${n.toFixed(2)}`;
}
