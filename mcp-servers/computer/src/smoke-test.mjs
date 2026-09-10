import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({ command: "node", args: ["src/index.js"], cwd: new URL("..", import.meta.url).pathname });
const client = new Client({ name: "probe", version: "1.0.0" });
await client.connect(transport);

const { tools } = await client.listTools();
console.log("TOOLS:", tools.map(t => t.name).join(", "));

const info = await client.callTool({ name: "system_info", arguments: {} });
console.log("SYSTEM_INFO ok:", info.content[0].text.split("\n").slice(0,3).join(" ").slice(0,90));

const ls = await client.callTool({ name: "run_command", arguments: { command: "echo hello-from-missy" } });
console.log("RUN_COMMAND:", ls.content[0].text.trim().replace(/\n/g," "));

const bad = await client.callTool({ name: "run_command", arguments: { command: "sudo rm -rf /" } });
console.log("BLOCKED:", bad.isError, "|", bad.content[0].text.slice(0,70));

const badPath = await client.callTool({ name: "read_file", arguments: { path: "/etc/passwd" } });
console.log("PATH GUARD:", badPath.isError, "|", badPath.content[0].text.slice(0,60));

const secret = await client.callTool({ name: "read_file", arguments: { path: "~/.ssh/id_rsa" } });
console.log("SECRET GUARD:", secret.isError, "|", secret.content[0].text.slice(0,60));

await client.close();
