/** Deciding whether something said in the room was actually addressed to the
 * assistant. Speech-to-text rarely spells a name the same way twice - "Missy"
 * comes back as Missi, Misty, Messy - so an exact match would leave you
 * repeating yourself, which is the thing that makes wake words infuriating. */

function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Levenshtein, capped - we only ever care about "within one or two edits". */
function editDistance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 99;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(
        prev[j] + 1,
        row[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = row;
  }
  return prev[b.length];
}

/** Longer names tolerate more mangling; a short one must be near-exact or
 * every similar word in the room would wake it. */
function tolerance(word: string): number {
  if (word.length <= 3) return 0;
  if (word.length <= 5) return 1;
  return 2;
}

/** Words that only ever precede the name, and shouldn't survive into the
 * request itself. */
const PREFIXES = new Set(["hey", "hi", "hello", "ok", "okay", "yo", "arre", "are", "suno", "sun"]);

/**
 * Looks for the wake word anywhere in what was said.
 * Returns whatever else was said (possibly empty), or null if the name wasn't
 * there at all. Returning the remainder is what lets "Missy, add a meeting
 * tomorrow at three" work in one breath instead of two.
 */
export function matchWakeWord(text: string, wakeWord: string): string | null {
  const target = normalise(wakeWord);
  if (!target) return null;

  // Matching is done on a normalised copy, but the remainder is rebuilt from
  // the original words - otherwise "Missy, meeting with Rahul" would come
  // back lowercased and the name in the task would read "rahul".
  const original = text.trim().split(/\s+/).filter(Boolean);
  const plain = original.map(normalise);
  if (!original.length) return null;

  const targetWords = target.split(" ");
  const limit = tolerance(target.replace(/\s/g, ""));

  for (let i = 0; i < original.length; i++) {
    const candidate = plain.slice(i, i + targetWords.length).join(" ").trim();
    if (!candidate || editDistance(candidate, target) > limit) continue;

    // Drop the name, and any "hey"/"ok" leading into it.
    let from = i;
    if (from > 0 && PREFIXES.has(plain[from - 1])) from -= 1;
    const rest = [...original.slice(0, from), ...original.slice(i + targetWords.length)];
    // A name at the end leaves a dangling comma: "add a meeting tomorrow,".
    return rest.join(" ").replace(/^[\s,.!?]+/, "").replace(/[\s,]+$/, "").trim();
  }
  return null;
}

const SLEEP_PHRASES = [
  "thats all", "that s all", "thats it", "nothing else", "no thanks", "thank you", "thanks",
  "stop listening", "go to sleep", "sleep now", "sleep", "goodbye", "bye", "bye bye",
  "bas", "bas itna", "bas ho gaya", "so jao", "so ja", "chup ho ja", "ruk ja", "theek hai bas",
];

/** Sends the assistant back to sleep without ending the conversation. */
export function isSleepPhrase(text: string): boolean {
  const t = normalise(text);
  return SLEEP_PHRASES.includes(t) || SLEEP_PHRASES.some((p) => t === `${p} missy` || t === `missy ${p}`);
}
