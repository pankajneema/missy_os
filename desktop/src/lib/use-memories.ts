import { useEffect, useState } from "react";
import * as api from "@/lib/api";
import type { MemoryCategory, MemoryEntry } from "@/lib/api";
import { useAuthStore } from "@/store/auth-store";

/** Shared data layer for every Memory sub-page (Memories, Preferences,
 * People, Forget) - all real, backed by the same /memory endpoints. */
export function useMemories() {
  const { token } = useAuthStore();
  const [memories, setMemories] = useState<MemoryEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    if (!token) return;
    try {
      setMemories(await api.listMemories(token));
    } catch (err) {
      setError(err instanceof api.ApiError ? err.message : "Something went wrong.");
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function addMemory(content: string, category: MemoryCategory) {
    if (!token || !content.trim()) return;
    await api.addMemory(token, content.trim(), category);
    await refresh();
  }

  async function deleteMemory(id: string) {
    if (!token) return;
    setMemories((prev) => prev?.filter((m) => m.id !== id) ?? null);
    try {
      await api.deleteMemory(token, id);
    } catch (err) {
      setError(err instanceof api.ApiError ? err.message : "Something went wrong.");
      await refresh();
    }
  }

  async function deleteMany(ids: string[]) {
    if (!token) return;
    setMemories((prev) => prev?.filter((m) => !ids.includes(m.id)) ?? null);
    try {
      await Promise.all(ids.map((id) => api.deleteMemory(token, id)));
    } catch (err) {
      setError(err instanceof api.ApiError ? err.message : "Something went wrong.");
      await refresh();
    }
  }

  return { memories, error, addMemory, deleteMemory, deleteMany, refresh };
}
