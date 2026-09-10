/**
 * TypeScript port of frontend/api_client.py, calling the SAME FastAPI
 * backend - no backend changes. Every function here maps 1:1 to a function
 * over there; keep it that way so this stays a thin client, not a second
 * source of truth.
 */

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

export class ApiError extends Error {}

function formatDetail(detail: unknown): string {
  if (Array.isArray(detail)) {
    return detail
      .map((item) => (item && typeof item === "object" && "msg" in item ? String(item.msg) : String(item)))
      .join("; ");
  }
  return String(detail);
}

async function request<T>(
  method: string,
  path: string,
  opts: { token?: string | null; json?: unknown; formData?: FormData; raw?: boolean } = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  if (opts.token) headers["Authorization"] = `Bearer ${opts.token}`;
  if (opts.json !== undefined) headers["Content-Type"] = "application/json";

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: opts.json !== undefined ? JSON.stringify(opts.json) : opts.formData,
    });
  } catch {
    throw new ApiError(`Can't reach the Missy backend at ${API_BASE_URL}. Is it running?`);
  }

  if (!response.ok) {
    let detail: unknown = response.statusText;
    try {
      const body = await response.json();
      detail = body.detail ?? body;
    } catch {
      /* not JSON - keep statusText */
    }
    throw new ApiError(formatDetail(detail));
  }

  if (opts.raw) return (await response.arrayBuffer()) as unknown as T;
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

// --- Auth ---

export interface TokenResponse {
  access_token: string;
}
export interface MeResponse {
  username: string;
  has_profile: boolean;
}

export const register = (username: string, password: string) =>
  request<TokenResponse>("POST", "/auth/register", { json: { username, password } });

export const login = (username: string, password: string) =>
  request<TokenResponse>("POST", "/auth/login", { json: { username, password } });

export const getMe = (token: string) => request<MeResponse>("GET", "/auth/me", { token });

// --- Profile ---

export interface Profile {
  assistant_name: string;
  persona_description: string;
  user_about_me: string;
  tone_preference: string | null;
  response_language: string;
}

export const getProfile = async (token: string): Promise<Profile | null> => {
  try {
    return await request<Profile>("GET", "/profile", { token });
  } catch {
    return null;
  }
};

export const saveProfile = (token: string, profile: Profile) =>
  request<Profile>("POST", "/profile", { token, json: profile });

// --- Providers ---

export interface ProviderCredential {
  id: string;
  name: string | null;
  provider: string;
  masked_api_key: string;
  model_name: string;
  is_active: boolean;
  is_revoked: boolean;
  updated_at: string;
}

export const listProviders = (token: string) => request<ProviderCredential[]>("GET", "/providers", { token });

export const saveProvider = (
  token: string,
  provider: string,
  apiKey: string,
  modelName: string,
  name?: string | null,
) =>
  request<ProviderCredential>("POST", "/providers", {
    token,
    json: { provider, api_key: apiKey, model_name: modelName, name: name ?? null },
  });

export const deleteProvider = (token: string, provider: string) =>
  request<void>("DELETE", `/providers/${provider}`, { token });

export const setProviderRevoked = (token: string, provider: string, revoked: boolean) =>
  request<ProviderCredential>("POST", `/providers/${provider}/revoke`, { token, json: { revoked } });

export const testProvider = (token: string, provider: string, apiKey: string, modelName: string) =>
  request<{ success: boolean; message: string }>("POST", "/providers/test", {
    token,
    json: { provider, api_key: apiKey, model_name: modelName },
  });

// --- Chat ---

export interface Conversation {
  id: string;
  title: string;
  created_at: string;
}
export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}
export interface PendingConfirmation {
  id: string;
  tool_name: string;
  tool_args: Record<string, unknown>;
  created_at: string;
}

export const listConversations = (token: string) => request<Conversation[]>("GET", "/conversations", { token });
export const createConversation = (token: string) => request<Conversation>("POST", "/conversations", { token });
export const getMessages = (token: string, conversationId: string) =>
  request<Message[]>("GET", `/conversations/${conversationId}/messages`, { token });
export const getPendingConfirmation = (token: string, conversationId: string) =>
  request<PendingConfirmation | null>("GET", `/conversations/${conversationId}/pending-confirmation`, { token });

export type StreamEvent =
  | { type: "status"; tool: string }
  | { type: "token"; text: string }
  | { type: "done"; message: Message }
  | { type: "needs_confirmation"; confirmation: PendingConfirmation }
  | { type: "error"; detail: string };

/** Yields parsed NDJSON events as they arrive - mirrors _stream_ndjson in api_client.py. */
async function* streamNdjson(
  method: string,
  path: string,
  token: string,
  opts: { json?: unknown; formData?: FormData; signal?: AbortSignal } = {},
): AsyncGenerator<StreamEvent> {
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (opts.json !== undefined) headers["Content-Type"] = "application/json";

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: opts.json !== undefined ? JSON.stringify(opts.json) : opts.formData,
      signal: opts.signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new ApiError(`Can't reach the Missy backend at ${API_BASE_URL}. Is it running?`);
  }

  if (!response.ok || !response.body) {
    let detail: unknown = response.statusText;
    try {
      const body = await response.json();
      detail = body.detail ?? body;
    } catch {
      /* keep statusText */
    }
    throw new ApiError(formatDetail(detail));
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newlineIndex: number;
    while ((newlineIndex = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);
      if (line) yield JSON.parse(line) as StreamEvent;
    }
  }
  if (buffer.trim()) yield JSON.parse(buffer.trim()) as StreamEvent;
}

