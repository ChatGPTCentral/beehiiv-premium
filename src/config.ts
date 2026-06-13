import { AppConfig } from "./types";

/**
 * Build the runtime config from environment variables, with optional overrides
 * (typically supplied by CLI flags). Throws a clear error listing anything missing.
 */
export function loadConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  const beehiivApiKey = overrides.beehiivApiKey ?? process.env.BEEHIIV_API_KEY ?? "";
  const beehiivPublicationId =
    overrides.beehiivPublicationId ?? process.env.BEEHIIV_PUBLICATION_ID ?? "";
  const stripeApiKey = overrides.stripeApiKey ?? process.env.STRIPE_API_KEY ?? "";
  const premiumTierId =
    overrides.premiumTierId ?? process.env.BEEHIIV_PREMIUM_TIER_ID ?? undefined;

  const missing: string[] = [];
  if (!beehiivApiKey) missing.push("BEEHIIV_API_KEY");
  if (!beehiivPublicationId) missing.push("BEEHIIV_PUBLICATION_ID");
  if (!stripeApiKey) missing.push("STRIPE_API_KEY");

  if (missing.length > 0) {
    throw new Error(
      `Missing required configuration: ${missing.join(", ")}. ` +
        `Set them as environment variables (see .env.example) or pass the matching CLI flag.`,
    );
  }

  return { beehiivApiKey, beehiivPublicationId, stripeApiKey, premiumTierId };
}
