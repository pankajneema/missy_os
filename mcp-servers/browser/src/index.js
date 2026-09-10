#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { chromium } from "playwright";
import { BlockedError, assertUrlAllowed, checkUrl, loadPolicy, policyPath } from "./policy.js";

/**
 * Lets Missy use a real browser. Every navigation goes through the site
 * permissions set in the app's Browser Use page - including redirects and
 * anything a page tries to open for itself, which is checked on the way out
 * rather than trusted because the first URL was fine.
 */

const HEADLESS = process.env.MISSY_BROWSER_HEADED !== "1";
const NAV_TIMEOUT_MS = Number(process.env.MISSY_BROWSER_TIMEOUT_MS || 30_000);
const MAX_TEXT = 20_000;

let browser = null;
let context = null;
let page = null;

async function getPage() {
  if (page && !page.isClosed()) return page;
  if (!browser) {
    browser = await chromium.launch({ headless: HEADLESS });
    browser.on("disconnected", () => {
      browser = null;
      context = null;
      page = null;
    });
  }
  if (!context) {
    context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    // A page can navigate itself, follow a redirect, or open an iframe to
    // somewhere the policy forbids. Checking only the URL we were asked for
    // would let any of those walk straight past the permissions.
    await context.route("**/*", async (route) => {
      const request = route.request();
      if (request.resourceType() !== "document") return route.continue();
      const decision = checkUrl(request.url(), loadPolicy());
      if (decision.allowed) return route.continue();
      return route.abort("blockedbyclient");
    });
  }
  page = await context.newPage();
  page.setDefaultTimeout(NAV_TIMEOUT_MS);
  return page;
}

async function readableText(p) {
  const text = await p.evaluate(() => {
    const drop = document.querySelectorAll("script, style, noscript, svg, iframe");
    drop.forEach((el) => el.remove());
    const main = document.querySelector("main, article, [role=main]") || document.body;
    return main ? main.innerText : "";
  });
  const trimmed = text.replace(/\n{3,}/g, "\n\n").trim();
  return trimmed.length > MAX_TEXT ? `${trimmed.slice(0, MAX_TEXT)}\n\n[… truncated]` : trimmed;
}

function textResult(text) {
  return { content: [{ type: "text", text }] };
}

function errorResult(err) {
  const message = err instanceof BlockedError ? `Blocked: ${err.message}` : `Failed: ${err?.message ?? String(err)}`;
  return { content: [{ type: "text", text: message }], isError: true };
}

const server = new McpServer({ name: "missy-browser", version: "0.1.0" });

server.registerTool(
  "browse",
  {
    title: "Open a web page",
    description:
      "Opens a URL in the browser and returns the readable text of the page. Subject to the site permissions set in Missy's Browser Use settings.",
    inputSchema: { url: z.string().describe("Full http(s) address, e.g. https://example.com/pricing") },
  },
  async ({ url }) => {
    try {
      assertUrlAllowed(url);
      const p = await getPage();
      const response = await p.goto(url, { waitUntil: "domcontentloaded" });
      // Where it ended up matters more than where it was sent: a redirect
      // could have landed somewhere the policy would have refused.
      assertUrlAllowed(p.url());
      const status = response ? response.status() : "unknown";
      return textResult(`${p.url()} (HTTP ${status})\n\n${await readableText(p)}`);
    } catch (err) {
      return errorResult(err);
    }
  },
);

server.registerTool(
  "read_page",
  {
    title: "Read the current page",
    description: "Returns the readable text of the page that is already open, without navigating anywhere.",
    inputSchema: {},
  },
  async () => {
    try {
      if (!page || page.isClosed()) return textResult("No page is open. Use browse first.");
      assertUrlAllowed(page.url());
      return textResult(`${page.url()}\n\n${await readableText(page)}`);
    } catch (err) {
      return errorResult(err);
    }
  },
);

