import { PrototypeNotice } from "@/components/shared/PrototypeNotice";
import { usePrototypeValue } from "@/lib/prototype-store";
import { SectionTabs, ASSISTANT_TABS } from "@/components/shared/SectionTabs";

interface ResponseStyle {
  answerLength: string;
  explanationLevel: string;
  style: string;
}

const BLANK: ResponseStyle = { answerLength: "Balanced", explanationLevel: "Normal", style: "Conversational" };

const ANSWER_LENGTHS = ["Very short", "Short", "Balanced", "Detailed", "Very detailed"];
const EXPLANATION_LEVELS = ["Simple", "Normal", "Expert"];
const STYLES = ["Conversational", "Structured", "Bullet points", "Step-by-step", "Professional"];

function OptionGroup({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <p className="mb-2 text-sm font-medium text-foreground">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {options.map((opt) => (
          <button
            key={opt}
            onClick={() => onChange(opt)}
            className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
              value === opt ? "border-primary bg-accent-soft text-primary" : "border-border text-foreground/80 hover:bg-muted"
            }`}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}

export function AssistantResponseStylePage() {
  const [style, setStyle] = usePrototypeValue<ResponseStyle>("assistant.response-style", BLANK);

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-12 shrink-0 items-center border-b border-border px-6">
        <h1 className="text-[13px] font-medium text-foreground">Response Style</h1>
      </header>
      <div className="flex-1 overflow-y-auto px-6 py-5">
        <div className="mx-auto max-w-2xl">
          <SectionTabs items={ASSISTANT_TABS} />
          <p className="mb-1 text-sm text-muted-foreground">Control how answers should look.</p>
          <PrototypeNotice />

          <div className="space-y-6">
            <OptionGroup
              label="Answer length"
              options={ANSWER_LENGTHS}
              value={style.answerLength}
              onChange={(v) => setStyle((prev) => ({ ...prev, answerLength: v }))}
            />
            <OptionGroup
              label="Explanation level"
              options={EXPLANATION_LEVELS}
              value={style.explanationLevel}
              onChange={(v) => setStyle((prev) => ({ ...prev, explanationLevel: v }))}
            />
            <OptionGroup
              label="Style"
              options={STYLES}
              value={style.style}
              onChange={(v) => setStyle((prev) => ({ ...prev, style: v }))}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
