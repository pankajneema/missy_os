import { useRef, useState, type KeyboardEvent } from "react";
import { Paperclip, Mic, Square, ArrowUp, X, FileText, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "webp"]);
const ACCEPT = ".png,.jpg,.jpeg,.webp,.pdf,.docx,.txt,.md";

export interface Attachment {
  file: File;
  isImage: boolean;
}

export function Composer({
  disabled,
  isGenerating,
  onSend,
  onStop,
  onRecordToggle,
  isRecording,
}: {
  disabled: boolean;
  isGenerating: boolean;
  onSend: (text: string, attachment: Attachment | null) => void;
  onStop: () => void;
  onRecordToggle: () => void;
  isRecording: boolean;
}) {
  const [text, setText] = useState("");
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [attachOpen, setAttachOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function autoGrow() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    setAttachment({ file, isImage: IMAGE_EXTS.has(ext) });
    setAttachOpen(false);
    e.target.value = "";
  }

  function submit() {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed, attachment);
    setText("");
    setAttachment(null);
    requestAnimationFrame(autoGrow);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  return (
    <div className="border-t border-border bg-surface px-4 py-3">
      {attachment && (
        <div className="mb-2 flex w-fit items-center gap-2 rounded-md border border-border bg-surface-subtle px-2 py-1 text-xs text-secondary-foreground">
          {attachment.isImage ? <ImageIcon className="h-3.5 w-3.5" /> : <FileText className="h-3.5 w-3.5" />}
          <span className="max-w-[200px] truncate">{attachment.file.name}</span>
          <button onClick={() => setAttachment(null)} className="text-muted-foreground hover:text-foreground">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <div
        className={cn(
          "flex items-end gap-2 rounded-xl border border-border bg-background px-3 py-2 transition-colors focus-within:border-primary/60",
          disabled && "opacity-60",
        )}
      >
        <textarea
          ref={textareaRef}
          rows={1}
          className="max-h-[200px] min-h-[24px] flex-1 resize-none bg-transparent text-[14px] leading-6 text-foreground placeholder:text-muted-foreground focus:outline-none"
          placeholder="Ask your AI worker…"
          value={text}
          disabled={disabled}
          onChange={(e) => {
            setText(e.target.value);
            autoGrow();
          }}
          onKeyDown={handleKeyDown}
        />

        <div className="flex shrink-0 items-center gap-1">
          <Popover open={attachOpen} onOpenChange={setAttachOpen}>
            <Tooltip>
              <TooltipTrigger asChild>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8" disabled={disabled}>
                    <Paperclip className="h-4 w-4" />
                  </Button>
                </PopoverTrigger>
              </TooltipTrigger>
              <TooltipContent>Attach an image or document</TooltipContent>
            </Tooltip>
            <PopoverContent className="w-64 text-sm" align="end">
              <Button variant="secondary" size="sm" className="w-full" onClick={() => fileInputRef.current?.click()}>
                Choose a file
              </Button>
              <p className="mt-2 text-xs text-muted-foreground">
                Images need a vision-capable model (GPT-4o, Claude, or Gemini).
              </p>
              <input ref={fileInputRef} type="file" accept={ACCEPT} className="hidden" onChange={handleFileChange} />
            </PopoverContent>
          </Popover>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={isRecording ? "destructive" : "ghost"}
                size="icon"
                className="h-8 w-8"
                disabled={disabled}
                onClick={onRecordToggle}
              >
                <Mic className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{isRecording ? "Stop recording" : "Record a voice message"}</TooltipContent>
          </Tooltip>

          {isGenerating ? (
            <Button size="icon" className="h-8 w-8" variant="secondary" onClick={onStop}>
              <Square className="h-3.5 w-3.5 fill-current" />
            </Button>
          ) : (
            <Button size="icon" className="h-8 w-8" onClick={submit} disabled={disabled || !text.trim()}>
              <ArrowUp className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
      <p className="mt-1.5 px-1 text-[11px] text-muted-foreground">Enter to send · Shift+Enter for a new line</p>
    </div>
  );
}
