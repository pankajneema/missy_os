#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import { realpathSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  BlockedError,
  LIMITS,
  allowedRoots,
  assertCommandAllowed,
  assertWritesAllowed,
  resolveSafePath,
  truncate,
} from "./safety.js";

const execAsync = promisify(exec);
const safePath = (p) => resolveSafePath(p, { realpath: realpathSync });

/** Every tool funnels through this so a blocked action comes back as a
 * readable message the model can act on, not an unhandled crash. */
function ok(text) {
  return { content: [{ type: "text", text }] };
}
function fail(error) {
  const message = error instanceof BlockedError ? error.message : `Failed: ${error?.message ?? String(error)}`;
  return { content: [{ type: "text", text: message }], isError: true };
}
async function guard(fn) {
  try {
    return await fn();
  } catch (error) {
    return fail(error);
  }
}

const server = new McpServer({ name: "missy-computer", version: "0.1.0" });

server.registerTool(
  "run_command",
  {
    title: "Run a shell command",
    description:
      "Run a shell command on this computer and return its output. Use this for things there's no dedicated tool for. Destructive commands (wiping disks, shutting down, sudo, piping downloads into a shell) are refused.",
    inputSchema: {
      command: z.string().describe("The shell command to run, e.g. 'ls -la ~/Documents'"),
      cwd: z.string().optional().describe("Directory to run it in. Defaults to the home directory."),
    },
  },
  async ({ command, cwd }) =>
    guard(async () => {
      assertCommandAllowed(command);
      const workingDir = cwd ? safePath(cwd) : os.homedir();
      try {
        const { stdout, stderr } = await execAsync(command, {
          cwd: workingDir,
          timeout: LIMITS.commandTimeoutMs,
          maxBuffer: 10 * 1024 * 1024,
        });
        const out = [stdout && `stdout:\n${stdout}`, stderr && `stderr:\n${stderr}`].filter(Boolean).join("\n\n");
        return ok(truncate(out || "(command produced no output)", LIMITS.maxOutputChars));
      } catch (error) {
        if (error.killed) return ok(`Timed out after ${LIMITS.commandTimeoutMs}ms.`);
        // A non-zero exit is information, not a crash - hand it back as-is.
        const out = [error.stdout && `stdout:\n${error.stdout}`, error.stderr && `stderr:\n${error.stderr}`]
          .filter(Boolean)
          .join("\n\n");
        return ok(truncate(`Exit code ${error.code ?? "?"}\n${out}`, LIMITS.maxOutputChars));
      }
    }),
);

server.registerTool(
  "read_file",
  {
    title: "Read a file",
    description: "Read a text file from an allowed folder.",
    inputSchema: { path: z.string().describe("File to read, e.g. '~/Documents/notes.md'") },
  },
  async ({ path: target }) =>
    guard(async () => {
      const resolved = safePath(target);
      const content = await fs.readFile(resolved, "utf8");
      return ok(truncate(content, LIMITS.maxReadChars));
    }),
);

server.registerTool(
  "write_file",
  {
    title: "Write a file",
    description: "Create or overwrite a text file in an allowed folder. Overwrites without warning, so read first if the file matters.",
    inputSchema: {
      path: z.string().describe("File to write"),
      content: z.string().describe("Full contents to write"),
    },
  },
  async ({ path: target, content }) =>
    guard(async () => {
      assertWritesAllowed();
      const resolved = safePath(target);
      await fs.mkdir(path.dirname(resolved), { recursive: true });
      await fs.writeFile(resolved, content, "utf8");
      return ok(`Wrote ${content.length} characters to ${resolved}`);
    }),
);

server.registerTool(
  "list_directory",
  {
    title: "List a folder",
    description: "List the files and folders at a path.",
    inputSchema: { path: z.string().describe("Folder to list, e.g. '~/Documents'") },
  },
  async ({ path: target }) =>
    guard(async () => {
      const resolved = safePath(target);
      const entries = await fs.readdir(resolved, { withFileTypes: true });
      const lines = entries.map((e) => `${e.isDirectory() ? "dir " : "file"}  ${e.name}`).sort();
      return ok(truncate(lines.join("\n") || "(empty folder)", LIMITS.maxOutputChars));
    }),
);

server.registerTool(
  "open_path",
  {
    title: "Open a file, folder, app or URL",
    description: "Open something in its default application — a document, a folder, an app by name, or a URL.",
    inputSchema: {
      target: z.string().describe("A path, an app name like 'Safari', or an https URL"),
    },
  },
  async ({ target }) =>
    guard(async () => {
      assertWritesAllowed();
      const isUrl = /^https?:\/\//i.test(target);
      const isAppName = !isUrl && !target.includes("/");
      if (!isUrl && !isAppName) safePath(target); // paths still have to be in an allowed root

      const opener = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
      const args = isAppName && process.platform === "darwin" ? `-a ${JSON.stringify(target)}` : JSON.stringify(target);
      await execAsync(`${opener} ${args}`, { timeout: LIMITS.commandTimeoutMs });
      return ok(`Opened ${target}`);
    }),
);

server.registerTool(
  "system_info",
  {
    title: "System info",
    description: "Basic facts about this computer and what this server is allowed to touch.",
    inputSchema: {},
  },
  async () =>
    guard(async () => {
      const info = {
        platform: process.platform,
        release: os.release(),
        hostname: os.hostname(),
        user: os.userInfo().username,
        homedir: os.homedir(),
        cpus: os.cpus().length,
        totalMemGB: Math.round(os.totalmem() / 1e9),
        freeMemGB: Math.round(os.freemem() / 1e9),
        allowedRoots: allowedRoots(),
        readOnly: process.env.MISSY_READ_ONLY === "true",
      };
      return ok(JSON.stringify(info, null, 2));
    }),
);

const transport = new StdioServerTransport();
await server.connect(transport);
