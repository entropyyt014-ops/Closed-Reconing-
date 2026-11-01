"use client";

// ─── Scholar's Kingdom: typed client API (all requests relative) ───────────

import type {
  ChapterModule, CoinLedgerEntry, ChapterProgressDTO, InteractiveBlocks,
  KingdomMarker, NoteDTO, Syllabus, TestAttemptDTO, TestPaper, TestResult, TutorMessage,
} from "./types";

const TOKEN_KEY = "sk_token";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (typeof window === "undefined") return;
  if (token) window.localStorage.setItem(TOKEN_KEY, token);
  else window.localStorage.removeItem(TOKEN_KEY);
}

async function api<T>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";

  const res = await fetch(`/api/kingdom${path}`, {
    method: opts.method ?? (opts.body !== undefined ? "POST" : "GET"),
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });

  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }

  if (!res.ok) {
    const message =
      data && typeof data === "object" && "error" in data && typeof (data as { error: unknown }).error === "string"
        ? (data as { error: string }).error
        : `Request failed (${res.status})`;
    throw new Error(message);
  }
  return data as T;
}

/** Binary fetch (audio / pdf). */
async function apiBlob(path: string, body: unknown): Promise<Blob> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`/api/kingdom${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const j = await res.json();
      if (j?.error) message = j.error;
    } catch { /* binary ok */ }
    throw new Error(message);
  }
  return res.blob();
}

export interface KingdomStats {
  territoryM2: number;
  territoryRadiusM: number;
  worldRank: number;
  chaptersCompleted: number;
  testsPassed: number;
  testsTaken: number;
  notesCreated: number;
}

export const kingdomApi = {
  auth: {
    google(name: string, email: string) {
      return api<{ token: string; user: import("./types").KingdomUser; isNew: boolean }>("/auth/google", {
        body: { name, email },
      });
    },
    otpSend(phone: string) {
      return api<{ sent: boolean; phone: string; devCode: string; expiresInSec: number }>("/auth/otp/send", {
        body: { phone },
      });
    },
    otpVerify(phone: string, code: string, name?: string) {
      return api<{ token: string; user: import("./types").KingdomUser; isNew: boolean }>("/auth/otp/verify", {
        body: { phone, code, name },
      });
    },
    me() {
      return api<{ user: import("./types").KingdomUser }>("/auth/me");
    },
    updateProfile(fields: Record<string, unknown>) {
      return api<{ user: import("./types").KingdomUser }>("/auth/me", { method: "PATCH", body: fields });
    },
    logout() {
      return api<{ signedOut: boolean }>("/auth/me", { method: "DELETE", body: {} });
    },
  },

  onboarding(payload: {
    name: string; kingdomName: string; country: string; grade: number; board: string; subjects: string[];
  }) {
    return api<{ user: import("./types").KingdomUser; founded: boolean; bonus: number }>("/onboarding", {
      body: payload,
    });
  },

  syllabus: {
    get() {
      return api<{ syllabi: Syllabus[] }>("/syllabus");
    },
    getSubject(subject: string) {
      return api<{ syllabus: Syllabus }>(`/syllabus?subject=${encodeURIComponent(subject)}`);
    },
    generate(subjects: string[]) {
      return api<{ syllabi: Syllabus[] }>("/syllabus", { body: { subjects } });
    },
  },

  chapter: {
    module(subject: string, chapter: string) {
      return api<{ module: ChapterModule; cached: boolean }>("/chapter", { body: { subject, chapter } });
    },
    complete(subject: string, chapter: string) {
      return api<{ alreadyCompleted: boolean; coinsEarned: number; coins: number }>("/chapter/complete", {
        body: { subject, chapter },
      });
    },
  },

  tutor: {
    chat(messages: TutorMessage[], subject?: string, chapter?: string) {
      return api<{ reply: string }>("/tutor/chat", { body: { messages, subject, chapter } });
    },
    voice(text: string) {
      return apiBlob("/tutor/voice", { text });
    },
    vision(imageDataUrl: string, question: string, messages: TutorMessage[]) {
      return api<{ reply: string }>("/tutor/vision", { body: { imageDataUrl, question, messages } });
    },
  },

  tests: {
    list() {
      return api<{ attempts: TestAttemptDTO[] }>("/tests");
    },
    generate(subject: string, chapter: string, difficulty: string) {
      return api<{ attempt: TestAttemptDTO }>("/tests/generate", { body: { subject, chapter, difficulty } });
    },
    submit(attemptId: string, answers: Record<string, string | number>) {
      return api<{ result: TestResult; coins: number }>("/tests/submit", { body: { attemptId, answers } });
    },
    pdf(attemptId: string, includeAnswers: boolean) {
      return apiBlob("/tests/pdf", { attemptId, includeAnswers });
    },
  },

  notes: {
    list() {
      return api<{ notes: NoteDTO[] }>("/notes");
    },
    create(payload: { subject: string; chapter: string; title: string; content?: string }) {
      return api<{ note: NoteDTO }>("/notes", { body: payload });
    },
    get(id: string) {
      return api<{ note: NoteDTO }>(`/notes/${id}`);
    },
    update(id: string, fields: { title?: string; content?: string; chapter?: string; subject?: string }) {
      return api<{ note: NoteDTO }>(`/notes/${id}`, { method: "PATCH", body: fields });
    },
    delete(id: string) {
      return api<{ deleted: boolean }>(`/notes/${id}`, { method: "DELETE" });
    },
    ai(action: "summarize" | "expand" | "structure" | "gapfix", text: string, subject: string, chapter: string) {
      return api<{ text: string }>("/notes/ai", { body: { action, text, subject, chapter } });
    },
    interactive(payload: { noteId: string | null; text: string; subject: string; chapter: string }) {
      return api<{ blocks: InteractiveBlocks }>("/notes/interactive", { body: payload });
    },
    complete(noteId: string) {
      return api<{ alreadyCompleted: boolean; coinsEarned: number; coins: number }>("/notes/complete", {
        body: { noteId },
      });
    },
  },

  kingdoms: {
    get() {
      return api<{ markers: KingdomMarker[]; totalKingdoms: number; myRank: number | null; syncedAt: string }>("/kingdoms");
    },
    setLocation(lat: number, lng: number, locationName?: string) {
      return api<{ user: import("./types").KingdomUser }>("/location", { body: { lat, lng, locationName } });
    },
  },

  profile: {
    get() {
      return api<{
        user: import("./types").KingdomUser;
        stats: KingdomStats;
        progress: ChapterProgressDTO[];
        ledger: CoinLedgerEntry[];
      }>("/profile");
    },
  },
};
