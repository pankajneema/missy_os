import { useCallback, useEffect, useState } from "react";

/** Local-only persistence for the parts of the Personal AI area that have no
 * backend yet (see the desktop app's standing "don't invent backend
 * features" rule). Everything here lives in this browser's localStorage,
 * namespaced under "missy.proto." - it survives reloads on this device but
 * is never synced to the account or visible to Missy. Real data (Memory,
 * Scheduled Tasks, Profile) goes through src/lib/api.ts instead. */

const PREFIX = "missy.proto.";

function readRaw<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeRaw<T>(key: string, value: T) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // storage disabled/full - prototype state just won't persist this run
  }
}

/** Cross-instance sync within the same page: two components reading the
 * same key (e.g. Tasks page open while Teach Assistant's floating button
 * writes a new task) each hold their own React state seeded once at mount,
 * so a write from one never reached the other without this - only a full
 * remount re-read localStorage. The browser's native `storage` event
 * doesn't help either since it only fires for changes made in OTHER tabs. */
const listeners = new Map<string, Set<(value: unknown) => void>>();

function notify(key: string, value: unknown) {
  listeners.get(key)?.forEach((fn) => fn(value));
}

function subscribe(key: string, fn: (value: unknown) => void): () => void {
  if (!listeners.has(key)) listeners.set(key, new Set());
  listeners.get(key)!.add(fn);
  return () => listeners.get(key)?.delete(fn);
}

/** A single persisted value, e.g. a settings object for one page. */
export function usePrototypeValue<T>(key: string, initial: T): [T, (next: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => readRaw(key, initial));

  useEffect(() => subscribe(key, (v) => setValue(v as T)), [key]);

  const update = useCallback(
    (next: T | ((prev: T) => T)) => {
      const prev = readRaw(key, initial);
      const resolved = typeof next === "function" ? (next as (prev: T) => T)(prev) : next;
      writeRaw(key, resolved);
      notify(key, resolved);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
  );

  return [value, update];
}

/** A persisted list of records with ids - the common shape for people,
 * timeline events, routines, habits, etc. */
export function usePrototypeCollection<T extends { id: string }>(key: string) {
  const [items, setItems] = usePrototypeValue<T[]>(key, []);

  const add = useCallback((item: T) => setItems((prev) => [item, ...prev]), [setItems]);
  const update = useCallback(
    (id: string, patch: Partial<T>) =>
      setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item))),
    [setItems],
  );
  const remove = useCallback((id: string) => setItems((prev) => prev.filter((item) => item.id !== id)), [setItems]);

  return { items, add, update, remove, setItems };
}

/** Reads a collection as it stands right now, bypassing React state.
 * Commands can run inside a voice session that started several turns ago, and
 * the `items` captured back then no longer include anything added since - so
 * "mark it done" or "at 4pm" would look at a list missing the very thing
 * they refer to. Writes already re-read storage; reads need to as well. */
export function readPrototypeCollection<T extends { id: string }>(key: string): T[] {
  return readRaw<T[]>(key, []);
}

export function newId(): string {
  return crypto.randomUUID();
}

/** Session-only (tab-lifetime) state for "Temporary Context" - deliberately
 * NOT localStorage, since the whole point is that it doesn't outlive the
 * session unless explicitly promoted to real memory. */
export function useSessionValue<T>(key: string, initial: T): [T, (next: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = sessionStorage.getItem(PREFIX + key);
      return raw ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });

  useEffect(() => {
    try {
      sessionStorage.setItem(PREFIX + key, JSON.stringify(value));
    } catch {
      // ignore
    }
  }, [key, value]);

  return [value, setValue];
}
