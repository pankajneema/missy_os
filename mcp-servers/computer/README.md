# Missy Computer Control (MCP)

Lets Missy act on this machine: run commands, read and write files, list folders,
and open apps or URLs.

This is a **local (stdio) MCP server** — it runs on your machine, not in the cloud.

## Tools

| Tool | What it does |
| --- | --- |
| `run_command` | Runs a shell command and returns stdout/stderr |
| `read_file` | Reads a text file |
| `write_file` | Creates or overwrites a text file |
| `list_directory` | Lists a folder |
| `open_path` | Opens a file, folder, app by name, or URL |
| `system_info` | Platform, memory, and what this server is allowed to touch |

## Setup

```bash
cd mcp-servers/computer
npm install
```

Then in Missy: **Work → Apps & Connections → Connected**, add a server with

- Transport: `stdio (local)`
- Command: `node`
- Arguments: `/absolute/path/to/missy_os/mcp-servers/computer/src/index.js`

The backend refuses local servers unless `ALLOW_MCP_STDIO_SERVERS=true` is set in
`backend/.env`. That's deliberate — this server runs commands as you.

## What it will not do

Guards live in `src/safety.js` and are covered by `src/safety.test.js` (39 assertions).

**Blocked commands** — recursive deletes of `/` or `~`, `sudo`/`su`, disk formatting,
`dd` to a device, shutdown/reboot, fork bombs, keychain dumps, piping a download
into a shell, appending to `authorized_keys`, wiping shell history.

**Path containment** — file access is confined to `MISSY_ALLOWED_ROOTS`
(default: your home directory). Symlinks are resolved first, so a link can't be
used to escape. `../` traversal is rejected.

**Secrets stay off-limits even inside allowed folders** — `.ssh`, `.aws`, `.gnupg`,
keychains, `.kube`, `.npmrc`, `.netrc`, `.env` files, `*.pem`, `*.p12`, private keys.

These are guardrails against mistakes, not a security sandbox. A shell is a shell:
anything you could type, it can broadly run. Only enable it on a machine you own.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `MISSY_ALLOWED_ROOTS` | your home dir | Colon-separated folders it may touch |
| `MISSY_READ_ONLY` | `false` | `true` blocks all commands and writes |
| `MISSY_COMMAND_TIMEOUT_MS` | `30000` | Per-command timeout |

To limit it to one project:

```
MISSY_ALLOWED_ROOTS=/Users/you/projects/thing
```

## Tests

```bash
npm run check   # syntax + 39 safety assertions
npm run smoke   # starts the server, calls tools over MCP, checks the guards fire
```
