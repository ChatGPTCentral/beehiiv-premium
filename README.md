# beehiiv-premium

A small, dependency-free CLI that replicates the relay.app **"Upgrade newsletter to premium"** playbook in code.

Given an email, it:

1. **beehiiv** — finds the subscription for that email.
2. **Stripe** — finds every customer with that email (there can be several).
3. **Stripe** — picks the customer that actually has a *paying* subscription (one with line items), and returns its `customer_id`.
4. **beehiiv** — updates the subscription: sets it to **Premium**, attaches that Stripe `customer_id`, and keeps it subscribed.

It talks directly to the [beehiiv v2 API](https://developers.beehiiv.com/) and the [Stripe API](https://docs.stripe.com/api) over `fetch` — **no runtime dependencies**, just Node 18+.

## Why a separate "find the paying customer" step?

When the same person exists as several Stripe customers under one email (test imports, duplicate checkouts, re-subscribes), only one of them is usually the live payer. Step 3 lists each candidate's subscriptions and keeps the one with line items, preferring an `active` subscription, then the most recently created. That customer's id is what gets written back to beehiiv.

> The original relay run attached the id with a stray trailing newline (`cus_…\n`). This tool trims the id before sending it.

## Setup

```bash
npm install      # dev tooling only (typescript, tsx, @types/node)
npm run build    # compiles src/ -> dist/
```

Copy `.env.example` to `.env` and fill it in:

| Variable | Required | Description |
| --- | --- | --- |
| `BEEHIIV_API_KEY` | ✅ | beehiiv API key with `subscriptions:read` + `subscriptions:write`. |
| `BEEHIIV_PUBLICATION_ID` | ✅ | The publication, e.g. `pub_685dd277-3d37-4105-9320-d248c9e28f76`. |
| `STRIPE_API_KEY` | ✅ | Stripe secret key (`sk_live_…` / `sk_test_…`). Read access to customers + subscriptions. |
| `BEEHIIV_PREMIUM_TIER_ID` | ⬜ | A specific premium tier (`tier_…`). If unset, the generic `premium` tier is used. Set it when the publication has more than one premium tier. |

## Usage

```bash
# Upgrade one subscriber (loads .env via Node's built-in flag):
node --env-file=.env dist/cli.js rfoisy@injurylawyercanada.com

# Preview without writing anything to beehiiv:
node --env-file=.env dist/cli.js someone@example.com --dry-run

# Machine-readable output (steps go to stderr, JSON to stdout):
node --env-file=.env dist/cli.js someone@example.com --json

# Run straight from TypeScript source, no build step:
npm run dev -- someone@example.com --dry-run
```

### Options

| Flag | Default | Description |
| --- | --- | --- |
| `-p, --publication-id <pub_…>` | env | Override `BEEHIIV_PUBLICATION_ID`. |
| `--tier-id <tier_…>` | env | Override `BEEHIIV_PREMIUM_TIER_ID`. |
| `--status <live\|active\|all>` | `live` | Which Stripe subscription statuses count as "paying". `live` = active/trialing/past_due/unpaid. |
| `--dry-run` | off | Run every step except the final beehiiv write. |
| `--allow-no-stripe` | off | Upgrade the tier even if no paying Stripe customer is found (no `stripe_customer_id` attached). |
| `--json` | off | Print the full result object as JSON. |
| `-h, --help` | — | Show help. |

### Exit codes

| Code | Meaning |
| --- | --- |
| `0` | Subscriber upgraded (or, with `--dry-run`, would be upgraded). |
| `3` | Nothing to do — no beehiiv subscription, or no paying Stripe customer (without `--allow-no-stripe`). |
| `1` | Error (bad arguments, missing config, or an API failure). |

### Upgrading several emails

There's no batch mode by design — keep the unit small and composable. Loop in the shell:

```bash
while read -r email; do
  node --env-file=.env dist/cli.js "$email" --json
done < emails.txt
```

## How it maps to the relay export

| relay step | This tool |
| --- | --- |
| `GET_DATA` beehiiv (find by email) | `BeehiivClient.findSubscriptionByEmail` |
| `GET_DATA` Stripe (customers by email) | `StripeClient.listCustomersByEmail` |
| `GET_DATA` Stripe (subscription where customer ∈ …, items not empty) | `findPayingCustomer` |
| `TRANSFORM` (extract `customer_id`) | the winning customer's id (newline-trimmed) |
| `AUTOMATION` beehiiv (Tier=Premium, Stripe id, Unsubscribe=false) | `BeehiivClient.updateSubscription` |

## Development

```bash
npm run typecheck   # tsc --noEmit
npm test            # node --test over src/**/*.test.ts (via tsx)
npm run build       # emit dist/
```

`src/stripe.test.ts` covers the paying-customer selection logic with in-memory fixtures (no network).

## Notes & limitations

- Lookups fetch up to 100 results per call (beehiiv email search, Stripe customers-by-email, subscriptions-per-customer). That's far beyond the realistic count of duplicates for a single email; pagination isn't implemented.
- The Stripe `email` filter is an exact match, mirroring the relay condition.
- The beehiiv `email` filter is exact and case-insensitive; the tool re-checks the match and falls back to the first row (relay's "pick first").
