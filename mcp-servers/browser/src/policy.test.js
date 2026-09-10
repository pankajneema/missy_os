import assert from "node:assert/strict";
import { checkUrl, hostMatches, hostOf, loadPolicy } from "./policy.js";

let checks = 0;
function ok(actual, expected, label) {
  checks++;
  assert.equal(actual, expected, label);
}

const allowAll = { enabled: true, defaultMode: "allow_all", blocked: [], allowed: [] };
const blockAll = { enabled: true, defaultMode: "block_all", blocked: [], allowed: [] };

// --- host extraction ---
ok(hostOf("https://www.Example.com/path?q=1"), "example.com", "strips scheme, www, path and case");
ok(hostOf("http://mail.example.com:8080/x"), "mail.example.com", "keeps subdomain, drops port");
ok(hostOf("file:///etc/passwd"), null, "file:// is not a web address");
ok(hostOf("javascript:alert(1)"), null, "javascript: is not a web address");
ok(hostOf("not a url"), null, "junk is not a web address");

// --- rule matching ---
ok(hostMatches("example.com", "example.com"), true, "exact");
ok(hostMatches("mail.example.com", "example.com"), true, "subdomain covered by parent");
ok(hostMatches("notexample.com", "example.com"), false, "suffix alone is not a match");
ok(hostMatches("example.com.evil.net", "example.com"), false, "cannot be spoofed by a longer host");
ok(hostMatches("mail.example.com", "*.example.com"), true, "leading wildcard tolerated");
ok(hostMatches("example.com", "https://example.com/some/path"), true, "a pasted URL works as a rule");

// --- the off switch ---
ok(checkUrl("https://example.com", { ...allowAll, enabled: false }).allowed, false, "disabled blocks everything");

// --- allow-all mode ---
ok(checkUrl("https://anything.dev", allowAll).allowed, true, "allow-all permits an ordinary site");
ok(
  checkUrl("https://ads.example.com", { ...allowAll, blocked: ["example.com"] }).allowed,
  false,
  "the blocked list still wins in allow-all mode",
);

// --- block-all mode ---
ok(checkUrl("https://anything.dev", blockAll).allowed, false, "block-all refuses by default");
ok(
  checkUrl("https://docs.python.org", { ...blockAll, allowed: ["python.org"] }).allowed,
  true,
  "block-all permits a listed site and its subdomains",
);
ok(
  checkUrl("https://evil.net", { ...blockAll, allowed: ["python.org"] }).allowed,
  false,
  "block-all still refuses an unlisted site",
);

// --- things that are never allowed ---
ok(checkUrl("https://169.254.169.254/latest/meta-data/", allowAll).allowed, false, "cloud metadata IP");
ok(checkUrl("http://metadata.google.internal/", allowAll).allowed, false, "cloud metadata host");
ok(checkUrl("file:///Users/mac/.ssh/id_rsa", allowAll).allowed, false, "local file");
ok(checkUrl("http://localhost:8000/admin", allowAll, {}).allowed, false, "localhost is off by default");
ok(checkUrl("http://127.0.0.1:8000/", allowAll, {}).allowed, false, "loopback IP is off by default");
ok(checkUrl("http://192.168.1.1/", allowAll, {}).allowed, false, "private LAN is off by default");
ok(checkUrl("http://10.0.0.5/", allowAll, {}).allowed, false, "private 10/8 is off by default");
ok(checkUrl("http://172.16.0.1/", allowAll, {}).allowed, false, "private 172.16/12 is off by default");
ok(
  checkUrl("http://localhost:5173/", allowAll, { MISSY_BROWSER_ALLOW_LOCAL: "1" }).allowed,
  true,
  "localhost can be opted into for local dev",
);

// --- a missing or broken policy file means no, not yes ---
const missing = loadPolicy({ MISSY_BROWSER_POLICY: "/nope/does-not-exist.json" });
ok(missing.enabled, false, "absent policy file leaves browsing disabled");
ok(
  loadPolicy({ MISSY_BROWSER_POLICY: "/x" }, () => "{ not json").defaultMode,
  "block_all",
  "unparseable policy falls back to block-all",
);

// --- reasons are useful, not just "denied" ---
assert.match(checkUrl("https://x.dev", blockAll).reason, /allowed list/, "explains how to fix a block-all refusal");
assert.match(
  checkUrl("https://x.dev", { ...allowAll, blocked: ["x.dev"] }).reason,
  /blocked list/,
  "explains a blocklist refusal",
);
checks += 2;

console.log(`browser policy: ${checks} checks passed`);
