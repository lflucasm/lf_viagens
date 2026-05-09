// app/dashboard/page.tsx
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { BarChart3, Upload, Wallet } from "lucide-react";
import LogoutButton from "@/components/LogoutButton";
import { ShortcutCard } from "@/components/ui/dashboard-cards";

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

      <div className="rounded-2xl border border-slate-200/90 bg-gradient-to-br from-slate-50/60 to-white p-5 shadow-sm shadow-slate-200/35">
        <div className="text-sm font-semibold mb-3 text-slate-900">Sua sessão</div>

        <div className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <span className="text-slate-500">ID:</span>{" "}
            <span className="font-mono text-slate-900">{session.id}</span>
          </div>

          <div>
            <span className="text-slate-500">Login:</span>{" "}
            <span className="font-mono text-slate-900">{session.login}</span>
          </div>

          <div>
            <span className="text-slate-500">Papel:</span>{" "}
            <span className="text-slate-900">{session.role === "admin" ? "Admin" : "Staff"}</span>
          </div>

          <div className="sm:col-span-2 lg:col-span-3">
            <span className="text-slate-500">Time:</span>{" "}
            <span className="text-slate-900">{session.team}</span>
          </div>
        </div>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-slate-900 mb-3">Atalhos</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <ShortcutCard
            href="/dashboard/cedentes/importar"
            title="Importar cedentes"
            description="Envie planilhas e cadastre novos cedentes no sistema."
            icon={<Upload className="h-5 w-5" strokeWidth={2} />}
            tone="sky"
          />
          <ShortcutCard
            href="/dashboard/analise-dados"
            title="Análise de dados"
            description="KPIs, vendas, milheiro e comparativos do período."
            icon={<BarChart3 className="h-5 w-5" strokeWidth={2} />}
            tone="emerald"
          />
          <ShortcutCard
            href="/dashboard/resumo"
            title="Resumo financeiro"
            description="Patrimônio, caixa e snapshots operacionais."
            icon={<Wallet className="h-5 w-5" strokeWidth={2} />}
            tone="indigo"
          />
        </div>
      </div>

      <p className="text-sm text-slate-600">
        Você também pode navegar por qualquer seção na barra lateral.
      </p>
    </div>
  );
}
