"use client";

import { useEffect, useMemo, useState } from "react";

type AnotacaoStatus = "PENDENTE" | "RESOLVIDO";

type CedenteOption = {
  id: string;
  identificador: string;
  nomeCompleto: string;
  cpf: string;
};

type Row = {
  id: string;
  status: AnotacaoStatus;
  texto: string;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  cedente: {
    id: string;
    nomeCompleto: string;
    identificador: string;
    cpf: string;
  };
  createdBy: {
    id: string;
    name: string;
    login: string;
  };
};

function fmtDateTimeBR(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR");
}

function statusLabel(status: AnotacaoStatus) {
  return status === "RESOLVIDO" ? "Resolvido" : "Pendente";
}

function statusClass(status: AnotacaoStatus) {
  if (status === "RESOLVIDO") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  return "border-amber-200 bg-amber-50 text-amber-700";
}

export default function AnotacoesClient() {
  const [cedentes, setCedentes] = useState<CedenteOption[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [cedenteId, setCedenteId] = useState("");
  const [texto, setTexto] = useState("");
  const [status, setStatus] = useState<AnotacaoStatus>("PENDENTE");
  const [statusFilter, setStatusFilter] = useState<"" | AnotacaoStatus>("");
  const [q, setQ] = useState("");

  async function loadCedentes() {
    const res = await fetch("/api/cedentes/mini", { cache: "no-store" });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.ok) {
      throw new Error(json?.error || "Falha ao carregar contas.");
    }

    const next = (json.rows || []) as CedenteOption[];
    setCedentes(next);
    setCedenteId((prev) => prev || next[0]?.id || "");
  }

  async function loadAnotacoes() {
    const res = await fetch("/api/anotacoes", { cache: "no-store" });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.ok) {
      throw new Error(json?.error || "Falha ao carregar anotações.");
    }
    setRows((json.rows || []) as Row[]);
  }

  async function load() {
    setLoading(true);
    setError(null);
    try {
      await Promise.all([loadCedentes(), loadAnotacoes()]);
    } catch (e: any) {
      setError(e?.message || "Erro ao carregar dados.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const text = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter && r.status !== statusFilter) return false;
      if (!text) return true;
      const hay =
        `${r.cedente.nomeCompleto} ${r.cedente.identificador} ${r.texto} ${r.createdBy.name} ${r.createdBy.login}`.toLowerCase();
      return hay.includes(text);
    });
  }, [rows, statusFilter, q]);

  async function createAnotacao() {
    if (!cedenteId) {
      alert("Selecione uma conta.");
      return;
    }
    if (texto.trim().length < 3) {
      alert("A anotação deve ter pelo menos 3 caracteres.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/anotacoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cedenteId,
          texto,
          status,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Falha ao criar anotação.");
      }

      setTexto("");
      setStatus("PENDENTE");
      await loadAnotacoes();
    } catch (e: any) {
      alert(e?.message || "Erro ao criar anotação.");
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(id: string, next: AnotacaoStatus) {
    setUpdatingId(id);
    try {
      const res = await fetch("/api/anotacoes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status: next }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Falha ao atualizar status.");
      }
      await loadAnotacoes();
    } catch (e: any) {
      alert(e?.message || "Erro ao atualizar.");
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <div className="mx-auto max-w-7xl p-4 space-y-4">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Anotações</h1>
          <p className="text-sm text-slate-600">
            Registre observações por conta e acompanhe pendências.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          className="rounded-md border px-3 py-2 text-sm hover:bg-slate-50"
        >
          Atualizar
        </button>
      </div>

      <div className="rounded-xl border p-4 space-y-3">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          <div className="space-y-1">
            <label className="text-xs text-slate-600">Conta</label>
            <select
              value={cedenteId}
              onChange={(e) => setCedenteId(e.target.value)}
              className="w-full rounded-md border px-3 py-2 text-sm"
            >
              {cedentes.length === 0 ? (
                <option value="">Sem contas</option>
              ) : (
                cedentes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.identificador} • {c.nomeCompleto}
                  </option>
                ))
              )}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-xs text-slate-600">Status inicial</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as AnotacaoStatus)}
              className="w-full rounded-md border px-3 py-2 text-sm"
            >
              <option value="PENDENTE">Pendente</option>
              <option value="RESOLVIDO">Resolvido</option>
            </select>
          </div>

          <div className="flex items-end">
            <button
              type="button"
              onClick={createAnotacao}
              disabled={saving || !cedenteId}
              className="w-full rounded-md border border-black bg-black px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? "Salvando..." : "Salvar anotação"}
            </button>
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-xs text-slate-600">Anotação</label>
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Digite sua anotação para a conta selecionada..."
            rows={4}
            className="w-full rounded-md border px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div className="rounded-xl border p-4 space-y-3">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div className="text-sm text-slate-600">
            Lista ordenada por data de resolução (mais recente primeiro).
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as "" | AnotacaoStatus)}
              className="rounded-md border px-3 py-2 text-sm"
            >
              <option value="">Todos os status</option>
              <option value="PENDENTE">Somente pendentes</option>
              <option value="RESOLVIDO">Somente resolvidos</option>
            </select>

            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar conta, anotação, criador..."
              className="rounded-md border px-3 py-2 text-sm sm:w-80"
            />
          </div>
        </div>

        {loading ? (
          <div className="text-sm text-slate-600">Carregando...</div>
        ) : error ? (
          <div className="text-sm text-rose-600">{error}</div>
        ) : filtered.length === 0 ? (
          <div className="text-sm text-slate-600">Nenhuma anotação encontrada.</div>
        ) : (
          <div className="overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="border-b bg-slate-50">
                <tr>
                  <th className="px-3 py-2 text-left">Conta</th>
                  <th className="px-3 py-2 text-left">Anotação</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-left">Resolução</th>
                  <th className="px-3 py-2 text-left">Criado em</th>
                  <th className="px-3 py-2 text-left">Criado por</th>
                  <th className="px-3 py-2 text-left">Ação</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} className="border-b last:border-b-0 align-top">
                    <td className="px-3 py-2">
                      <div className="font-medium">{r.cedente.nomeCompleto}</div>
                      <div className="text-xs text-slate-500">
                        {r.cedente.identificador}
                      </div>
                    </td>
                    <td className="px-3 py-2 whitespace-pre-wrap min-w-[280px]">
                      {r.texto}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${statusClass(r.status)}`}
                      >
                        {statusLabel(r.status)}
                      </span>
                    </td>
                    <td className="px-3 py-2">{fmtDateTimeBR(r.resolvedAt)}</td>
                    <td className="px-3 py-2">{fmtDateTimeBR(r.createdAt)}</td>
                    <td className="px-3 py-2">
                      {r.createdBy.name} @{r.createdBy.login}
                    </td>
                    <td className="px-3 py-2">
                      {r.status === "PENDENTE" ? (
                        <button
                          type="button"
                          disabled={updatingId === r.id}
                          onClick={() => changeStatus(r.id, "RESOLVIDO")}
                          className="rounded-md border border-emerald-300 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 disabled:opacity-60"
                        >
                          {updatingId === r.id
                            ? "Salvando..."
                            : "Marcar resolvido"}
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={updatingId === r.id}
                          onClick={() => changeStatus(r.id, "PENDENTE")}
                          className="rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700 disabled:opacity-60"
                        >
                          {updatingId === r.id
                            ? "Salvando..."
                            : "Voltar pendente"}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
