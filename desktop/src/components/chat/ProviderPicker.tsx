import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ProviderCredential } from "@/lib/api";

const PROVIDER_LABELS: Record<string, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  gemini: "Gemini",
  groq: "Groq",
};

export function ProviderPicker({
  providers,
  value,
  onChange,
}: {
  providers: ProviderCredential[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-7 w-auto gap-1.5 border-none bg-transparent px-2 text-xs text-muted-foreground shadow-none hover:bg-muted">
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end">
        {providers.map((p) => (
          <SelectItem key={p.id} value={p.provider}>
            {p.name || PROVIDER_LABELS[p.provider] || p.provider} · {p.model_name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
