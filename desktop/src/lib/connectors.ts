export type ConnectorCategory =
  | "Messaging & Email"
  | "Calendar & Meetings"
  | "Tasks & Projects"
  | "Files & Notes"
  | "Social"
  | "Computer & Browser";

/** How connectable something actually is today:
 *  - "remote": a hosted MCP endpoint exists, so Connect really works now.
 *  - "local":  a local (stdio) MCP server exists, but this backend blocks
 *              stdio unless ALLOW_MCP_STDIO_SERVERS=true is set in .env.
 *  - "none":   no dependable MCP server exists yet - shown so the catalogue
 *              is honest about the gap instead of offering a dead button. */
export type ConnectorAvailability = "remote" | "local" | "none";

export interface Connector {
  id: string;
  name: string;
  category: ConnectorCategory;
  /** What Missy would be able to do once it's connected. */
  does: string;
  availability: ConnectorAvailability;
  url?: string;
  command?: string;
  args?: string[];
  /** Credentials the server needs, so the user knows what to have ready. */
  envHint?: string;
  note?: string;
}

export const CONNECTORS: Connector[] = [
  // --- Messaging & Email ---
  {
    id: "slack",
    name: "Slack",
    category: "Messaging & Email",
    does: "Read channels and send messages on your behalf.",
    availability: "local",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-slack"],
    envHint: "SLACK_BOT_TOKEN, SLACK_TEAM_ID",
  },
  {
    id: "gmail",
    name: "Gmail",
    category: "Messaging & Email",
    does: "Read, draft and send email.",
    availability: "local",
    command: "npx",
    args: ["-y", "@gongrzhe/server-gmail-autoauth-mcp"],
    note: "Community server — you authorise it with your own Google account.",
  },
  {
    id: "whatsapp",
    name: "WhatsApp",
    category: "Messaging & Email",
    does: "Read and reply to your chats.",
    availability: "none",
    note: "No dependable MCP server — WhatsApp has no personal API, so this needs a custom local bridge.",
  },
  {
    id: "telegram",
    name: "Telegram",
    category: "Messaging & Email",
    does: "Read and send Telegram messages.",
    availability: "none",
    note: "Possible via a bot token, but there's no maintained server — needs a custom MCP server.",
  },
  {
    id: "outlook-mail",
    name: "Outlook Mail",
    category: "Messaging & Email",
    does: "Read and send email from Microsoft 365.",
    availability: "none",
    note: "Needs a custom server against the Microsoft Graph API.",
  },

  // --- Calendar & Meetings ---
  {
    id: "google-calendar",
    name: "Google Calendar",
    category: "Calendar & Meetings",
    does: "Pull today's meetings into Today, and create events.",
    availability: "local",
    command: "npx",
    args: ["-y", "@cocal/google-calendar-mcp"],
    note: "Community server — you authorise it with your own Google account.",
  },
  {
    id: "outlook-calendar",
    name: "Outlook Calendar",
    category: "Calendar & Meetings",
    does: "Pull Microsoft 365 meetings into Today.",
    availability: "none",
    note: "Needs a custom server against the Microsoft Graph API.",
  },
  {
    id: "zoom",
    name: "Zoom",
    category: "Calendar & Meetings",
    does: "See upcoming calls and fetch recordings.",
    availability: "none",
    note: "No maintained MCP server yet.",
  },
  {
    id: "fireflies",
    name: "Fireflies",
    category: "Calendar & Meetings",
    does: "Fetch meeting transcripts and action items.",
    availability: "remote",
    url: "https://api.fireflies.ai/mcp",
    envHint: "Fireflies API key",
    note: "Verify the endpoint against Fireflies' current docs before relying on it.",
  },

  // --- Tasks & Projects ---
  {
    id: "linear",
    name: "Linear",
    category: "Tasks & Projects",
    does: "Read and create issues, and pull your assigned work into Tasks.",
    availability: "remote",
    url: "https://mcp.linear.app/sse",
  },
  {
    id: "atlassian",
    name: "Jira & Confluence",
    category: "Tasks & Projects",
    does: "Read tickets and pages, and create issues.",
    availability: "remote",
    url: "https://mcp.atlassian.com/v1/sse",
  },
  {
    id: "asana",
    name: "Asana",
    category: "Tasks & Projects",
    does: "Read and update tasks and projects.",
    availability: "remote",
    url: "https://mcp.asana.com/sse",
  },
  {
    id: "github",
    name: "GitHub",
    category: "Tasks & Projects",
    does: "Read issues and PRs, and open new ones.",
    availability: "local",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-github"],
    envHint: "GITHUB_PERSONAL_ACCESS_TOKEN",
  },
  {
    id: "todoist",
    name: "Todoist",
    category: "Tasks & Projects",
    does: "Sync your existing to-do list into Tasks.",
    availability: "local",
    command: "npx",
    args: ["-y", "@abhiz123/todoist-mcp-server"],
    envHint: "TODOIST_API_TOKEN",
    note: "Community server.",
  },
  {
    id: "trello",
    name: "Trello",
    category: "Tasks & Projects",
    does: "Read and move cards across boards.",
    availability: "none",
    note: "Only community forks exist — needs your own server to be dependable.",
  },

  // --- Files & Notes ---
  {
    id: "notion",
    name: "Notion",
    category: "Files & Notes",
    does: "Read and write pages and databases.",
    availability: "remote",
    url: "https://mcp.notion.com/mcp",
  },
  {
    id: "google-drive",
    name: "Google Drive",
    category: "Files & Notes",
    does: "Search and read your documents.",
    availability: "local",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-gdrive"],
  },
  {
    id: "dropbox",
    name: "Dropbox",
    category: "Files & Notes",
    does: "Search and read files.",
    availability: "none",
    note: "No maintained MCP server yet.",
  },

  // --- Social ---
  {
    id: "x",
    name: "X (Twitter)",
    category: "Social",
    does: "Read your timeline and post.",
    availability: "none",
    note: "The API is paid and restricted — needs a custom server plus a paid API tier.",
  },
  {
    id: "linkedin",
    name: "LinkedIn",
    category: "Social",
    does: "Read your profile and network activity.",
    availability: "none",
    note: "No public personal API — not connectable without scraping, which we won't do.",
  },
  {
    id: "instagram",
    name: "Instagram",
    category: "Social",
    does: "Read posts and messages.",
    availability: "none",
    note: "No public personal API — only business accounts via Meta Graph, needs a custom server.",
  },

  // --- Computer & Browser ---
  {
    id: "files",
    name: "Local Files",
    category: "Computer & Browser",
    does: "Read and write files in folders you allow.",
    availability: "local",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-filesystem", "/Users"],
    note: "Change the folder argument to the exact directory you want to expose.",
  },
  {
    id: "browser",
    name: "Browser Control",
    category: "Computer & Browser",
    does: "Open pages, click and fill forms, and read what's on screen.",
    availability: "local",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-puppeteer"],
  },
  {
    id: "desktop",
    name: "Full Computer Access",
    category: "Computer & Browser",
    does: "Run commands, read and write files, and open apps on this machine.",
    availability: "local",
    command: "node",
    args: ["../mcp-servers/computer/src/index.js"],
    note: "Built for Missy and lives in this repo (mcp-servers/computer). Blocks destructive commands and keeps file access inside your home folder, away from .ssh/.env and similar. Run npm install there first, and use the absolute path.",
  },
  {
    id: "postgres",
    name: "Postgres",
    category: "Computer & Browser",
    does: "Query a database you point it at.",
    availability: "local",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-postgres", "postgresql://localhost/mydb"],
  },
];

export const CONNECTOR_CATEGORIES: ConnectorCategory[] = [
  "Messaging & Email",
  "Calendar & Meetings",
  "Tasks & Projects",
  "Files & Notes",
  "Social",
  "Computer & Browser",
];
