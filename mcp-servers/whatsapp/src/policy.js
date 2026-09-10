import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Every rule about who may be messaged and how often, as pure functions.
 *
 * These are not decoration. Running a personal WhatsApp account through
 * automation is against WhatsApp's terms, and the accounts that get banned are
 * the ones that behave like software: instant replies, at all hours, to
 * everyone, at volume. The limits here exist to keep this looking like a
 * person who happens to reply promptly, and to keep the blast radius of a
 * mistake down to the handful of contacts you listed.
 */

export class BlockedError extends Error {}

export const DEFAULT_POLICY = {
  enabled: false,
  /** Only these contacts are ever auto-replied to. Empty means nobody. */
  allowlist: [],
  /** Most auto-replies to one contact within the window. */
  maxRepliesPerContactPerHour: 3,
  /** Most auto-replies overall within the window, across all contacts. */
  maxRepliesPerHour: 12,
  /** A reply that lands in under a second reads as a machine. */
  minDelaySeconds: 4,
  maxDelaySeconds: 20,
  /** Local hours when it stays silent. 22–7 by default. */
  quietHoursStart: 22,
  quietHoursEnd: 7,
};

export function policyPath(env = process.env) {
  return env.MISSY_WHATSAPP_POLICY || path.join(os.homedir(), ".missy", "whatsapp-policy.json");
}

function num(value, fallback) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function loadPolicy(env = process.env, readFile = fs.readFileSync) {
  try {
    const parsed = JSON.parse(readFile(policyPath(env), "utf8"));
    return {
      enabled: Boolean(parsed.enabled),
      allowlist: Array.isArray(parsed.allowlist)
        ? parsed.allowlist
            .filter((c) => c && typeof c.number === "string")
            .map((c) => ({ number: normaliseNumber(c.number), name: String(c.name ?? "").trim() }))
            .filter((c) => c.number)
        : [],
      maxRepliesPerContactPerHour: num(parsed.maxRepliesPerContactPerHour, DEFAULT_POLICY.maxRepliesPerContactPerHour),
      maxRepliesPerHour: num(parsed.maxRepliesPerHour, DEFAULT_POLICY.maxRepliesPerHour),
      minDelaySeconds: num(parsed.minDelaySeconds, DEFAULT_POLICY.minDelaySeconds),
      maxDelaySeconds: num(parsed.maxDelaySeconds, DEFAULT_POLICY.maxDelaySeconds),
      quietHoursStart: num(parsed.quietHoursStart, DEFAULT_POLICY.quietHoursStart),
      quietHoursEnd: num(parsed.quietHoursEnd, DEFAULT_POLICY.quietHoursEnd),
    };
  } catch {
    // A policy that failed to load must not mean "message everyone".
    return { ...DEFAULT_POLICY };
  }
}

/** Digits only, so +91 98765-43210, 919876543210 and 9876543210@c.us all match. */
export function normaliseNumber(input) {
  return String(input).replace(/@.*$/, "").replace(/\D/g, "");
}

/**
 * Two numbers are the same contact if one ends with the other and the overlap
 * is a full local number - that way a saved 9876543210 matches an incoming
 * 919876543210 without 43210 matching everything.
 */
export function sameNumber(a, b) {
  const x = normaliseNumber(a);
  const y = normaliseNumber(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const [longer, shorter] = x.length >= y.length ? [x, y] : [y, x];
  return shorter.length >= 8 && longer.endsWith(shorter);
}

export function findContact(number, policy) {
  return policy.allowlist.find((c) => sameNumber(c.number, number)) ?? null;
}

export function inQuietHours(policy, now = new Date()) {
  const { quietHoursStart: start, quietHoursEnd: end } = policy;
  if (start === end) return false;
  const hour = now.getHours();
  // A window like 22–7 wraps past midnight.
  return start > end ? hour >= start || hour < end : hour >= start && hour < end;
}

/**
 * The whole decision for one candidate auto-reply.
 * `recentSends` is a list of epoch-ms timestamps of replies already sent,
 * each with the contact it went to.
 */
export function canAutoReply({ number, policy, recentSends = [], now = Date.now(), isInbound = true }) {
  if (!policy.enabled) {
    return { allowed: false, reason: "WhatsApp auto-reply is turned off in Missy's settings." };
  }
  // Never open a conversation. Replying to someone who wrote to you is the
  // behaviour of a person; messaging first, unprompted, is what gets a number
  // reported and banned.
  if (!isInbound) {
    return { allowed: false, reason: "Missy only ever replies to a message you received - it never messages first." };
  }
  const contact = findContact(number, policy);
  if (!contact) {
    return { allowed: false, reason: `${number} isn't on your auto-reply list, so this one is left for you.` };
  }
  if (inQuietHours(policy, new Date(now))) {
    return { allowed: false, reason: `It's quiet hours (${policy.quietHoursStart}:00–${policy.quietHoursEnd}:00), so nothing was sent.` };
  }

  const hourAgo = now - 60 * 60 * 1000;
  const withinHour = recentSends.filter((s) => s.at > hourAgo);
  const toThisContact = withinHour.filter((s) => sameNumber(s.number, number));

  if (toThisContact.length >= policy.maxRepliesPerContactPerHour) {
    return {
      allowed: false,
      reason: `Already sent ${toThisContact.length} auto-replies to ${contact.name || number} this hour - that's the limit.`,
    };
  }
  if (withinHour.length >= policy.maxRepliesPerHour) {
    return { allowed: false, reason: `Already sent ${withinHour.length} auto-replies this hour - that's the overall limit.` };
  }
  return { allowed: true, contact };
}

/** A randomised, human-scale pause before replying. */
export function replyDelayMs(policy, random = Math.random) {
  const min = Math.max(0, policy.minDelaySeconds);
  const max = Math.max(min, policy.maxDelaySeconds);
  return Math.round((min + random() * (max - min)) * 1000);
}

/** Things that must never be sent automatically, whoever asked for it. */
const NEVER_SEND = [
  { re: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/, why: "looks like a card number" },
  { re: /\b(otp|one[- ]time (password|code)|verification code)\b/i, why: "looks like a one-time code" },
  { re: /\b\d{6}\b\s*(is|as)\s*(your|the)\s*(otp|code)/i, why: "looks like a one-time code" },
  { re: /\b(password|passcode|pin)\s*(is|:)\s*\S+/i, why: "contains a password" },
  { re: /\b(sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{20,})\b/, why: "contains an API key" },
];

export function checkOutgoing(text) {
  const trimmed = String(text ?? "").trim();
  if (!trimmed) return { allowed: false, reason: "There was nothing to send." };
  if (trimmed.length > 1000) return { allowed: false, reason: "That reply is far too long for a message." };
  for (const rule of NEVER_SEND) {
    if (rule.re.test(trimmed)) return { allowed: false, reason: `Refused: the message ${rule.why}.` };
  }
  return { allowed: true };
}
