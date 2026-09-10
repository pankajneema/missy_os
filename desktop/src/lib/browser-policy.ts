/** Site permissions for Missy's browser use.
 *
 * The browser MCP server (mcp-servers/browser) reads this as JSON from
 * ~/.missy/browser-policy.json and enforces it on every navigation. The copy
 * kept in localStorage is only what this page renders - the file is what
 * actually decides, so saving has to reach the disk or the setting is a lie.
 */

export type DefaultMode = "allow_all" | "block_all";

export interface BrowserPolicy {
  enabled: boolean;
  defaultMode: DefaultMode;
  blocked: string[];
  allowed: string[];
}

export const DEFAULT_POLICY: BrowserPolicy = {
  enabled: false,
  defaultMode: "block_all",
  blocked: [],
  allowed: [],
};

export const POLICY_FILE = ".missy/browser-policy.json";

/** True inside the packaged desktop app, false in a plain browser tab - the
 * file APIs only exist in the former. */
export function canWritePolicyFile(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/** Same normalising the server does, so what you see listed is what will be
 * matched: no scheme, no path, no "www.", no wildcard. */
export function normaliseDomain(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/^\*\./, "")
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/^www\./, "")
    .replace(/:\d+$/, "");
}

export function isValidDomain(input: string): boolean {
  const d = normaliseDomain(input);
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d);
}

export function serialisePolicy(policy: BrowserPolicy): string {
  return `${JSON.stringify(policy, null, 2)}\n`;
}

/**
 * Writes the policy where the MCP server will read it. Throws if it can't -
 * the caller must surface that rather than showing a saved state, because a
 * failed write leaves the previous permissions in force.
 */
export async function writePolicyFile(policy: BrowserPolicy): Promise<string> {
  const { writeTextFile, mkdir, BaseDirectory } = await import("@tauri-apps/plugin-fs");
  await mkdir(".missy", { baseDir: BaseDirectory.Home, recursive: true }).catch(() => {
    /* already there */
  });
  await writeTextFile(POLICY_FILE, serialisePolicy(policy), { baseDir: BaseDirectory.Home });
  return `~/${POLICY_FILE}`;
}

export async function readPolicyFile(): Promise<BrowserPolicy | null> {
  try {
    const { readTextFile, BaseDirectory } = await import("@tauri-apps/plugin-fs");
    const raw = await readTextFile(POLICY_FILE, { baseDir: BaseDirectory.Home });
    const parsed = JSON.parse(raw) as Partial<BrowserPolicy>;
    return {
      enabled: Boolean(parsed.enabled),
      defaultMode: parsed.defaultMode === "allow_all" ? "allow_all" : "block_all",
      blocked: Array.isArray(parsed.blocked) ? parsed.blocked : [],
      allowed: Array.isArray(parsed.allowed) ? parsed.allowed : [],
    };
  } catch {
    return null;
  }
}
