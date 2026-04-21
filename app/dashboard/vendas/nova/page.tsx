import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import NovaVendaClient from "./NovaVendaClient";

type UserLite = { id: string; name: string; login: string };

type Sess = {
  id: string;
  login: string;
  name?: string;
  team: string;
  role: "admin" | "staff";
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
    return parsed as Sess;
  } catch {
    return null;
  }
}

export default async function Page() {
  const store = await cookies();
  const raw = store.get("tm.session")?.value;
  const sess = readSessionCookie(raw);

  if (!sess?.id || !sess?.login) {
    redirect("/login");
  }

  const initialMe: UserLite = {
    id: sess.id,
    login: sess.login,
    name: sess.name || sess.login,
  };

  return <NovaVendaClient initialMe={initialMe} />;
}
