"use client";

import { useEffect, useMemo, useState } from "react";

type FuncItem = {
  id: string;
  name: string;
  login: string;
  cpf: string | null;
  team: string;
  role: string;
  inviteCode: string | null;
  createdAt: string;
  _count?: { cedentes: number };
};

function baseUrl() {
  const env = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/+$/, "");
  if (env) return env;
  if (typeof window !== "undefined") return window.location.origin;
  return "";
}

export default function FuncionariosPage() {
  const [items, setItems] = useState<FuncItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    try {
      setLoading(true);
      setError("");
      const res = await fetch("/api/funcionarios", { cache: "no-store" });
      const json = await res.json();
      if (!json?.ok) throw new Error(json?.error || "Falha ao carregar.");
      setItems(json.data || []);
    } catch (e: any) {
      setError(e?.message || "Erro");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const appBase = useMemo(() => baseUrl(), []);

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Funcionários</h1>
        <a href="/dashboard/funcionarios/novo" className="rounded-xl bg-black px-4 py-2 text-white">
          Novo funcionário
        </a>
      </div>

      {loading && <p className="text-sm text-slate-600">Carregando...</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {!loading && !error && (
        <div className="space-y-3">
          {items.map((f) => {
            const inviteUrl = f.inviteCode ? `${appBase}/convite/${f.inviteCode}` : "";

            return (
              <div key={f.id} className="rounded-2xl border p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="font-semibold">{f.name}</div>
                    <div className="text-sm text-slate-600">
                      Login: <span className="font-medium">{f.login}</span> • CPF:{" "}
                      <span className="font-medium">{f.cpf || "-"}</span> • Time:{" "}
                      <span className="font-medium">{f.team}</span>
                    </div>
                    <div className="text-xs text-slate-500">
                      Cedentes vinculados: <span className="font-semibold">{f._count?.cedentes ?? 0}</span>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 min-w-[360px]">
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-semibold text-slate-600">Link convite</div>

                      {/* ✅ botão editar */}
                      <a
                        href={`/dashboard/funcionarios/${f.id}`}
                        className="rounded-xl border px-3 py-2 text-xs hover:bg-slate-50"
                      >
                        Editar
                      </a>
                    </div>

                    <div className="flex gap-2">
                      <input className="w-full rounded-xl border px-3 py-2 text-xs" value={inviteUrl || "—"} readOnly />
                      <button
                        type="button"
                        className="rounded-xl border px-3 py-2 text-xs hover:bg-slate-50 disabled:opacity-60"
                        onClick={() => {
                          if (!inviteUrl) return;
                          navigator.clipboard.writeText(inviteUrl);
                          alert("Link copiado!");
                        }}
                        disabled={!inviteUrl}
                      >
                        Copiar
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          {items.length === 0 && (
            <div className="rounded-2xl border p-6 text-sm text-slate-600">Nenhum funcionário cadastrado ainda.</div>
          )}
        </div>
      )}
    </div>
  );
}
