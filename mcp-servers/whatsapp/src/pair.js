#!/usr/bin/env node
import os from "node:os";
import path from "node:path";
import pkg from "whatsapp-web.js";
import qrcode from "qrcode-terminal";

const { Client, LocalAuth } = pkg;

/**
 * One-off pairing. Run this yourself, in a terminal, and scan the code with
 * your phone. The session is then saved so the MCP server can connect without
 * a QR every time.
 *
 * Kept separate from the server on purpose: pairing needs a human looking at a
 * screen, and the server runs unattended.
 */

const SESSION_DIR = process.env.MISSY_WHATSAPP_SESSION || path.join(os.homedir(), ".missy", "whatsapp-session");

console.log("Pairing Missy with your WhatsApp account.");
console.log(`Session will be saved to: ${SESSION_DIR}\n`);

const client = new Client({
  authStrategy: new LocalAuth({ dataPath: SESSION_DIR }),
  puppeteer: { headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] },
});

client.on("qr", (qr) => {
  console.log("On your phone: WhatsApp → Settings → Linked devices → Link a device,");
  console.log("then scan this:\n");
  qrcode.generate(qr, { small: true });
});

client.on("authenticated", () => console.log("\nAuthenticated."));

client.on("ready", async () => {
  const me = client.info?.wid?.user;
  console.log(`\nPaired as ${me ?? "your account"}. You can close this.`);
  console.log("Missy will only reply to the contacts you list under WhatsApp in the app.");
  await client.destroy();
  process.exit(0);
});

client.on("auth_failure", (message) => {
  console.error(`\nPairing failed: ${message}`);
  process.exit(1);
});

client.initialize();
