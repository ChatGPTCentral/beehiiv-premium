import { StripeCustomer, StripeStatusPolicy, StripeSubscription } from "./types";

const STRIPE_API_BASE = "https://api.stripe.com/v1";
const STRIPE_API_VERSION = "2024-06-20";

/** Statuses treated as a live/paying subscription under the "live" policy. */
const LIVE_STATUSES = new Set(["active", "trialing", "past_due", "unpaid"]);

/** The subset of Stripe reads we need — narrowed to an interface so it can be faked in tests. */
export interface StripeReader {
  listCustomersByEmail(email: string): Promise<StripeCustomer[]>;
  listSubscriptions(customerId: string): Promise<StripeSubscription[]>;
}

export class StripeClient implements StripeReader {
  constructor(private readonly apiKey: string) {}

  private async get<T>(path: string, params: Record<string, string>): Promise<T> {
    const query = new URLSearchParams(params).toString();
    const url = `${STRIPE_API_BASE}${path}${query ? `?${query}` : ""}`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Stripe-Version": STRIPE_API_VERSION,
      },
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`Stripe GET ${path} failed (${res.status}): ${text}`);
    }
    return JSON.parse(text) as T;
  }

  /** Step 2: every customer that shares this email (exact match, like Stripe's list filter). */
  async listCustomersByEmail(email: string): Promise<StripeCustomer[]> {
    const body = await this.get<{ data: StripeCustomer[] }>("/customers", {
      email,
      limit: "100",
    });
    return body.data;
  }

  /** All subscriptions for a customer, in any status. */
  async listSubscriptions(customerId: string): Promise<StripeSubscription[]> {
    const body = await this.get<{ data: StripeSubscription[] }>("/subscriptions", {
      customer: customerId,
      status: "all",
      limit: "100",
    });
    return body.data;
  }
}

export interface PayingCustomerResult {
  /** The chosen paying customer, or null if none of the candidates has a qualifying subscription. */
  customerId: string | null;
  subscription: StripeSubscription | null;
  /** Every customer that shares the email (step 2 output). */
  candidates: StripeCustomer[];
  /** Distinct customers that have a qualifying subscription (>1 means an ambiguous pick). */
  qualifyingCustomerIds: string[];
}

function statusMatches(status: string, policy: StripeStatusPolicy): boolean {
  if (policy === "all") return true;
  if (policy === "active") return status === "active";
  return LIVE_STATUSES.has(status); // "live"
}

/**
 * Steps 2 + 3 of the relay flow combined: among every Stripe customer that
 * shares the email, find the one that actually has a (paying) subscription with
 * line items. When several qualify, an `active` subscription wins over other
 * statuses, then the most recently created one.
 */
export async function findPayingCustomer(
  client: StripeReader,
  email: string,
  policy: StripeStatusPolicy = "live",
): Promise<PayingCustomerResult> {
  const candidates = await client.listCustomersByEmail(email);
  if (candidates.length === 0) {
    return { customerId: null, subscription: null, candidates, qualifyingCustomerIds: [] };
  }

  const qualifying: Array<{ customer: StripeCustomer; subscription: StripeSubscription }> = [];
  for (const customer of candidates) {
    const subs = await client.listSubscriptions(customer.id);
    for (const sub of subs) {
      const hasItems = (sub.items?.data?.length ?? 0) > 0;
      if (hasItems && statusMatches(sub.status, policy)) {
        qualifying.push({ customer, subscription: sub });
      }
    }
  }

  if (qualifying.length === 0) {
    return { customerId: null, subscription: null, candidates, qualifyingCustomerIds: [] };
  }

  qualifying.sort((a, b) => {
    const aActive = a.subscription.status === "active" ? 1 : 0;
    const bActive = b.subscription.status === "active" ? 1 : 0;
    if (aActive !== bActive) return bActive - aActive;
    return b.subscription.created - a.subscription.created;
  });

  const winner = qualifying[0]!;
  const qualifyingCustomerIds = [...new Set(qualifying.map((q) => q.customer.id))];
  return {
    customerId: winner.customer.id,
    subscription: winner.subscription,
    candidates,
    qualifyingCustomerIds,
  };
}
