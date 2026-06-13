#!/usr/bin/env node
import { loadConfig } from "./config";
import { StripeStatusPolicy } from "./types";
import { upgradeEmailToPremium, UpgradeResult } from "./upgrade";

interface CliArgs {
  email?: string;
  publicationId?: string;
  tierId?: string;
  status: StripeStatusPolicy;
  dryRun: boolean;
  allowNoStripe: boolean;
  json: boolean;
  help: boolean;
}

const HELP = `beehiiv-premium — upgrade a beehiiv subscriber to Premium and attach their paying Stripe customer.

USAGE
  beehiiv-premium-upgrade <email> [options]
  npm run upgrade -- <email> [options]

OPTIONS
  -p, --publication-id <pub_...>  beehiiv publication id (overrides BEEHIIV_PUBLICATION_ID)
      --tier-id <tier_...>        specific premium tier id (overrides BEEHIIV_PREMIUM_TIER_ID)
      --status <live|active|all>  which Stripe subscription statuses count as paying (default: live)
      --dry-run                   run every step except the final beehiiv write
      --allow-no-stripe           upgrade the tier even if no paying Stripe customer is found
      --json                      print the machine-readable result to stdout
  -h, --help                      show this help

ENVIRONMENT
  BEEHIIV_API_KEY, BEEHIIV_PUBLICATION_ID, STRIPE_API_KEY  (required)
  BEEHIIV_PREMIUM_TIER_ID                                  (optional)

  Tip: keep these in a .env file and run with Node's built-in loader:
    node --env-file=.env dist/cli.js <email>

EXAMPLES
  node --env-file=.env dist/cli.js rfoisy@injurylawyercanada.com
  node --env-file=.env dist/cli.js someone@example.com --dry-run
  node --env-file=.env dist/cli.js someone@example.com --status active --json`;

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    status: "live",
    dryRun: false,
    allowNoStripe: false,
    json: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    switch (a) {
      case "-h":
      case "--help":
        args.help = true;
        break;
      case "--dry-run":
        args.dryRun = true;
        break;
      case "--allow-no-stripe":
        args.allowNoStripe = true;
        break;
      case "--json":
        args.json = true;
        break;
      case "-p":
      case "--publication-id":
        args.publicationId = argv[++i];
        break;
      case "--tier-id":
        args.tierId = argv[++i];
        break;
      case "--status": {
        const v = argv[++i];
        if (v !== "live" && v !== "active" && v !== "all") {
          throw new Error(`Invalid --status "${v ?? ""}". Use one of: live, active, all.`);
        }
        args.status = v;
        break;
      }
      default:
        if (a.startsWith("-")) {
          throw new Error(`Unknown option: ${a}`);
        }
        if (!args.email) {
          args.email = a;
        } else {
          throw new Error(`Unexpected extra argument: ${a}`);
        }
    }
  }

  return args;
}

/** Exit code by outcome: 0 = changed/would change, 3 = nothing to do, 1 = error (thrown elsewhere). */
function exitCodeFor(result: UpgradeResult): number {
  switch (result.outcome) {
    case "upgraded":
    case "would_upgrade":
      return 0;
    case "no_beehiiv_subscription":
    case "no_paying_customer":
      return 3;
  }
}

function printHuman(result: UpgradeResult): void {
  const mark = result.outcome === "upgraded" || result.outcome === "would_upgrade" ? "✓" : "•";
  console.log(`\n${mark} ${result.message}`);
}

async function main(): Promise<void> {
  let args: CliArgs;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(`Error: ${(err as Error).message}\n`);
    console.error(HELP);
    process.exitCode = 1;
    return;
  }

  if (args.help || !args.email) {
    console.log(HELP);
    process.exitCode = args.email || args.help ? 0 : 1;
    return;
  }

  const config = loadConfig({
    beehiivPublicationId: args.publicationId,
    premiumTierId: args.tierId,
  });

  const result = await upgradeEmailToPremium(config, args.email, {
    dryRun: args.dryRun,
    statusPolicy: args.status,
    requireStripeCustomer: !args.allowNoStripe,
    // Progress lines go to stderr so --json stdout stays clean.
    onStep: (msg) => console.error(msg),
  });

  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    printHuman(result);
  }
  process.exitCode = exitCodeFor(result);
}

main().catch((err) => {
  console.error(`\n✗ ${(err as Error).message}`);
  process.exitCode = 1;
});
