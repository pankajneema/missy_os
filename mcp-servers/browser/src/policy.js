import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Who the assistant is allowed to visit. Every decision lives here as a pure
 * function so it can be tested without launching a browser, and so there is
 * exactly one place to read when you want to know what is permitted.
 *
 * The policy file is written by the app's Browser Use settings page. If it is
 * missing or unreadable the answer is "no" - a browser that silently browses
 * everywhere because a config file failed to load is worse than one that
 * refuses until it is set up.
 */

export class BlockedError extends Error {}

export const DEFAULT_POLICY = {
  enabled: false,
  defaultMode: "block_all", // "allow_all" | "block_all"
  blocked: [],
  allowed: [],
};

export function policyPath(env = process.env) {
  return env.MISSY_BROWSER_POLICY || path.join(os.homedir(), ".missy", "browser-policy.json");
}

export function loadPolicy(env = process.env, readFile = fs.readFileSync) {
  try {
    const raw = readFile(policyPath(env), "utf8");
    const parsed = JSON.parse(raw);
    return {
      enabled: Boolean(parsed.enabled),
      defaultMode: parsed.defaultMode === "allow_all" ? "allow_all" : "block_all",
      blocked: Array.isArray(parsed.blocked) ? parsed.blocked.filter((d) => typeof d === "string") : [],
      allowed: Array.isArray(parsed.allowed) ? parsed.allowed.filter((d) => typeof d === "string") : [],
    };
  } catch {
    return { ...DEFAULT_POLICY };
  }
}

/** Strips the scheme, port, userinfo and any leading "www." so that what is
 * compared is the thing a person typed into the settings box. */
export function hostOf(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  return parsed.hostname.toLowerCase().replace(/^www\./, "");
}

function normaliseRule(rule) {
  return String(rule).trim().toLowerCase().replace(/^\*\./, "").replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, "");
}

/** "example.com" covers "mail.example.com", but never "notexample.com". */
export function hostMatches(host, rule) {
  const clean = normaliseRule(rule);
  if (!clean || !host) return false;
  return host === clean || host.endsWith(`.${clean}`);
}

/**
 * Hosts that stay off-limits whatever the policy says. These are not sites a
 * person browses - they are the machine's own internals, and the only way the
 * assistant would be asked to fetch one is if something on a page told it to.
 * Cloud metadata in particular hands out credentials to anyone who asks.
 */
const ALWAYS_BLOCKED = [
  "169.254.169.254", // AWS/GCP/Azure instance metadata
  "metadata.google.internal",
  "metadata.goog",
];

function isLoopbackOrPrivate(host) {
  if (host === "localhost" || host.endsWith(".localhost")) return true;
  const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!v4) return host === "::1" || host === "[::1]";
  const [a, b] = [Number(v4[1]), Number(v4[2])];
  if (a === 127 || a === 10) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 169 && b === 254) return true;
  return false;
}

/**
 * The whole decision, in one place.
 * Returns { allowed: true } or { allowed: false, reason } - a reason the user
 * can act on, since "blocked" with no explanation is impossible to debug.
 */
export function checkUrl(url, policy, env = process.env) {
  if (!policy.enabled) {
    return { allowed: false, reason: "Browser use is turned off in Missy's settings." };
  }
  const host = hostOf(url);
  if (!host) {
    return { allowed: false, reason: `Only http and https addresses can be opened - got "${url}".` };
  }
  if (ALWAYS_BLOCKED.some((h) => hostMatches(host, h))) {
    return { allowed: false, reason: `${host} is a cloud metadata address and is never allowed.` };
  }
  // Reaching the user's own machine is useful (a local dev server) but is
  // also how an instruction hidden in a web page would try to reach services
  // that trust anything on localhost. Off unless deliberately allowed.
  if (isLoopbackOrPrivate(host) && env.MISSY_BROWSER_ALLOW_LOCAL !== "1") {
    return {
      allowed: false,
      reason: `${host} is on your own network. Set MISSY_BROWSER_ALLOW_LOCAL=1 on the server to permit that.`,
    };
  }
  if (policy.blocked.some((rule) => hostMatches(host, rule))) {
    return { allowed: false, reason: `${host} is on your blocked list.` };
  }
  if (policy.defaultMode === "allow_all") {
    return { allowed: true };
  }
  if (policy.allowed.some((rule) => hostMatches(host, rule))) {
    return { allowed: true };
  }
  return {
    allowed: false,
    reason: `${host} isn't on your allowed list. Add it under Browser Use, or switch to "Allow all sites".`,
  };
}

export function assertUrlAllowed(url, env = process.env) {
  const decision = checkUrl(url, loadPolicy(env), env);
  if (!decision.allowed) throw new BlockedError(decision.reason);
  return url;
}
