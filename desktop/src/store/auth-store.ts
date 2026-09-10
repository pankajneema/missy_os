import { create } from "zustand";

interface AuthState {
  token: string | null;
  username: string | null;
  hasProfile: boolean;
  assistantName: string;
  responseLanguage: string;
  login: (token: string, username: string, hasProfile: boolean) => void;
  setProfileInfo: (assistantName: string, responseLanguage: string) => void;
  completeOnboarding: (assistantName: string, responseLanguage: string) => void;
  logout: () => void;
}

const STORAGE_KEY = "missy.auth";

function loadPersisted(): { token: string | null; username: string | null } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : { token: null, username: null };
  } catch {
    return { token: null, username: null };
  }
}

function persist(token: string | null, username: string | null) {
  try {
    if (token) localStorage.setItem(STORAGE_KEY, JSON.stringify({ token, username }));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* private-browsing/storage-disabled contexts - session just won't survive a restart */
  }
}

const persisted = loadPersisted();

export const useAuthStore = create<AuthState>((set) => ({
  token: persisted.token,
  username: persisted.username,
  hasProfile: false,
  assistantName: "Missy",
  responseLanguage: "English",

  login: (token, username, hasProfile) => {
    persist(token, username);
    set({ token, username, hasProfile });
  },

  setProfileInfo: (assistantName, responseLanguage) => set({ assistantName, responseLanguage }),

  completeOnboarding: (assistantName, responseLanguage) => set({ hasProfile: true, assistantName, responseLanguage }),

  logout: () => {
    persist(null, null);
    set({ token: null, username: null, hasProfile: false, assistantName: "Missy", responseLanguage: "English" });
  },
}));
