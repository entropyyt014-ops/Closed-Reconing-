"use client";

import { create } from "zustand";
import type { KingdomUser, Syllabus } from "./types";
import { getToken, setToken, kingdomApi } from "./client";

export type KingdomView = "learn" | "tutor" | "tests" | "notes" | "map" | "profile";

export interface TutorContext {
  subject?: string;
  chapter?: string;
}

interface KingdomState {
  token: string | null;
  user: KingdomUser | null;
  authChecked: boolean;
  view: KingdomView;
  syllabi: Syllabus[] | null;
  syllabusLoading: boolean;
  tutorContext: TutorContext | null;

  hydrate: () => Promise<void>;
  setSession: (token: string, user: KingdomUser) => void;
  setUser: (user: KingdomUser) => void;
  setView: (view: KingdomView) => void;
  setTutorContext: (ctx: TutorContext | null) => void;
  addCoins: (delta: number) => void;
  setSyllabi: (syllabi: Syllabus[]) => void;
  setSyllabusLoading: (loading: boolean) => void;
  logout: () => void;
}

export const useKingdom = create<KingdomState>((set, get) => ({
  token: null,
  user: null,
  authChecked: false,
  view: "learn",
  syllabi: null,
  syllabusLoading: false,
  tutorContext: null,

  hydrate: async () => {
    const token = getToken();
    if (!token) {
      set({ authChecked: true, token: null, user: null });
      return;
    }
    try {
      const { user } = await kingdomApi.auth.me();
      set({ token, user, authChecked: true });
    } catch {
      setToken(null);
      set({ token: null, user: null, authChecked: true });
    }
  },

  setSession: (token, user) => {
    setToken(token);
    set({ token, user, authChecked: true, view: "learn", syllabi: null });
  },

  setUser: (user) => set({ user }),

  setView: (view) => set({ view }),

  setTutorContext: (ctx) => set({ tutorContext: ctx }),

  addCoins: (delta) => {
    const user = get().user;
    if (!user) return;
    set({ user: { ...user, coins: Math.max(0, user.coins + delta) } });
  },

  setSyllabi: (syllabi) => set({ syllabi }),

  setSyllabusLoading: (syllabusLoading) => set({ syllabusLoading }),

  logout: () => {
    kingdomApi.auth.logout().catch(() => {});
    setToken(null);
    set({ token: null, user: null, view: "learn", syllabi: null, authChecked: true });
  },
}));
