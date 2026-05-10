// app/dashboard/page.tsx
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import DashboardHomeClient from "./DashboardHomeClient";
import { isOperationalRole } from "@/lib/session-roles";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Sess = {
  id: string;
  login: string;
  team: string;
  role: "admin" | "staff" | "developer";
  name?: string;
  email?: string | null;
};

function b64urlDecode(input: string) {
  const pad = input.length % 4 === 0 ? "" : "=".repeat(4 - (input.length % 4));
  const base64 = (input + pad).replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(base64, "base64").toString("utf8");
}

function readSessionCookie(raw?: string): Sess | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(b64urlDecode(raw)) as Partial<Sess>;
    if (!parsed?.id || !parsed?.login || !parsed?.team || !parsed?.role) return null;
    if (!isOperationalRole(parsed.role)) return null;
    return parsed as Sess;
  } catch {
    return null;
  }
}

export default async function DashboardHome() {
  const store = await cookies();
  const raw = store.get("tm.session")?.value;

  const session = readSessionCookie(raw);

  if (!session) redirect("/login?next=/dashboard");

  return <DashboardHomeClient session={session} />;
}
