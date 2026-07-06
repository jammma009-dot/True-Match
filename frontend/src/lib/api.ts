import { getInitData } from "./telegram";

const BASE_URL = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");

export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message?: string) {
    super(message || code);
    this.status = status;
    this.code = code;
  }
}

/**
 * Core request helper. Attaches the Telegram initData on EVERY request via the
 * `Authorization: tma <initData>` header — the backend re-validates it each time.
 */
async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const initData = getInitData();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `tma ${initData}`,
    ...(options.headers as Record<string, string> | undefined),
  };

  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers });

  if (!res.ok) {
    let code = "request_failed";
    try {
      const data = await res.json();
      code = data?.error ?? code;
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, code);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

// ---------- Typed endpoints ----------

import type { MeResponse } from "../store/useStore";

export interface PublicProfile {
  userId: string;
  name: string;
  age: number;
  gender: string;
  intent: string;
  city: string;
  cityLabel: string;
  bio: string | null;
  heightCm: number | null;
  smoking: string | null;
  drinking: string | null;
  interests: string[];
  photos: { url: string; position: number }[];
}

export interface UpdateProfilePayload {
  name?: string;
  bio?: string;
  city?: string;
  intent?: string;
  heightCm?: number | null;
  smoking?: string | null;
  drinking?: string | null;
  interests?: string[];
}

export interface MatchListItem {
  matchId: string;
  createdAt: string;
  user: {
    userId: string;
    name: string;
    age: number;
    city: string;
    cityLabel: string;
    photo: string | null;
  } | null;
  lastMessage: {
    body: string;
    senderId: string;
    createdAt: string;
  } | null;
  unread?: number;
  seen?: boolean;
}

export interface ChatMessage {
  id: string;
  matchId: string;
  senderId: string;
  body: string;
  createdAt: string;
}

export const api = {
  getMe: () => request<MeResponse>("/api/me"),

  setLanguage: (language: "uz" | "ru") =>
    request<{ ok: true }>("/api/me/language", {
      method: "PATCH",
      body: JSON.stringify({ language }),
    }),

  setPresence: (online: boolean) =>
    request<{ ok: true }>("/api/me/presence", {
      method: "POST",
      body: JSON.stringify({ online }),
    }),

  presignPhoto: (contentType: string) =>
    request<{ key: string; uploadUrl: string; publicUrl: string }>(
      "/api/photos/presign",
      { method: "POST", body: JSON.stringify({ contentType }) },
    ),

  submitProfile: (payload: {
    name: string;
    birthdate: string;
    gender: string;
    intent: string;
    city: string;
    photos: { key: string; url: string }[];
  }) =>
    request<{ profile: unknown }>("/api/profile", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  updateProfile: (payload: UpdateProfilePayload) =>
    request<{ profile: unknown }>("/api/profile", {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),

  getDiscovery: (opts?: {
    scope?: "foryou" | "nearby";
    minAge?: number;
    maxAge?: number;
  }) => {
    const p = new URLSearchParams();
    p.set("scope", opts?.scope ?? "foryou");
    if (opts?.minAge) p.set("minAge", String(opts.minAge));
    if (opts?.maxAge) p.set("maxAge", String(opts.maxAge));
    return request<{ queue: PublicProfile[] }>(`/api/discovery?${p.toString()}`);
  },

  getLikes: () =>
    request<{ likes: PublicProfile[]; newCount: number }>("/api/likes"),

  markLikesSeen: () =>
    request<{ ok: true }>("/api/likes/seen", { method: "POST", body: "{}" }),

  swipe: (targetUserId: string, action: "like" | "pass") =>
    request<{ ok: true; matched: boolean; matchId: string | null; remaining: number }>(
      "/api/swipe",
      { method: "POST", body: JSON.stringify({ targetUserId, action }) },
    ),

  getMatches: () => request<{ matches: MatchListItem[] }>("/api/matches"),

  getMessages: (matchId: string) =>
    request<{ messages: ChatMessage[] }>(`/api/matches/${matchId}/messages`),

  markRead: (matchId: string) =>
    request<{ ok: true }>(`/api/matches/${matchId}/read`, {
      method: "POST",
      body: "{}",
    }),

  markMatchSeen: (matchId: string) =>
    request<{ ok: true }>(`/api/matches/${matchId}/seen`, {
      method: "POST",
      body: "{}",
    }),

  deleteProfile: () =>
    request<{ ok: true }>("/api/profile", { method: "DELETE" }),

  sendMessage: (matchId: string, body: string) =>
    request<{ message: ChatMessage }>(`/api/matches/${matchId}/messages`, {
      method: "POST",
      body: JSON.stringify({ body }),
    }),

  report: (reportedUserId: string, reason: string, note?: string) =>
    request<{ ok: true }>("/api/report", {
      method: "POST",
      body: JSON.stringify({ reportedUserId, reason, note }),
    }),

  block: (targetUserId: string) =>
    request<{ ok: true }>("/api/block", {
      method: "POST",
      body: JSON.stringify({ targetUserId }),
    }),
};

/** Upload a file directly to R2 using a presigned PUT URL. */
export async function uploadToR2(
  uploadUrl: string,
  file: File,
): Promise<void> {
  const res = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": file.type },
    body: file,
  });
  if (!res.ok) throw new Error("upload_failed");
}
