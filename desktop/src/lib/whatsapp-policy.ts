/** Who Missy may auto-reply to on WhatsApp, and how often.
 *
 * Written to ~/.missy/whatsapp-policy.json, which the WhatsApp MCP server
 * reads on every send. The copy in localStorage is only what this page draws.
 */

export interface WhatsAppContact {
  number: string;
  name: string;
}

export interface WhatsAppPolicy {
  enabled: boolean;
  allowlist: WhatsAppContact[];
  maxRepliesPerContactPerHour: number;
  maxRepliesPerHour: number;
  minDelaySeconds: number;
  maxDelaySeconds: number;
  quietHoursStart: number;
  quietHoursEnd: number;
}

export const DEFAULT_WHATSAPP_POLICY: WhatsAppPolicy = {
  enabled: false,
  allowlist: [],
  maxRepliesPerContactPerHour: 3,
  maxRepliesPerHour: 12,
  minDelaySeconds: 4,
  maxDelaySeconds: 20,
  quietHoursStart: 22,
  quietHoursEnd: 7,
};

export const WHATSAPP_POLICY_FILE = ".missy/whatsapp-policy.json";

/** Digits only — the server compares numbers the same way. */
export function normaliseNumber(input: string): string {
  return input.replace(/\D/g, "");
}

export function isValidNumber(input: string): boolean {
  const digits = normaliseNumber(input);
  return digits.length >= 8 && digits.length <= 15;
}

/** How it will look in the list: +91 98765 43210 */
export function formatNumber(digits: string): string {
  if (digits.length === 12 && digits.startsWith("91")) {
    return `+91 ${digits.slice(2, 7)} ${digits.slice(7)}`;
  }
  if (digits.length === 10) return `${digits.slice(0, 5)} ${digits.slice(5)}`;
  return `+${digits}`;
}

export function serialiseWhatsAppPolicy(policy: WhatsAppPolicy): string {
  return `${JSON.stringify(policy, null, 2)}\n`;
}

export async function writeWhatsAppPolicy(policy: WhatsAppPolicy): Promise<string> {
  const { writeTextFile, mkdir, BaseDirectory } = await import("@tauri-apps/plugin-fs");
  await mkdir(".missy", { baseDir: BaseDirectory.Home, recursive: true }).catch(() => {
    /* already there */
  });
  await writeTextFile(WHATSAPP_POLICY_FILE, serialiseWhatsAppPolicy(policy), { baseDir: BaseDirectory.Home });
  return `~/${WHATSAPP_POLICY_FILE}`;
}

export async function readWhatsAppPolicy(): Promise<WhatsAppPolicy | null> {
  try {
    const { readTextFile, BaseDirectory } = await import("@tauri-apps/plugin-fs");
    const raw = await readTextFile(WHATSAPP_POLICY_FILE, { baseDir: BaseDirectory.Home });
    return { ...DEFAULT_WHATSAPP_POLICY, ...(JSON.parse(raw) as Partial<WhatsAppPolicy>) };
  } catch {
    return null;
  }
}
