import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { Volume2, Download, Loader2, Paperclip } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { Message } from "@/lib/api";

const ATTACHMENT_MARKER = "\n\n📎 ";
const TOOL_USAGE_MARKER = "\n\n🔧 [Used:";

/** The backend appends attachment/tool-usage markers straight into the
 * stored user-message content (see chat_service.py) rather than as
 * separate fields - split them back out for display instead of showing
 * the raw marker text inline with the message. */
function splitContent(content: string): { text: string; attachment: string | null; toolUsage: string | null } {
  let text = content;
  let attachment: string | null = null;
  let toolUsage: string | null = null;

  const toolIndex = text.indexOf(TOOL_USAGE_MARKER);
  if (toolIndex >= 0) {
    toolUsage = text.slice(toolIndex + 4).replace(/^\[Used:\s*/, "").replace(/\]$/, "");
    text = text.slice(0, toolIndex);
  }
  const attachIndex = text.indexOf(ATTACHMENT_MARKER);
  if (attachIndex >= 0) {
    attachment = text.slice(attachIndex + ATTACHMENT_MARKER.length);
    text = text.slice(0, attachIndex);
  }
  return { text, attachment, toolUsage };
}

export function MessageRow({
  message,
  onListen,
  responseLanguage,
}: {
  message: Message;
  onListen: (text: string, language: string) => Promise<void>;
  responseLanguage: string;
}) {
  const isUser = message.role === "user";
  const { text, attachment, toolUsage } = splitContent(message.content);
  const [listening, setListening] = useState(false);

  async function handleListen() {
    setListening(true);
    try {
      await onListen(text, responseLanguage);
    } finally {
      setListening(false);
    }
  }

  function handleDownload() {
    const blob = new Blob([text], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `missy-reply-${message.id.slice(0, 8)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className={cn("group py-3", !isUser && "border-t border-border/60 first:border-t-0")}>
      <div className="mb-1.5 flex items-center gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {isUser ? "You" : "Missy"}
        </span>
      </div>

      <div
        className={cn(
          "prose prose-sm max-w-none text-[14px] leading-relaxed text-foreground",
          "prose-p:my-2 prose-pre:my-2 prose-pre:rounded-md prose-pre:border prose-pre:border-border prose-pre:bg-surface-subtle",
          "prose-code:before:content-none prose-code:after:content-none",
          "prose-headings:font-semibold prose-a:text-primary",
        )}
      >
        <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
          {text}
        </ReactMarkdown>
      </div>

      {attachment && (
        <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Paperclip className="h-3 w-3" />
          {attachment}
        </p>
      )}
      {toolUsage && <p className="mt-1 text-xs text-muted-foreground">🔧 Used: {toolUsage}</p>}

      {!isUser && (
        <div className="mt-1.5 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleListen} disabled={listening}>
            {listening ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Volume2 className="h-3.5 w-3.5" />}
          </Button>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleDownload}>
            <Download className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
    </div>
  );
}