server.registerTool(
  "find_links",
  {
    title: "List links on the page",
    description: "Lists the links on the current page, so a follow-up navigation can use a real URL.",
    inputSchema: { contains: z.string().optional().describe("Only links whose text or URL contains this") },
  },
  async ({ contains }) => {
    try {
      if (!page || page.isClosed()) return textResult("No page is open. Use browse first.");
      const links = await page.evaluate(() =>
        Array.from(document.querySelectorAll("a[href]"))
          .map((a) => ({ text: (a.innerText || "").trim().slice(0, 80), href: a.href }))
          .filter((l) => l.href.startsWith("http")),
      );
      const needle = (contains || "").toLowerCase();
      const filtered = needle
        ? links.filter((l) => l.text.toLowerCase().includes(needle) || l.href.toLowerCase().includes(needle))
        : links;
      const unique = [...new Map(filtered.map((l) => [l.href, l])).values()].slice(0, 100);
      if (!unique.length) return textResult("No matching links.");
      return textResult(unique.map((l) => `- ${l.text || "(no text)"} → ${l.href}`).join("\n"));
    } catch (err) {
      return errorResult(err);
    }
  },
);

server.registerTool(
  "click",
  {
    title: "Click something",
    description: "Clicks a link, button or element on the current page, found by its visible text.",
    inputSchema: { text: z.string().describe("The visible text of the thing to click") },
  },
  async ({ text }) => {
    try {
      if (!page || page.isClosed()) return textResult("No page is open. Use browse first.");
      await page.getByText(text, { exact: false }).first().click({ timeout: NAV_TIMEOUT_MS });
      await page.waitForLoadState("domcontentloaded").catch(() => {});
      assertUrlAllowed(page.url());
      return textResult(`Clicked “${text}”. Now on ${page.url()}\n\n${await readableText(page)}`);
    } catch (err) {
      return errorResult(err);
    }
  },
);

server.registerTool(
  "type_text",
  {
    title: "Type into a field",
    description:
      "Types into a form field on the current page, found by its label or placeholder. Never use this for passwords, card numbers or other credentials.",
    inputSchema: {
      field: z.string().describe("Label or placeholder of the field"),
      text: z.string().describe("What to type"),
      submit: z.boolean().optional().describe("Press Enter afterwards"),
    },
  },
  async ({ field, text, submit }) => {
    try {
      if (!page || page.isClosed()) return textResult("No page is open. Use browse first.");
      const box = page.getByLabel(field).or(page.getByPlaceholder(field)).first();
      await box.fill(text, { timeout: NAV_TIMEOUT_MS });
      if (submit) {
        await box.press("Enter");
        await page.waitForLoadState("domcontentloaded").catch(() => {});
        assertUrlAllowed(page.url());
      }
      return textResult(`Typed into “${field}”.${submit ? ` Now on ${page.url()}` : ""}`);
    } catch (err) {
      return errorResult(err);
    }
  },
);

server.registerTool(
  "screenshot",
  {
    title: "Screenshot the page",
    description: "Takes a picture of the current page.",
    inputSchema: { fullPage: z.boolean().optional() },
  },
  async ({ fullPage }) => {
    try {
      if (!page || page.isClosed()) return textResult("No page is open. Use browse first.");
      const buffer = await page.screenshot({ fullPage: Boolean(fullPage) });
      return { content: [{ type: "image", data: buffer.toString("base64"), mimeType: "image/png" }] };
    } catch (err) {
      return errorResult(err);
    }
  },
);

server.registerTool(
  "browser_permissions",
  {
    title: "What am I allowed to browse?",
    description: "Reports the current site permissions, so the assistant can say why something was refused.",
    inputSchema: {},
  },
  async () => {
    const policy = loadPolicy();
    const lines = [
      `Policy file: ${policyPath()}`,
      `Browser use: ${policy.enabled ? "on" : "off"}`,
      `Default: ${policy.defaultMode === "allow_all" ? "allow all sites" : "block all sites"}`,
      `Blocked: ${policy.blocked.length ? policy.blocked.join(", ") : "(none)"}`,
      `Allowed: ${policy.allowed.length ? policy.allowed.join(", ") : "(none)"}`,
    ];
    return textResult(lines.join("\n"));
  },
);

server.registerTool(
  "close_browser",
  { title: "Close the browser", description: "Shuts the browser down and frees its memory.", inputSchema: {} },
  async () => {
    if (browser) await browser.close().catch(() => {});
    browser = null;
    context = null;
    page = null;
    return textResult("Browser closed.");
  },
);

async function main() {
  await server.connect(new StdioServerTransport());
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, async () => {
    if (browser) await browser.close().catch(() => {});
    process.exit(0);
  });
}

main().catch((err) => {
  console.error("missy-browser-mcp failed to start:", err);
  process.exit(1);
});
