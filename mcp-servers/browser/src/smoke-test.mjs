import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import fs from "node:fs";

const POLICY = "/private/tmp/claude-501/-Users-mac-leviathan/9e794b0b-e107-4571-aaba-ea38c4d456f5/scratchpad/policy.json";

async function withPolicy(policy, fn) {
  fs.writeFileSync(POLICY, JSON.stringify(policy));
  const transport = new StdioClientTransport({
    command: "node",
    args: ["/Users/mac/pnkj/missy_os/mcp-servers/browser/src/index.js"],
    env: { ...process.env, MISSY_BROWSER_POLICY: POLICY },
  });
  const client = new Client({ name: "smoke", version: "1.0.0" });
  await client.connect(transport);
  try { return await fn(client); } finally { await client.close(); }
}

const say = (r) => (r.content?.[0]?.text ?? "(no text)").split("\n").slice(0, 2).join(" / ").slice(0, 150);

// 1. Tools are exposed
await withPolicy({ enabled: false }, async (c) => {
  const { tools } = await c.listTools();
  console.log("tools:", tools.map((t) => t.name).join(", "));
});

// 2. Disabled => refuses
await withPolicy({ enabled: false, defaultMode: "allow_all" }, async (c) => {
  const r = await c.callTool({ name: "browse", arguments: { url: "https://example.com" } });
  console.log("OFF          ->", say(r));
});

// 3. Block-all with nothing allowed => refuses
await withPolicy({ enabled: true, defaultMode: "block_all", allowed: [], blocked: [] }, async (c) => {
  const r = await c.callTool({ name: "browse", arguments: { url: "https://example.com" } });
  console.log("BLOCK-ALL    ->", say(r));
});

// 4. Blocked list wins even in allow-all
await withPolicy({ enabled: true, defaultMode: "allow_all", blocked: ["example.com"] }, async (c) => {
  const r = await c.callTool({ name: "browse", arguments: { url: "https://www.example.com" } });
  console.log("BLOCKED SITE ->", say(r));
});

// 5. Local/metadata never allowed
await withPolicy({ enabled: true, defaultMode: "allow_all" }, async (c) => {
  for (const url of ["http://169.254.169.254/latest/meta-data/", "http://localhost:8000/docs", "file:///etc/passwd"]) {
    const r = await c.callTool({ name: "browse", arguments: { url } });
    console.log("NEVER        ->", url, "=>", say(r));
  }
});

// 6. Allowed site actually loads
await withPolicy({ enabled: true, defaultMode: "block_all", allowed: ["example.com"] }, async (c) => {
  const r = await c.callTool({ name: "browse", arguments: { url: "https://example.com" } });
  console.log("ALLOWED      ->", say(r));
  const p = await c.callTool({ name: "browser_permissions", arguments: {} });
  console.log("PERMISSIONS  ->", (p.content[0].text).replace(/\n/g, " | "));
});
