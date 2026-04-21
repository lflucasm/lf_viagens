// app/dashboard/page.tsx
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import LogoutButton from "@/components/LogoutButton";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Sess = {
  id: string;
  login: string;
  team: string;
  role: "admin" | "staff";
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
    if (parsed.role !== "admin" && parsed.role !== "staff") return null;
    return parsed as Sess;
  } catch {
    return null;
  }
}

export default async function DashboardHome() {
  const store = await cookies();
  const raw = store.get("tm.session")?.value;

  const session = readSessionCookie(raw);

  // manda pro login já com next certinho
  if (!session) redirect("/login?next=/dashboard");

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-slate-600">
            Olá, <span className="font-medium">{session.login}</span>!
          </p>
        </div>
        <LogoutButton />
      </div>

      <div className="rounded-xl border p-4">
        <div className="text-sm font-semibold mb-3">Sua sessão</div>

        <div className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <span className="text-slate-500">ID:</span>{" "}
            <span className="font-mono">{session.id}</span>
          </div>

          <div>
            <span className="text-slate-500">Login:</span>{" "}
            <span className="font-mono">{session.login}</span>
          </div>

          <div>
            <span className="text-slate-500">Papel:</span>{" "}
            {session.role === "admin" ? "Admin" : "Staff"}
          </div>

          <div className="sm:col-span-2 lg:col-span-3">
            <span className="text-slate-500">Time:</span> {session.team}
          </div>
        </div>
      </div>

      <p className="text-slate-600">
        Escolha uma opção na barra lateral. Sugestão: começar por{" "}
        <a href="/dashboard/cedentes/importar" className="underline">
          Importar cedentes
        </a>
        .
      </p>
    </div>
  );
}
