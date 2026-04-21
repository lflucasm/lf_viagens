"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type ProgramKey = "latam" | "smiles" | "livelo" | "esfera";

type CedenteRowFromApproved = {
  id: string;
  identificador: string;
  nomeCompleto: string;
  cpf: string;
};

type ApprovedResp = { ok: boolean; data?: any; error?: string };

type Usage = {
  program: string;
  windowStart: string; // ISO
  windowEnd: string; // ISO
  limit: number;
  used: number;
  remaining: number;
};

type EmissionEventRow = {
  id: string;
  cedenteId: string;
  program: string;
  passengersCount: number;
  issuedAt: string; // ISO
  source: string;
  note: string | null;
  createdAt: string; // ISO
};

function cn(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function todayYYYYMMDD() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fmtDateBR(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR");
}

function isoToYMD(iso: string) {
  return new Date(iso).toISOString().slice(0, 10);
}

const PROGRAMS: Array<{ key: ProgramKey; label: string; hint: string }> = [
  { key: "latam", label: "LATAM", hint: "Janela móvel 365 dias" },
  { key: "smiles", label: "Smiles", hint: "Zera em 01/01" },
  { key: "livelo", label: "Livelo", hint: "Sem regra (por enquanto)" },
  { key: "esfera", label: "Esfera", hint: "Sem regra (por enquanto)" },
];

export default function EmissionsClient({
  initialProgram,
  initialCedenteId,
}: {
  initialProgram: string;
  initialCedenteId: string;
}) {
  const router = useRouter();
  const sp = useSearchParams();

  const [program, setProgram] = useState<ProgramKey>(() => {
    const p = String(initialProgram || "latam").toLowerCase();
    return (["latam", "smiles", "livelo", "esfera"].includes(p)
      ? p
      : "latam") as ProgramKey;
  });

  const [cedenteId, setCedenteId] = useState<string>(initialCedenteId || "");
  const [issuedDate, setIssuedDate] = useState<string>(todayYYYYMMDD());

  // cedentes (carrega /api/cedentes/approved uma vez)
  const [cedentes, setCedentes] = useState<CedenteRowFromApproved[]>([]);
  const [cedentesLoading, setCedentesLoading] = useState(false);
  const [q, setQ] = useState("");

  // contador/uso
  const [usage, setUsage] = useState<Usage | null>(null);
  const [usageLoading, setUsageLoading] = useState(false);

  // listagem
  const [rows, setRows] = useState<EmissionEventRow[]>([]);
  const [listLoading, setListLoading] = useState(false);

  // criação
  const [passengersCount, setPassengersCount] = useState<number>(1);
  const [note, setNote] = useState<string>("");

  // edição
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPassengers, setEditPassengers] = useState<number>(1);
  const [editIssuedDate, setEditIssuedDate] = useState<string>(todayYYYYMMDD());
  const [editNote, setEditNote] = useState<string>("");

  // ✅ seleção (para apagar selecionados)
  const [selectedIds, setSelectedIds] = useState<Record<string, boolean>>({});
  const selectedCount = useMemo(
    () => Object.values(selectedIds).filter(Boolean).length,
    [selectedIds]
  );
  const selectedIdList = useMemo(
    () => Object.entries(selectedIds).filter(([, v]) => v).map(([k]) => k),
    [selectedIds]
  );

  function syncUrl(next: { programa?: string; cedenteId?: string }) {
    const params = new URLSearchParams(sp?.toString());
    if (next.programa != null) params.set("programa", next.programa);
    if (next.cedenteId != null) {
      if (next.cedenteId) params.set("cedenteId", next.cedenteId);
      else params.delete("cedenteId");
    }
    router.replace(`/dashboard/emissoes?${params.toString()}`, { scroll: false });
  }

  async function loadCedentesApproved() {
    setCedentesLoading(true);
    try {
      const res = await fetch("/api/cedentes/approved", { cache: "no-store" });
      const json: ApprovedResp = await res.json().catch(() => ({} as any));
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Falha ao carregar cedentes.");
      const data = Array.isArray(json.data) ? json.data : [];
      setCedentes(
        data.map((r: any) => ({
          id: r.id,
          identificador: r.identificador,
          nomeCompleto: r.nomeCompleto,
          cpf: r.cpf,
        }))
      );
    } catch (e: any) {
      setCedentes([]);
      alert(e?.message || "Erro ao carregar cedentes.");
    } finally {
      setCedentesLoading(false);
    }
  }

  useEffect(() => {
    loadCedentesApproved();
  }, []);

  useEffect(() => {
    syncUrl({ programa: program });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [program]);

  useEffect(() => {
    syncUrl({ cedenteId });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cedenteId]);

  const filteredCedentes = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return cedentes.slice(0, 15);
    return cedentes
      .filter((c) => {
        return (
          c.nomeCompleto.toLowerCase().includes(s) ||
          c.identificador.toLowerCase().includes(s) ||
          String(c.cpf || "").includes(s)
        );
      })
      .slice(0, 15);
  }, [cedentes, q]);

  const selectedCedente = useMemo(
    () => cedentes.find((c) => c.id === cedenteId) || null,
    [cedentes, cedenteId]
  );

  async function loadUsage() {
    if (!cedenteId) {
      setUsage(null);
      return;
    }
    setUsageLoading(true);
    try {
      const res = await fetch(
        `/api/emissions?mode=usage&cedenteId=${encodeURIComponent(
          cedenteId
        )}&programa=${encodeURIComponent(program)}&issuedDate=${encodeURIComponent(
          issuedDate
        )}`,
        { cache: "no-store" }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Falha ao carregar contador");
      setUsage(data);
    } catch (e: any) {
      setUsage(null);
      alert(e?.message || "Erro ao carregar contador");
    } finally {
      setUsageLoading(false);
    }
  }

  async function loadList() {
    if (!cedenteId) {
      setRows([]);
      setSelectedIds({});
      return;
    }
    setListLoading(true);
    try {
      const res = await fetch(
        `/api/emissions?mode=list&cedenteId=${encodeURIComponent(
          cedenteId
        )}&programa=${encodeURIComponent(program)}&take=50`,
        { cache: "no-store" }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Falha ao carregar lista");
      const nextRows = Array.isArray(data) ? data : [];
      setRows(nextRows);

      // ✅ remove seleções que não existem mais
      setSelectedIds((prev) => {
        const allowed = new Set(nextRows.map((r: EmissionEventRow) => r.id));
        const out: Record<string, boolean> = {};
        for (const [k, v] of Object.entries(prev)) if (v && allowed.has(k)) out[k] = true;
        return out;
      });
    } catch (e: any) {
      setRows([]);
      setSelectedIds({});
      alert(e?.message || "Erro ao carregar lista");
    } finally {
      setListLoading(false);
    }
  }

  async function refreshAll() {
    await Promise.all([loadUsage(), loadList()]);
  }

  useEffect(() => {
    refreshAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [program, cedenteId, issuedDate]);

  async function createEmission() {
    if (!cedenteId) return alert("Selecione um cedente.");
    if (!issuedDate) return alert("Selecione a data.");
    if (!Number.isFinite(passengersCount) || passengersCount < 1)
      return alert("Passageiros inválido (>= 1).");

    try {
      const res = await fetch(`/api/emissions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          cedenteId,
          programa: program,
          issuedDate,
          passengersCount,
          note: note?.trim() ? note.trim() : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Falha ao criar lançamento");

      setPassengersCount(1);
      setNote("");
      await refreshAll();
    } catch (e: any) {
      alert(e?.message || "Erro ao criar lançamento");
    }
  }

  async function deleteEmission(id: string) {
    if (!confirm("Excluir este lançamento?")) return;
    try {
      const res = await fetch(`/api/emissions/${id}`, {
        method: "DELETE",
        cache: "no-store",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Falha ao excluir");
      await refreshAll();
    } catch (e: any) {
      alert(e?.message || "Erro ao excluir");
    }
  }

  function startEdit(r: EmissionEventRow) {
    setEditingId(r.id);
    setEditPassengers(r.passengersCount);
    setEditIssuedDate(isoToYMD(r.issuedAt));
    setEditNote(r.note || "");
  }

  function cancelEdit() {
    setEditingId(null);
    setEditPassengers(1);
    setEditIssuedDate(todayYYYYMMDD());
    setEditNote("");
  }

  async function saveEdit(id: string) {
    if (!Number.isFinite(editPassengers) || editPassengers < 1)
      return alert("Passageiros inválido (>= 1).");
    if (!editIssuedDate) return alert("Data inválida.");

    try {
      const res = await fetch(`/api/emissions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          passengersCount: editPassengers,
          issuedDate: editIssuedDate,
          note: editNote?.trim() ? editNote.trim() : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Falha ao salvar edição");
      cancelEdit();
      await refreshAll();
    } catch (e: any) {
      alert(e?.message || "Erro ao salvar");
    }
  }

  /** =========================
   *  ✅ ZERAR / LIMPAR (DELETE /api/emissions) — SEM SENHA
   *  agora só manda confirm: true
   *  ========================= */
  async function clearSelected() {
    if (!cedenteId) return alert("Selecione um cedente.");
    if (selectedIdList.length === 0) return alert("Selecione ao menos 1 lançamento.");

    if (!confirm(`Tem certeza que deseja apagar ${selectedIdList.length} lançamento(s) selecionado(s)?`))
      return;

    try {
      const res = await fetch("/api/emissions", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          confirm: true,
          scope: "SELECTED",
          ids: selectedIdList,
          // opcionalmente restringe (segurança extra)
          cedenteId,
          programa: program,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Falha ao apagar selecionados.");
      setSelectedIds({});
      await refreshAll();
      alert(`Apagados: ${data.deleted ?? 0}`);
    } catch (e: any) {
      alert(e?.message || "Erro ao apagar selecionados.");
    }
  }

  async function clearCedenteAll() {
    if (!cedenteId) return alert("Selecione um cedente.");
    if (!confirm("Tem certeza que deseja apagar TODOS os lançamentos deste cedente (no programa atual)?"))
      return;

    try {
      const res = await fetch("/api/emissions", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          confirm: true,
          scope: "CEDENTE",
          cedenteId,
          programa: program, // apaga só do programa atual; remova esta linha se quiser apagar de todos os programas
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Falha ao apagar do cedente.");
      setSelectedIds({});
      await refreshAll();
      alert(`Apagados: ${data.deleted ?? 0}`);
    } catch (e: any) {
      alert(e?.message || "Erro ao apagar do cedente.");
    }
  }

  async function clearAllProgram() {
    // ✅ apaga tudo DO PROGRAMA (todos cedentes)
    if (
      !confirm(
        `Tem certeza que deseja apagar TODOS os lançamentos do programa ${program.toUpperCase()} (todos os cedentes)?`
      )
    )
      return;

    try {
      const res = await fetch("/api/emissions", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          confirm: true,
          scope: "ALL",
          programa: program, // filtro -> não precisa confirmAll
          // confirmAll: true, // (opcional) não é necessário quando há filtro
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Falha ao apagar tudo do programa.");
      setSelectedIds({});
      await refreshAll();
      alert(`Apagados: ${data.deleted ?? 0}`);
    } catch (e: any) {
      alert(e?.message || "Erro ao apagar tudo do programa.");
    }
  }

  function toggleRow(id: string, value?: boolean) {
    setSelectedIds((prev) => ({ ...prev, [id]: value ?? !prev[id] }));
  }
  function toggleAllVisible(checked: boolean) {
    setSelectedIds((prev) => {
      const out = { ...prev };
      for (const r of rows) out[r.id] = checked;
      return out;
    });
  }

  const allVisibleSelected = rows.length > 0 && rows.every((r) => selectedIds[r.id]);
  const someVisibleSelected = rows.some((r) => selectedIds[r.id]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Emissões</h1>
            <p className="text-sm text-zinc-500">
              Lançamento manual por enquanto (pax por emissão) + contador por programa.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-sm text-zinc-600">Data:</label>
            <input
              type="date"
              value={issuedDate}
              onChange={(e) => setIssuedDate(e.target.value)}
              className="h-9 rounded-lg border border-zinc-200 bg-white px-3 text-sm shadow-sm outline-none focus:border-zinc-300"
            />
          </div>
        </div>

        {/* Program Tabs */}
        <div className="flex flex-wrap gap-2">
          {PROGRAMS.map((p) => (
            <button
              key={p.key}
              onClick={() => setProgram(p.key)}
              className={cn(
                "rounded-full border px-3 py-1 text-sm shadow-sm",
                program === p.key
                  ? "border-zinc-900 bg-zinc-900 text-white"
                  : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
              )}
              title={p.hint}
            >
              {p.label}
            </button>
          ))}
          <span className="ml-2 self-center text-xs text-zinc-500">
            {PROGRAMS.find((p) => p.key === program)?.hint}
          </span>
        </div>
      </div>

      {/* Cedente Picker */}
      <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-base font-semibold">Cedente</h2>
          <div className="flex items-center gap-2">
            {cedentesLoading ? (
              <span className="text-xs text-zinc-500">Carregando…</span>
            ) : (
              <span className="text-xs text-zinc-500">{cedentes.length} aprovados</span>
            )}
            {cedenteId ? (
              <button
                onClick={() => setCedenteId("")}
                className="text-xs text-zinc-600 hover:text-zinc-900"
              >
                limpar
              </button>
            ) : null}
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-6">
          <div className="md:col-span-3">
            <label className="mb-1 block text-xs text-zinc-600">
              Buscar (nome / CPF / identificador)
            </label>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Ex.: Maria / 12345678900 / CD00012"
              className="h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm shadow-sm outline-none focus:border-zinc-300"
            />
          </div>

          <div className="md:col-span-3">
            <label className="mb-1 block text-xs text-zinc-600">Selecionado</label>
            <div className="flex h-10 items-center rounded-xl border border-zinc-200 bg-zinc-50 px-3 text-sm text-zinc-700">
              {selectedCedente
                ? `${selectedCedente.identificador} — ${selectedCedente.nomeCompleto}`
                : "Nenhum cedente selecionado"}
            </div>
          </div>

          {filteredCedentes.length > 0 ? (
            <div className="md:col-span-6">
              <div className="overflow-hidden rounded-xl border border-zinc-200">
                {filteredCedentes.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setCedenteId(c.id)}
                    className={cn(
                      "flex w-full items-center justify-between gap-3 border-b border-zinc-200 px-3 py-2 text-left hover:bg-zinc-50",
                      c.id === cedenteId && "bg-zinc-50"
                    )}
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">
                        {c.identificador} — {c.nomeCompleto}
                      </div>
                      <div className="text-xs text-zinc-500">CPF: {c.cpf}</div>
                    </div>
                    <div className="text-xs text-zinc-500">{c.id.slice(0, 8)}…</div>
                  </button>
                ))}
              </div>
              <div className="mt-2 text-xs text-zinc-500">
                Fonte: <span className="rounded bg-zinc-100 px-1 py-0.5">/api/cedentes/approved</span>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* Counter */}
      <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-base font-semibold">Contador</h2>
          {usageLoading ? <span className="text-xs text-zinc-500">Carregando…</span> : null}
        </div>

        {!cedenteId ? (
          <div className="text-sm text-zinc-600">Selecione um cedente para ver o contador.</div>
        ) : usage ? (
          <div className="grid gap-3 md:grid-cols-4">
            <Stat label="Limite" value={String(usage.limit)} />
            <Stat label="Usado" value={String(usage.used)} />
            <Stat label="Restante" value={String(usage.remaining)} strong warn={usage.remaining <= 3} />
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
              <div className="text-xs text-zinc-500">Janela</div>
              <div className="text-sm font-medium">
                {fmtDateBR(usage.windowStart)} → {fmtDateBR(usage.windowEnd)}
              </div>
              <div className="mt-1 text-xs text-zinc-500">Baseado na data selecionada ({issuedDate})</div>
            </div>
          </div>
        ) : (
          <div className="text-sm text-zinc-600">Sem dados (verifique API de emissões).</div>
        )}

        {/* ✅ Ações de zerar/limpar */}
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            onClick={clearCedenteAll}
            disabled={!cedenteId}
            className={cn(
              "h-9 rounded-xl border px-3 text-sm shadow-sm",
              !cedenteId
                ? "cursor-not-allowed border-zinc-200 bg-zinc-100 text-zinc-400"
                : "border-red-200 bg-white text-red-700 hover:bg-red-50"
            )}
            title="Apaga todos os lançamentos deste cedente (no programa atual)"
          >
            Zerar cedente (programa)
          </button>

          <button
            onClick={clearAllProgram}
            className="h-9 rounded-xl border border-red-200 bg-white px-3 text-sm text-red-700 shadow-sm hover:bg-red-50"
            title="Apaga todos os lançamentos do programa atual (todos os cedentes)"
          >
            Zerar programa (todos)
          </button>

          <button
            onClick={clearSelected}
            disabled={!cedenteId || selectedCount === 0}
            className={cn(
              "h-9 rounded-xl border px-3 text-sm shadow-sm",
              !cedenteId || selectedCount === 0
                ? "cursor-not-allowed border-zinc-200 bg-zinc-100 text-zinc-400"
                : "border-red-200 bg-white text-red-700 hover:bg-red-50"
            )}
            title="Apaga apenas os lançamentos selecionados"
          >
            Apagar selecionados {selectedCount ? `(${selectedCount})` : ""}
          </button>
        </div>

        <div className="mt-2 text-xs text-zinc-500">
          * Vai pedir apenas confirmação. “Zerar cedente” apaga apenas do programa atual.
        </div>
      </div>

      {/* Create */}
      <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-base font-semibold">Novo lançamento</h2>

        <div className="grid gap-3 md:grid-cols-6">
          <div className="md:col-span-2">
            <label className="mb-1 block text-xs text-zinc-600">Passageiros</label>
            <input
              type="number"
              min={1}
              value={passengersCount}
              onChange={(e) => setPassengersCount(Number(e.target.value))}
              className="h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm shadow-sm outline-none focus:border-zinc-300"
            />
          </div>

          <div className="md:col-span-4">
            <label className="mb-1 block text-xs text-zinc-600">Observação</label>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Ex.: venda #123 / ajuste manual"
              className="h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm shadow-sm outline-none focus:border-zinc-300"
            />
          </div>

          <div className="md:col-span-6">
            <button
              onClick={createEmission}
              className="h-10 rounded-xl bg-zinc-900 px-4 text-sm font-medium text-white shadow-sm hover:bg-zinc-800"
            >
              Lançar
            </button>
          </div>
        </div>
      </div>

      {/* List */}
      <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold">Últimos lançamentos</h2>
          <button
            onClick={refreshAll}
            className="h-9 rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-700 shadow-sm hover:bg-zinc-50"
          >
            Atualizar
          </button>
        </div>

        {!cedenteId ? (
          <div className="text-sm text-zinc-600">Selecione um cedente para listar os lançamentos.</div>
        ) : listLoading ? (
          <div className="text-sm text-zinc-600">Carregando…</div>
        ) : rows.length === 0 ? (
          <div className="text-sm text-zinc-600">Nenhum lançamento ainda.</div>
        ) : (
          <div className="overflow-auto">
            <table className="w-full min-w-[980px] border-separate border-spacing-0">
              <thead>
                <tr className="text-left text-xs text-zinc-500">
                  <th className="border-b border-zinc-200 p-2">
                    <input
                      type="checkbox"
                      checked={allVisibleSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = !allVisibleSelected && someVisibleSelected;
                      }}
                      onChange={(e) => toggleAllVisible(e.target.checked)}
                      title="Selecionar todos os visíveis"
                    />
                  </th>
                  <th className="border-b border-zinc-200 p-2">Data emissão</th>
                  <th className="border-b border-zinc-200 p-2">Pax</th>
                  <th className="border-b border-zinc-200 p-2">Origem</th>
                  <th className="border-b border-zinc-200 p-2">Obs.</th>
                  <th className="border-b border-zinc-200 p-2">Criado</th>
                  <th className="border-b border-zinc-200 p-2 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const isEditing = editingId === r.id;
                  const checked = Boolean(selectedIds[r.id]);
                  return (
                    <tr key={r.id} className="text-sm">
                      <td className="border-b border-zinc-100 p-2">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => toggleRow(r.id, e.target.checked)}
                        />
                      </td>

                      <td className="border-b border-zinc-100 p-2 font-medium">
                        {isEditing ? (
                          <input
                            type="date"
                            value={editIssuedDate}
                            onChange={(e) => setEditIssuedDate(e.target.value)}
                            className="h-9 rounded-lg border border-zinc-200 bg-white px-2 text-sm shadow-sm outline-none focus:border-zinc-300"
                          />
                        ) : (
                          fmtDateBR(r.issuedAt)
                        )}
                      </td>

                      <td className="border-b border-zinc-100 p-2">
                        {isEditing ? (
                          <input
                            type="number"
                            min={1}
                            value={editPassengers}
                            onChange={(e) => setEditPassengers(Number(e.target.value))}
                            className="h-9 w-24 rounded-lg border border-zinc-200 bg-white px-2 text-sm shadow-sm outline-none focus:border-zinc-300"
                          />
                        ) : (
                          r.passengersCount
                        )}
                      </td>

                      <td className="border-b border-zinc-100 p-2">
                        <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-xs">
                          {r.source}
                        </span>
                      </td>

                      <td className="border-b border-zinc-100 p-2">
                        {isEditing ? (
                          <input
                            value={editNote}
                            onChange={(e) => setEditNote(e.target.value)}
                            className="h-9 w-full rounded-lg border border-zinc-200 bg-white px-2 text-sm shadow-sm outline-none focus:border-zinc-300"
                          />
                        ) : (
                          <span className="text-zinc-700">{r.note || "—"}</span>
                        )}
                      </td>

                      <td className="border-b border-zinc-100 p-2 text-zinc-600">{fmtDateBR(r.createdAt)}</td>

                      <td className="border-b border-zinc-100 p-2">
                        <div className="flex justify-end gap-2">
                          {isEditing ? (
                            <>
                              <button
                                onClick={() => saveEdit(r.id)}
                                className="h-9 rounded-lg bg-zinc-900 px-3 text-xs font-medium text-white hover:bg-zinc-800"
                              >
                                Salvar
                              </button>
                              <button
                                onClick={cancelEdit}
                                className="h-9 rounded-lg border border-zinc-200 bg-white px-3 text-xs text-zinc-700 hover:bg-zinc-50"
                              >
                                Cancelar
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                onClick={() => startEdit(r)}
                                className="h-9 rounded-lg border border-zinc-200 bg-white px-3 text-xs text-zinc-700 hover:bg-zinc-50"
                              >
                                Editar
                              </button>
                              <button
                                onClick={() => deleteEmission(r.id)}
                                className="h-9 rounded-lg border border-red-200 bg-white px-3 text-xs text-red-700 hover:bg-red-50"
                              >
                                Excluir
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {selectedCount > 0 ? (
              <div className="mt-2 text-xs text-zinc-500">
                Selecionados: <span className="font-medium text-zinc-700">{selectedCount}</span>
              </div>
            ) : null}
          </div>
        )}
      </div>

      <div className="text-xs text-zinc-500">
        URL direta:
        <span className="ml-1 rounded bg-zinc-100 px-1 py-0.5">
          /dashboard/emissoes?programa=latam&amp;cedenteId=...
        </span>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  strong,
  warn,
}: {
  label: string;
  value: string;
  strong?: boolean;
  warn?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border p-3",
        warn ? "border-amber-200 bg-amber-50" : "border-zinc-200 bg-white"
      )}
    >
      <div className="text-xs text-zinc-500">{label}</div>
      <div className={cn("text-lg", strong && "font-semibold")}>{value}</div>
    </div>
  );
}
