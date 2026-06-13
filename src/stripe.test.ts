import assert from "node:assert/strict";
import { test } from "node:test";

import { findPayingCustomer, StripeReader } from "./stripe";
import { StripeCustomer, StripeSubscription } from "./types";

function customer(id: string, created: number): StripeCustomer {
  return { id, email: "roger@example.com", name: "Roger Foisy", created };
}

function subscription(
  id: string,
  customer: string,
  status: string,
  created: number,
  itemCount = 1,
): StripeSubscription {
  return {
    id,
    customer,
    status,
    created,
    items: { data: Array.from({ length: itemCount }, (_, i) => ({ id: `si_${id}_${i}` })) },
  };
}

/** A fake Stripe reader backed by in-memory fixtures. */
function fakeStripe(
  customers: StripeCustomer[],
  subsByCustomer: Record<string, StripeSubscription[]>,
): StripeReader {
  return {
    listCustomersByEmail: async () => customers,
    listSubscriptions: async (id: string) => subsByCustomer[id] ?? [],
  };
}

test("picks the only customer that has a live subscription", async () => {
  const stripe = fakeStripe(
    [customer("cus_A", 300), customer("cus_B", 200), customer("cus_C", 100)],
    {
      cus_A: [], // no subscriptions at all
      cus_B: [subscription("sub_b", "cus_B", "canceled", 150)], // not live
      cus_C: [subscription("sub_c", "cus_C", "active", 120)], // the paying one
    },
  );

  const result = await findPayingCustomer(stripe, "roger@example.com", "live");
  assert.equal(result.customerId, "cus_C");
  assert.equal(result.subscription?.id, "sub_c");
  assert.deepEqual(result.qualifyingCustomerIds, ["cus_C"]);
  assert.equal(result.candidates.length, 3);
});

test("prefers an active subscription over other live statuses", async () => {
  const stripe = fakeStripe([customer("cus_A", 100), customer("cus_B", 200)], {
    cus_A: [subscription("sub_a", "cus_A", "past_due", 999)], // newer, but not active
    cus_B: [subscription("sub_b", "cus_B", "active", 100)], // older, but active
  });

  const result = await findPayingCustomer(stripe, "roger@example.com", "live");
  assert.equal(result.customerId, "cus_B");
  assert.equal(result.qualifyingCustomerIds.length, 2);
});

test("ignores subscriptions with no line items", async () => {
  const stripe = fakeStripe([customer("cus_A", 100)], {
    cus_A: [subscription("sub_a", "cus_A", "active", 100, 0)],
  });

  const result = await findPayingCustomer(stripe, "roger@example.com", "live");
  assert.equal(result.customerId, null);
  assert.equal(result.subscription, null);
});

test("returns null when no customers share the email", async () => {
  const stripe = fakeStripe([], {});
  const result = await findPayingCustomer(stripe, "nobody@example.com", "live");
  assert.equal(result.customerId, null);
  assert.deepEqual(result.candidates, []);
});

test("'all' policy counts canceled subscriptions too", async () => {
  const stripe = fakeStripe([customer("cus_A", 100)], {
    cus_A: [subscription("sub_a", "cus_A", "canceled", 100)],
  });

  const live = await findPayingCustomer(stripe, "roger@example.com", "live");
  assert.equal(live.customerId, null);

  const all = await findPayingCustomer(stripe, "roger@example.com", "all");
  assert.equal(all.customerId, "cus_A");
});
