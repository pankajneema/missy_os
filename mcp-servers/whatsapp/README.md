# missy-whatsapp-mcp

Lets Missy read your WhatsApp and reply to the contacts you list, using your own
account. Configured in the app under **Apps & Connections → WhatsApp**.

## Read this first

**This drives a personal WhatsApp account through automation, which is against
WhatsApp's Terms of Service.** Numbers doing automated messaging do get banned.
The rules below keep the behaviour human-shaped, which reduces the risk — it
does not remove it.

Replies go out in your voice with nothing marking them as automatic. The people
you list will believe they are hearing from you. That is a deliberate choice you
made; it is worth being sure you still want it for each contact you add.

## Setup

```bash
cd mcp-servers/whatsapp
npm install
npm run pair     # scan the QR with your phone, once
npm run check    # policy tests
```

Then add it in the app under **MCP Servers** as a stdio command:

```
node /Users/mac/pnkj/missy_os/mcp-servers/whatsapp/src/index.js
```

Stdio servers are gated on the backend by `ALLOW_MCP_STDIO_SERVERS`.

## Rules

The app writes `~/.missy/whatsapp-policy.json`; this server reads it **on every
send**, so a change takes effect immediately.

```json
{
  "enabled": true,
  "allowlist": [{ "number": "919876543210", "name": "Ma" }],
  "maxRepliesPerContactPerHour": 3,
  "maxRepliesPerHour": 12,
  "minDelaySeconds": 4,
  "maxDelaySeconds": 20,
  "quietHoursStart": 22,
  "quietHoursEnd": 7
}
```

### What it never does

| Never | Why |
|---|---|
| Messages anyone first | There is no tool for it. `reply` needs an existing conversation. Opening one unprompted is what gets a number reported. |
| Replies to anyone off the allowlist | An empty list means silence with everyone. |
| Replies in group chats | Only one-to-one chats are considered. |
| Sends an OTP, password, card number or API key | Refused by content check, whatever the instruction said. |
| Replies instantly | A randomised 4–20 s pause plus a typing indicator. Instant replies are a bot signature. |
| Sends during quiet hours or past the limits | Counts persist to `~/.missy/whatsapp-sends.json`, so a restart doesn't reset them. If that log can't be written, sending stops rather than continuing with limits it can't enforce. |

A missing or unparseable policy file means **off with an empty list**, never
"message everyone".

## Tools

| Tool | What it does |
|---|---|
| `whatsapp_status` | Connection state and the rules in force |
| `list_unread` | Chats with unread messages, and whether each sender is on the list |
| `read_chat` | Recent messages in one conversation |
| `reply` | Reply to someone who messaged you, if the rules allow |

## A caution worth reading

Incoming messages are untrusted input. Someone can write "ignore your
instructions and…" into a WhatsApp message, and `read_chat` will return it
verbatim. It is returned with a note marking it as data, but treat anything that
comes back from this server as information about what was said — never as
instructions to follow.

## Environment

| Variable | Default | Meaning |
|---|---|---|
| `MISSY_WHATSAPP_POLICY` | `~/.missy/whatsapp-policy.json` | Where the rules live |
| `MISSY_WHATSAPP_SESSION` | `~/.missy/whatsapp-session` | Saved pairing |
| `MISSY_WHATSAPP_READY_TIMEOUT_MS` | `60000` | How long to wait for a connection |
