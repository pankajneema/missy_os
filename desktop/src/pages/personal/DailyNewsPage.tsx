import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PrototypeNotice } from "@/components/shared/PrototypeNotice";
import { usePrototypeValue } from "@/lib/prototype-store";
import { SectionTabs, BRIEFING_TABS } from "@/components/shared/SectionTabs";

interface NewsSettings {
  time: string;
  topics: string;
  countries: string;
  industries: string;
  storyCount: number;
  summaryLength: string;
}

const BLANK: NewsSettings = {
  time: "08:00",
  topics: "AI, Technology, Business",
  countries: "",
  industries: "",
  storyCount: 5,
  summaryLength: "Short",
};

const SUMMARY_LENGTHS = ["Short", "Balanced", "Detailed"];

export function DailyNewsPage() {
  const [news, setNews] = usePrototypeValue<NewsSettings>("daily.news", BLANK);

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-12 shrink-0 items-center border-b border-border px-6">
        <h1 className="text-[13px] font-medium text-foreground">Daily News</h1>
      </header>
      <div className="flex-1 overflow-y-auto px-6 py-5">
        <div className="mx-auto max-w-2xl">
          <SectionTabs items={BRIEFING_TABS} />
          <p className="mb-1 text-sm text-muted-foreground">e.g. "Every morning at 8 AM, give me a short AI + technology + business briefing."</p>
          <PrototypeNotice>Missy has no news source connected yet — this configures what a future briefing would use.</PrototypeNotice>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="news-time">Time</Label>
              <Input id="news-time" type="time" value={news.time} onChange={(e) => setNews((prev) => ({ ...prev, time: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="news-count">Number of stories</Label>
              <Input
                id="news-count"
                type="number"
                min={1}
                max={20}
                value={news.storyCount}
                onChange={(e) => setNews((prev) => ({ ...prev, storyCount: Number(e.target.value) }))}
              />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="news-topics">Topics</Label>
              <Input id="news-topics" value={news.topics} onChange={(e) => setNews((prev) => ({ ...prev, topics: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="news-countries">Countries</Label>
              <Input id="news-countries" placeholder="e.g. India, US" value={news.countries} onChange={(e) => setNews((prev) => ({ ...prev, countries: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="news-industries">Industries</Label>
              <Input id="news-industries" value={news.industries} onChange={(e) => setNews((prev) => ({ ...prev, industries: e.target.value }))} />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Summary length</Label>
              <Select value={news.summaryLength} onValueChange={(v) => setNews((prev) => ({ ...prev, summaryLength: v }))}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SUMMARY_LENGTHS.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
