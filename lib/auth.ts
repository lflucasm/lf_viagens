// src/lib/auth.ts
"use client";

export type Session = {
  id: string;
  name: string;
  login: string;
  email?: string | null;
  team: string;
  role: "admin" | "staff";
};

const AUTH_SESSION_KEY = "auth_session";

/* =========================
 * Cache local (UI only)
 * ========================= */
export function getSession(): Session | null {
  try {
    const raw = localStorage.getItem(AUTH_SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s?.id || !s?.login || !s?.team) return null;
    return s as Session;
  } catch {
    return null;
  }
}

export function setSession(session: Session | null) {
  if (!session) {
    localStorage.removeItem(AUTH_SESSION_KEY);
    return;
  }
  localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(session));
}

export async function signOut(): Promise<boolean> {
  try {
    const r = await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "logout" }),
    });
    setSession(null);
    return r.ok;
  } catch {
    setSession(null);
    return false;
  }
}

/* =========================
 * Ações no servidor (/api/auth)
 * ========================= */

// opcional: força o handler existir (mantém compat)
export async function ensureSeedCredentials(): Promise<void> {
  try {
    await fetch("/api/auth", { method: "GET" });
  } catch {}
}

/** Restaura credenciais do seed (jephesson/ufpb2010; demais/1234) */
export async function resetCredentialsToSeed(): Promise<boolean> {
  const res = await fetch("/api/auth", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "resetSeed" }),
  });
  return res.ok;
}

/** Atualiza senha de um login existente no banco */
export async function setPassword(login: string, newPassword: string): Promise<boolean> {
  const res = await fetch("/api/auth", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "setPassword", login, password: newPassword }),
  });
  const json = await res.json().catch(() => ({}));
  if (!json?.ok) throw new Error(json?.error || "Falha ao salvar senha");
  return true;
}

/** Login no servidor (grava cookie) e guarda sessão no localStorage (UI) */
export async function signIn(params: {
  login: string;
  password: string;
}): Promise<boolean> {
  const res = await fetch("/api/auth", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "login",
      login: params.login,
      password: params.password,
    }),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json?.ok) return false;

  const session: Session | undefined = json?.data?.session;
  if (session) setSession(session); // cache para UI
  return true;
}
