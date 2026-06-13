import { BeehiivSubscription } from "./types";

const BEEHIIV_API_BASE = "https://api.beehiiv.com/v2";

export interface UpdateSubscriptionInput {
  tier?: "free" | "premium";
  premium_tier_ids?: string[];
  stripe_customer_id?: string;
  unsubscribe?: boolean;
}

export class BeehiivClient {
  constructor(
    private readonly apiKey: string,
    private readonly publicationId: string,
  ) {}

  private get headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    };
  }

  /**
   * Step 1: find the subscription for this email. beehiiv's `email` filter is an
   * exact, case-insensitive match; we still re-check exactly and fall back to the
   * first row, mirroring relay's PICK_FIRST behaviour.
   */
  async findSubscriptionByEmail(email: string): Promise<BeehiivSubscription | null> {
    const query = new URLSearchParams({ email, limit: "100" }).toString();
    const url = `${BEEHIIV_API_BASE}/publications/${this.publicationId}/subscriptions?${query}`;
    const res = await fetch(url, { headers: this.headers });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`beehiiv list subscriptions failed (${res.status}): ${text}`);
    }
    const body = JSON.parse(text) as { data?: BeehiivSubscription[] };
    const rows = body.data ?? [];
    const normalized = email.trim().toLowerCase();
    const exact = rows.find((s) => s.email?.toLowerCase() === normalized);
    return exact ?? rows[0] ?? null;
  }

  /** Step 4: update the subscription (tier / stripe customer id / unsubscribe). */
  async updateSubscription(
    subscriptionId: string,
    input: UpdateSubscriptionInput,
  ): Promise<BeehiivSubscription> {
    const url = `${BEEHIIV_API_BASE}/publications/${this.publicationId}/subscriptions/${subscriptionId}`;
    const res = await fetch(url, {
      method: "PUT",
      headers: this.headers,
      body: JSON.stringify(input),
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`beehiiv update subscription failed (${res.status}): ${text}`);
    }
    const parsed = JSON.parse(text) as { data?: BeehiivSubscription } & Partial<BeehiivSubscription>;
    return (parsed.data ?? (parsed as BeehiivSubscription));
  }
}
