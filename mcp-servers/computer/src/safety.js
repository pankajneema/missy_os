import path from "node:path";
import os from "node:os";

/** Everything dangerous is decided here, in pure functions, so it can be
 * tested without spawning anything. The server itself does no filtering. */

export class BlockedError extends Error {}

/** Folders the assistant may touch. Override with MISSY_ALLOWED_ROOTS
 * (colon-separated). Defaults to the home directory rather than "/". */
export function allowedRoots(env = process.env) {
  const raw = env.MISSY_ALLOWED_ROOTS;
  const roots = raw ? raw.split(":").filter(Boolean) : [os.homedir()];
  return roots.map((r) => path.resolve(r.replace(/^~/, os.homedir())));
}

/** Secrets that stay off-limits even inside an allowed root. Reading these
 * is how a "helpful" automation turns into credential theft. */
const DENIED_SEGMENTS = [
  ".ssh",
  ".aws",
  ".gnupg",
  ".gpg",
  "keychains",
  ".kube",
  ".docker/config.json",
  ".config/gh",
  ".netrc",
  ".npmrc",
  ".pypirc",
];

const DENIED_FILENAMES = [/^\.env(\..+)?$/i, /^id_(rsa|ed25519|ecdsa)$/i, /credentials$/i, /\.pem$/i, /\.p12$/i];

export function isDeniedPath(resolved) {
  const lower = resolved.toLowerCase();
  const parts = lower.split(path.sep);
  if (DENIED_SEGMENTS.some((seg) => (seg.includes("/") ? lower.includes(seg) : parts.includes(seg)))) return true;
  const base = path.basename(resolved);
  return DENIED_FILENAMES.some((re) => re.test(base));
}

/** Resolves a path and refuses anything outside the allowed roots, after
 * following symlinks the caller might use to escape them. */
export function resolveSafePath(input, { env = process.env, realpath = null } = {}) {
  if (typeof input !== "string" || input.trim() === "") throw new BlockedError("A path is required.");
  const expanded = input.replace(/^~(?=$|\/)/, os.homedir());
  let resolved = path.resolve(expanded);
  if (realpath) {
    try {
      resolved = realpath(resolved);
    } catch {
      // Not created yet (e.g. a write target) - check the parent instead.
      try {
        resolved = path.join(realpath(path.dirname(resolved)), path.basename(resolved));
      } catch {
        /* fall through with the lexically resolved path */
      }
    }
  }

  const roots = allowedRoots(env);
  const inRoot = roots.some((root) => resolved === root || resolved.startsWith(root + path.sep));
  if (!inRoot) {
    throw new BlockedError(`Path is outside the allowed folders (${roots.join(", ")}): ${resolved}`);
  }
  if (isDeniedPath(resolved)) {
    throw new BlockedError(`That path holds credentials and is blocked: ${resolved}`);
  }
  return resolved;
}

/** Commands refused outright. These are either irreversible, hand over the
 * whole machine, or ship data off it. */
const BLOCKED_COMMANDS = [
  { re: /\brm\s+(-[a-z]*\s+)*-[a-z]*[rf][a-z]*\s+(\/|~|\$HOME)(\s|$)/i, why: "recursive delete of the home or root directory" },
  { re: /\bmkfs(\.|\s)/i, why: "formatting a filesystem" },
  { re: /\bdd\b[^|]*\bof=\/dev\//i, why: "writing directly to a device" },
  { re: /\b(shutdown|reboot|halt|poweroff)\b/i, why: "shutting down the machine" },
  { re: /\bsudo\b|\bsu\s+-/i, why: "running with elevated privileges" },
  { re: /\bdiskutil\s+(erase|reformat)/i, why: "erasing a disk" },
  { re: /:\s*\(\s*\)\s*\{.*\}\s*;\s*:/, why: "a fork bomb" },
  { re: /\bsecurity\s+(dump-keychain|find-generic-password|find-internet-password)/i, why: "reading the keychain" },
  { re: /\b(curl|wget)\b[^|]*\|\s*(sudo\s+)?(ba|z|k|)sh\b/i, why: "piping a download straight into a shell" },
  { re: />\s*~?\/?\.ssh\/authorized_keys/i, why: "granting SSH access" },
  { re: /\bchmod\s+(-[a-z]*R[a-z]*\s+)?777\s+\/(\s|$)/i, why: "making the root filesystem world-writable" },
  { re: /\b(pkill|killall)\s+-9\s+(-1|launchd|kernel_task)/i, why: "killing critical system processes" },
  { re: /\bhistory\s+-c\b|\brm\s+.*\.(bash|zsh)_history/i, why: "erasing shell history" },
];

export function assertCommandAllowed(command, env = process.env) {
  if (typeof command !== "string" || command.trim() === "") throw new BlockedError("A command is required.");
  if (env.MISSY_READ_ONLY === "true") {
    throw new BlockedError("This server is in read-only mode (MISSY_READ_ONLY=true).");
  }
  for (const { re, why } of BLOCKED_COMMANDS) {
    if (re.test(command)) {
      throw new BlockedError(`Refused - that looks like ${why}. Run it yourself if you really mean it.`);
    }
  }
  return true;
}

export function assertWritesAllowed(env = process.env) {
  if (env.MISSY_READ_ONLY === "true") {
    throw new BlockedError("This server is in read-only mode (MISSY_READ_ONLY=true).");
  }
}

export const LIMITS = {
  commandTimeoutMs: Number(process.env.MISSY_COMMAND_TIMEOUT_MS ?? 30_000),
  maxOutputChars: 20_000,
  maxReadChars: 100_000,
};

export function truncate(text, max) {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n…[truncated ${text.length - max} more characters]`;
}
