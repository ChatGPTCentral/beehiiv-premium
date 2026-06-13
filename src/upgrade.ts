import { BeehiivClient, UpdateSubscriptionInput } from "./beehiiv";
import { findPayingCustomer, StripeClient } from "./stripe";
import { AppConfig, BeehiivSubscription, StripeStatusPolicy } from "./types";

export interface UpgradeOptions {
  /** Run every step except the final beehiiv write. */
  dryRun?: boolean;
  /** Which Stripe subscription statuses count as "paying". Default "live". */
  statusPolicy?: StripeStatusPolicy;
  /** When false, still upgrade the tier even if no paying Stripe customer is found. Default true. */
  requireStripeCustomer?: boolean;
  /** Progress callback (one line per step). */
  onStep?: (message: string) => void;
}

export type UpgradeOutcome =
  | "upgraded"
  | "would_upgrade" // dry run
  | "no_beehiiv_subscription"
  | "no_paying_customer";

export interface UpgradeResult {
  outcome: UpgradeOutcome;
  email: string;
  publicationId: string;
  beehiivSubscriptionId: string | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  stripeCandidateCount: number;
  qualifyingCustomerIds: string[];
  appliedUpdate: UpdateSubscriptionInput | null;
  subscriptionAfter: BeehiivSubscription | null;
  message: string;
}

/**
 * Replicates the relay "Upgrade newsletter to premium" playbook for a single email:
 *   1. find the beehiiv subscription by email
 *   2. find every Stripe customer with that email
 *   3. pick the one that actually has a paying subscription
 *   4. set the beehiiv subscription to Premium and attach that Stripe customer id
 */
export async function upgradeEmailToPremium(
  config: AppConfig,
  email: string,
  options: UpgradeOptions = {},
): Promise<UpgradeResult> {
  const {
    dryRun = false,
    statusPolicy = "live",
    requireStripeCustomer = true,
    onStep = () => {},
  } = options;

  const beehiiv = new BeehiivClient(config.beehiivApiKey, config.beehiivPublicationId);
  const stripe = new StripeClient(config.stripeApiKey);

  const result: UpgradeResult = {
    outcome: "no_beehiiv_subscription",
    email,
    publicationId: config.beehiivPublicationId,
    beehiivSubscriptionId: null,
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    stripeCandidateCount: 0,
    qualifyingCustomerIds: [],
    appliedUpdate: null,
    subscriptionAfter: null,
    message: "",
  };

  // Step 1 — beehiiv subscription.
  onStep(`Looking up beehiiv subscription for ${email}…`);
  const sub = await beehiiv.findSubscriptionByEmail(email);
  if (!sub) {
    result.outcome = "no_beehiiv_subscription";
    result.message = `No beehiiv subscription found for ${email} in ${config.beehiivPublicationId}.`;
    return result;
  }
  result.beehiivSubscriptionId = sub.id;
  onStep(`  → beehiiv subscription ${sub.id} (current tier: ${sub.subscription_tier ?? "unknown"}).`);

  // Steps 2 + 3 — paying Stripe customer.
  onStep(`Searching Stripe customers for ${email}…`);
  const paying = await findPayingCustomer(stripe, email, statusPolicy);
  result.stripeCandidateCount = paying.candidates.length;
  result.qualifyingCustomerIds = paying.qualifyingCustomerIds;
  onStep(
    `  → ${paying.candidates.length} Stripe customer(s) with this email; ` +
      `${paying.qualifyingCustomerIds.length} with a qualifying (${statusPolicy}) subscription.`,
  );

  if (paying.customerId) {
    result.stripeCustomerId = paying.customerId;
    result.stripeSubscriptionId = paying.subscription?.id ?? null;
    onStep(
      `  → paying customer: ${paying.customerId} ` +
        `(subscription ${paying.subscription?.id}, status ${paying.subscription?.status}).`,
    );
    if (paying.qualifyingCustomerIds.length > 1) {
      onStep(
        `  ⚠ multiple customers have a qualifying subscription ` +
          `(${paying.qualifyingCustomerIds.join(", ")}); picked ${paying.customerId}.`,
      );
    }
  } else if (requireStripeCustomer) {
    result.outcome = "no_paying_customer";
    result.message =
      `No paying Stripe subscription found for ${email}; nothing was updated. ` +
      `Re-run with --allow-no-stripe to set the tier without a Stripe customer.`;
    return result;
  }

  // Step 4 — build the beehiiv update.
  const update: UpdateSubscriptionInput = { unsubscribe: false };
  if (config.premiumTierId) {
    update.premium_tier_ids = [config.premiumTierId];
  } else {
    update.tier = "premium";
  }
  if (result.stripeCustomerId) {
    update.stripe_customer_id = result.stripeCustomerId.trim();
  }
  result.appliedUpdate = update;

  if (dryRun) {
    result.outcome = "would_upgrade";
    result.message = `[dry-run] Would update beehiiv subscription ${sub.id} with ${JSON.stringify(update)}.`;
    return result;
  }

  onStep(`Updating beehiiv subscription ${sub.id} → Premium…`);
  result.subscriptionAfter = await beehiiv.updateSubscription(sub.id, update);
  result.outcome = "upgraded";
  result.message =
    `Upgraded ${email} (beehiiv ${sub.id}) to Premium` +
    (result.stripeCustomerId ? ` with Stripe customer ${result.stripeCustomerId}.` : ".");
  return result;
}
