import { timingSafeEqual } from "node:crypto";
import type { VercelRequest, VercelResponse } from "@vercel/node";

import { loadConfig } from "../src/config";
import type { StripeStatusPolicy } from "../src/types";
import { upgradeEmailToPremium } from "../src/upgrade";

function fail(res: VercelResponse, code: number, error: string): void {
  res.status(code).json({ error });
}

/** Constant-time string compare that tolerates length mismatches. */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

function isTruthy(value: unknown): boolean {
  return value === true || value === "true" || value === "on" || value === "1";
}

/**
 * POST /api/upgrade — token-protected endpoint behind the web form.
 * Body (JSON or form-encoded): { email, token, status?, dryRun?, allowNoStripe? }
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return fail(res, 405, "Method not allowed. Use POST.");
  }

  const expected = process.env.UPGRADE_API_TOKEN;
  if (!expected) {
    return fail(res, 500, "Server not configured: UPGRADE_API_TOKEN is not set.");
  }

  const body: Record<string, unknown> =
    req.body && typeof req.body === "object" ? (req.body as Record<string, unknown>) : {};

  const authHeader = req.headers.authorization;
  const headerToken =
    typeof authHeader === "string" ? authHeader.replace(/^Bearer\s+/i, "") : undefined;
  const xToken =
    typeof req.headers["x-upgrade-token"] === "string"
      ? (req.headers["x-upgrade-token"] as string)
      : undefined;
  const bodyToken = typeof body.token === "string" ? body.token : undefined;
  const provided = headerToken ?? xToken ?? bodyToken ?? "";

  if (!safeEqual(provided, expected)) {
    return fail(res, 401, "Unauthorized: missing or invalid token.");
  }

  const email = typeof body.email === "string" ? body.email.trim() : "";
  if (!email) {
    return fail(res, 400, "Missing 'email'.");
  }

  const status = typeof body.status === "string" ? body.status : "live";
  if (status !== "live" && status !== "active" && status !== "all") {
    return fail(res, 400, `Invalid 'status' "${status}". Use live, active, or all.`);
  }

  let config;
  try {
    config = loadConfig();
  } catch (err) {
    // Missing BEEHIIV_/STRIPE_ env vars on the deployment.
    return fail(res, 500, (err as Error).message);
  }

  try {
    const result = await upgradeEmailToPremium(config, email, {
      dryRun: isTruthy(body.dryRun),
      statusPolicy: status as StripeStatusPolicy,
      requireStripeCustomer: !isTruthy(body.allowNoStripe),
    });
    const httpStatus =
      result.outcome === "upgraded" || result.outcome === "would_upgrade" ? 200 : 422;
    res.status(httpStatus).json(result);
  } catch (err) {
    fail(res, 502, (err as Error).message);
  }
}
