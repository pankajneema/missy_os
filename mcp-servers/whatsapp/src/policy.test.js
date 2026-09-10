import assert from "node:assert/strict";
import {
  canAutoReply,
  checkOutgoing,
  findContact,
  inQuietHours,
  loadPolicy,
  normaliseNumber,
  replyDelayMs,
  sameNumber,
} from "./policy.js";

let checks = 0;
function ok(actual, expected, label) {
  checks++;
  assert.equal(actual, expected, label);
}

const family = [
  { number: "919876543210", name: "Ma" },
  { number: "919812345678", name: "Bhai" },
];
const on = {
  enabled: true,
  allowlist: family,
  maxRepliesPerContactPerHour: 3,
  maxRepliesPerHour: 12,
  minDelaySeconds: 4,
  maxDelaySeconds: 20,
  quietHoursStart: 22,
  quietHoursEnd: 7,
};
// Midday, so quiet hours never interfere with the other cases.
const noon = new Date("2026-09-10T12:00:00").getTime();

// --- number handling ---
ok(normaliseNumber("+91 98765-43210"), "919876543210", "strips punctuation and spaces");
ok(normaliseNumber("919876543210@c.us"), "919876543210", "strips the WhatsApp suffix");
ok(sameNumber("9876543210", "919876543210"), true, "local number matches the same one with a country code");
ok(sameNumber("+91 98765 43210", "919876543210@c.us"), true, "matches across formats");
ok(sameNumber("43210", "919876543210"), false, "a short tail must not match everything");
ok(sameNumber("919876543211", "919876543210"), false, "a different number does not match");
ok(findContact("+91 98765 43210", on)?.name, "Ma", "finds the contact whatever the format");

// --- the off switch and the allowlist ---
ok(canAutoReply({ number: "919876543210", policy: { ...on, enabled: false }, now: noon }).allowed, false, "disabled");
ok(canAutoReply({ number: "919876543210", policy: on, now: noon }).allowed, true, "a listed contact is replied to");
ok(canAutoReply({ number: "919999999999", policy: on, now: noon }).allowed, false, "an unlisted number is left alone");
ok(
  canAutoReply({ number: "919876543210", policy: { ...on, allowlist: [] }, now: noon }).allowed,
  false,
  "an empty allowlist means nobody",
);

// --- never message first ---
ok(
  canAutoReply({ number: "919876543210", policy: on, now: noon, isInbound: false }).allowed,
  false,
  "never opens a conversation",
);

// --- rate limits ---
const sends = (count, number, at) => Array.from({ length: count }, () => ({ number, at }));
ok(
  canAutoReply({ number: "919876543210", policy: on, now: noon, recentSends: sends(3, "919876543210", noon - 1000) })
    .allowed,
  false,
  "per-contact hourly limit",
);
ok(
  canAutoReply({
    number: "919876543210",
    policy: on,
    now: noon,
    // Older than an hour, so it no longer counts.
    recentSends: sends(3, "919876543210", noon - 61 * 60 * 1000),
  }).allowed,
  true,
  "the window really is an hour",
);
ok(
  canAutoReply({ number: "919876543210", policy: on, now: noon, recentSends: sends(12, "919812345678", noon - 1000) })
    .allowed,
  false,
  "overall hourly limit across contacts",
);

// --- quiet hours, including the wrap past midnight ---
ok(inQuietHours(on, new Date("2026-09-10T23:30:00")), true, "23:30 is inside 22-7");
ok(inQuietHours(on, new Date("2026-09-10T03:00:00")), true, "03:00 is inside 22-7");
ok(inQuietHours(on, new Date("2026-09-10T12:00:00")), false, "midday is not");
ok(inQuietHours({ ...on, quietHoursStart: 1, quietHoursEnd: 6 }, new Date("2026-09-10T03:00:00")), true, "a plain window");
ok(inQuietHours({ ...on, quietHoursStart: 0, quietHoursEnd: 0 }, new Date("2026-09-10T03:00:00")), false, "0-0 is off");
ok(
  canAutoReply({ number: "919876543210", policy: on, now: new Date("2026-09-10T23:30:00").getTime() }).allowed,
  false,
  "nothing goes out during quiet hours",
);

// --- the delay is human-scale and randomised ---
ok(replyDelayMs(on, () => 0), 4000, "shortest delay is the configured minimum");
ok(replyDelayMs(on, () => 1), 20000, "longest delay is the configured maximum");
ok(replyDelayMs(on, () => 0.5), 12000, "midpoint");
checks++;
assert.ok(replyDelayMs(on, () => 0) >= 1000, "never replies instantly, which is what reads as a bot");

// --- content that must never be sent automatically ---
ok(checkOutgoing("Busy right now, will call you this evening").allowed, true, "an ordinary reply is fine");
ok(checkOutgoing("").allowed, false, "empty");
ok(checkOutgoing("x".repeat(1001)).allowed, false, "absurdly long");
ok(checkOutgoing("my card is 4111 1111 1111 1111").allowed, false, "card number");
ok(checkOutgoing("Your OTP is 483920").allowed, false, "one-time code");
ok(checkOutgoing("the password is hunter2").allowed, false, "password");
ok(checkOutgoing("use sk-abcdefghijklmnopqrstuvwxyz123456").allowed, false, "API key");

// --- a missing policy file means silence, not a free-for-all ---
const missing = loadPolicy({ MISSY_WHATSAPP_POLICY: "/nope/nothing.json" });
ok(missing.enabled, false, "absent policy leaves auto-reply off");
ok(missing.allowlist.length, 0, "absent policy has nobody on the list");
ok(loadPolicy({ MISSY_WHATSAPP_POLICY: "/x" }, () => "{ broken").enabled, false, "unparseable policy leaves it off");

console.log(`whatsapp policy: ${checks} checks passed`);
