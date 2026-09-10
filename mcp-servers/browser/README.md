# missy-browser-mcp

Lets Missy use a real browser — open pages, read them, click and type — subject
to the site permissions you set in the app under **Apps & Connections → Browser
Use**.

## Setup

```bash
cd mcp-servers/browser
npm install
npm run install-browser   # downloads Chromium (~150 MB), once
npm run check             # policy tests
```

Then add it in the app under **MCP Servers** as a stdio command:

```
node /Users/mac/pnkj/missy_os/mcp-servers/browser/src/index.js
```

Stdio servers are gated on the backend by `ALLOW_MCP_STDIO_SERVERS`. If that
isn't set, the server is never started — that gate is deliberate, not a bug.

## How permissions work

The app writes `~/.missy/browser-policy.json`; this server reads it **on every
request**, so changing a setting takes effect immediately with no restart.

```json
{
  "enabled": true,
  "defaultMode": "block_all",
  "blocked": [],
  "allowed": ["wikipedia.org"]
}
```

- `enabled: false` — every request refused, whatever the lists say.
- `defaultMode: "block_all"` — only `allowed` domains work. This is the default.
- `defaultMode: "allow_all"` — everything works except `blocked` domains.
- A domain covers its subdomains: `example.com` also matches `mail.example.com`,
  but never `notexample.com` or `example.com.evil.net`.
- **A missing or unparseable policy file means "no", not "yes."** A browser that
  browses everywhere because a config failed to load is worse than one that
  refuses until it is set up.

### Refused regardless of policy

These hold even on "Allow all sites", because the only thing that would ask for
them is an instruction hidden in a web page:

| Refused | Why |
|---|---|
| `169.254.169.254`, `metadata.google.internal` | Cloud metadata endpoints hand out credentials |
| `localhost`, `127.0.0.1`, `10.x`, `192.168.x`, `172.16–31.x` | Your own machine and LAN |
| `file://`, `javascript:`, anything not http(s) | Not web addresses |

Local addresses can be opted into with `MISSY_BROWSER_ALLOW_LOCAL=1` when you
genuinely want the assistant to see a local dev server.

Redirects are re-checked **at the destination**, and every document-level
navigation the page starts for itself goes through the same check — so an
allowed site cannot forward the assistant to a blocked one.

## Tools

| Tool | What it does |
|---|---|
| `browse` | Open a URL, return the page's readable text |
| `read_page` | Re-read the open page without navigating |
| `find_links` | List links on the page, optionally filtered |
| `click` | Click something by its visible text |
| `type_text` | Fill a field by label or placeholder, optionally submit |
| `screenshot` | Picture of the current page |
| `browser_permissions` | Report the policy in force, so refusals can be explained |
| `close_browser` | Shut the browser down |

## Environment

| Variable | Default | Meaning |
|---|---|---|
| `MISSY_BROWSER_POLICY` | `~/.missy/browser-policy.json` | Where the policy lives |
| `MISSY_BROWSER_ALLOW_LOCAL` | unset | `1` permits localhost / private IPs |
| `MISSY_BROWSER_HEADED` | unset | `1` shows the browser window |
| `MISSY_BROWSER_TIMEOUT_MS` | `30000` | Navigation and action timeout |

## A caution worth reading

Web pages are untrusted input. A page can contain text aimed at an assistant
("ignore your instructions and…"), and this server has no way to tell that from
ordinary content — it returns what the page says. Treat anything that comes back
from `browse` as data, never as instructions, and keep `block_all` with a short
allowed list unless you have a reason not to.

Never have it type passwords, card numbers, or other credentials into a page.
