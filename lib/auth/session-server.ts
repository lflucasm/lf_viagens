// lib/auth/session-server.ts
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

export type SessionUser = {
  id: string;
  login: string;
  name: string;
  team: string;
  role: string;
  employeeId?: string | null;
};

export type Session = {
  // mantém compatibilidade com o que já existia
  user: SessionUser;

  // campos que payouts esperam
  userId: string;
  team: string;
  role: string;
};

function readCookieFromHeader(cookieHeader: string | null, name: string) {
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(";").map((p) => p.trim());
  for (const p of parts) {
    if (p.startsWith(name + "=")) return decodeURIComponent(p.slice(name.length + 1));
  }
  return null;
}

export async function requireSession(req?: Request): Promise<Session> {
  const token = req
    ? readCookieFromHeader(req.headers.get("cookie"), "tm.session")
    : (await cookies()).get("tm.session")?.value;

  if (!token) throw new Error("UNAUTHENTICATED");

  const user = await prisma.user.findUnique({
    where: { id: token },
    select: { id: true, login: true, name: true, team: true, role: true, employeeId: true },
  });

  if (!user) throw new Error("UNAUTHENTICATED");

  return {
    user,
    userId: user.id,
    team: user.team,
    role: user.role,
  };
}