export function streamMessage(
  token: string,
  conversationId: string,
  content: string,
  provider: string,
  attachment?: { kind: "image" | "document"; filename: string; blob: Blob; contentType?: string },
  signal?: AbortSignal,
): AsyncGenerator<StreamEvent> {
  const formData = new FormData();
  formData.append("content", content);
  formData.append("provider", provider);
  if (attachment) {
    formData.append(attachment.kind, attachment.blob, attachment.filename);
  }
  return streamNdjson("POST", `/conversations/${conversationId}/messages`, token, { formData, signal });
}

export function streamConfirmToolCall(
  token: string,
  conversationId: string,
  confirmationId: string,
  approved: boolean,
): AsyncGenerator<StreamEvent> {
  return streamNdjson("POST", `/conversations/${conversationId}/messages/${confirmationId}/confirm`, token, {
    json: { approved },
  });
}

// --- Voice ---

export const transcribeAudio = async (token: string, filename: string, audio: Blob): Promise<string> => {
  const formData = new FormData();
  formData.append("audio", audio, filename);
  const result = await request<{ text: string }>("POST", "/voice/transcribe", { token, formData });
  return result.text;
};

export const synthesizeSpeech = async (token: string, text: string, language: string): Promise<ArrayBuffer> =>
  request<ArrayBuffer>("POST", "/voice/speak", { token, json: { text, language }, raw: true });

// --- Knowledge base ---

export type SourceType = "file" | "url" | "text";
export type SourceStatus = "ready" | "processing" | "failed";

export interface KnowledgeSource {
  id: string;
  title: string;
  source_type: SourceType;
  original_reference: string | null;
  status: SourceStatus;
  error_message: string | null;
  chunk_count: number;
  created_at: string;
}

export const listKnowledgeSources = (token: string) =>
  request<KnowledgeSource[]>("GET", "/knowledge/sources", { token });

export const addKnowledgeFile = (token: string, filename: string, content: Blob) => {
  const formData = new FormData();
  formData.append("file", content, filename);
  return request<KnowledgeSource>("POST", "/knowledge/sources/file", { token, formData });
};

export const addKnowledgeUrl = (token: string, url: string) =>
  request<KnowledgeSource>("POST", "/knowledge/sources/url", { token, json: { url } });

export const addKnowledgeNote = (token: string, title: string, content: string) =>
  request<KnowledgeSource>("POST", "/knowledge/sources/note", { token, json: { title, content } });

export const deleteKnowledgeSource = (token: string, sourceId: string) =>
  request<void>("DELETE", `/knowledge/sources/${sourceId}`, { token });

// --- Memory ---

export type MemoryCategory = "fact" | "preference" | "episodic";
export type MemorySource = "auto" | "manual";

export interface MemoryEntry {
  id: string;
  content: string;
  category: MemoryCategory;
  source: MemorySource;
  created_at: string;
  updated_at: string;
}

export const listMemories = (token: string) => request<MemoryEntry[]>("GET", "/memory", { token });

export const addMemory = (token: string, content: string, category: MemoryCategory = "fact") =>
  request<MemoryEntry>("POST", "/memory", { token, json: { content, category } });

export const deleteMemory = (token: string, memoryId: string) =>
  request<void>("DELETE", `/memory/${memoryId}`, { token });

// --- Scheduled tasks ---

export type ScheduleType = "daily" | "interval";

export interface ScheduledTask {
  id: string;
  prompt: string;
  schedule_type: ScheduleType;
  run_at_time: string | null; // "HH:MM:SS", UTC
  interval_hours: number | null;
  interval_minutes: number | null;
  next_run_at: string;
  last_run_at: string | null;
  enabled: boolean;
  created_at: string;
}

export const listScheduledTasks = (token: string) => request<ScheduledTask[]>("GET", "/scheduled-tasks", { token });

export const addScheduledTask = (
  token: string,
  prompt: string,
  scheduleType: ScheduleType,
  runAtTime?: string | null,
  intervalHours?: number | null,
  intervalMinutes?: number | null,
) =>
  request<ScheduledTask>("POST", "/scheduled-tasks", {
    token,
    json: {
      prompt,
      schedule_type: scheduleType,
      run_at_time: runAtTime ?? null,
      interval_hours: intervalHours ?? null,
      interval_minutes: intervalMinutes ?? null,
    },
  });

export const setScheduledTaskEnabled = (token: string, taskId: string, enabled: boolean) =>
  request<ScheduledTask>("POST", `/scheduled-tasks/${taskId}/enabled`, { token, json: { enabled } });

export const deleteScheduledTask = (token: string, taskId: string) =>
  request<void>("DELETE", `/scheduled-tasks/${taskId}`, { token });

// --- MCP servers ---

export type McpTransport = "stdio" | "sse";

export interface McpServer {
  id: string;
  name: string;
  transport: McpTransport;
  command: string | null;
  args: string[] | null;
  url: string | null;
  is_enabled: boolean;
  created_at: string;
}

export const listMcpServers = (token: string) => request<McpServer[]>("GET", "/mcp-servers", { token });

export const addMcpServer = (
  token: string,
  params: {
    name: string;
    transport: McpTransport;
    command?: string | null;
    args?: string[] | null;
    url?: string | null;
    env?: Record<string, string> | null;
  },
) =>
  request<McpServer>("POST", "/mcp-servers", {
    token,
    json: {
      name: params.name,
      transport: params.transport,
      command: params.command ?? null,
      args: params.args ?? null,
      url: params.url ?? null,
      env: params.env ?? null,
    },
  });

export const setMcpServerEnabled = (token: string, serverId: string, enabled: boolean) =>
  request<McpServer>("POST", `/mcp-servers/${serverId}/enabled`, { token, json: { enabled } });

export const deleteMcpServer = (token: string, serverId: string) =>
  request<void>("DELETE", `/mcp-servers/${serverId}`, { token });
