export interface AppConfig {
  beehiivApiKey: string;
  beehiivPublicationId: string;
  stripeApiKey: string;
  /** Optional specific premium tier (tier_<uuid>). When unset we fall back to the generic "premium" tier. */
  premiumTierId?: string;
}

/**
 * Which Stripe subscription statuses count as a "paying" customer.
 * - "live":   active | trialing | past_due | unpaid (default)
 * - "active": active only
 * - "all":    any status, including canceled/incomplete
 */
export type StripeStatusPolicy = "live" | "active" | "all";

export interface StripeCustomer {
  id: string;
  email: string | null;
  name: string | null;
  created: number;
}

export interface StripeSubscription {
  id: string;
  /** Customer id when not expanded. */
  customer: string;
  status: string;
  created: number;
  items: { data: Array<{ id: string }> };
}

export interface BeehiivSubscription {
  id: string;
  email: string;
  status: string;
  subscription_tier?: string;
  stripe_customer_id?: string | null;
  created?: number;
  [key: string]: unknown;
}
