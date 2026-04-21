"use client";

import { useEffect, useMemo, useState } from "react";

type Program = "LATAM" | "SMILES" | "LIVELO" | "ESFERA";
type ProtocolStatus = "DRAFT" | "SENT" | "WAITING" | "RESOLVED" | "DENIED";

type CedenteMini = {
  id: string;
  identificador: string;
  nomeCompleto: string;
  cpf: string;
};

type ProtocolRow = {
  id: string;
  program: Program;
  status: ProtocolStatus;
  title: string;
  complaint: string;
  response: string | null;
  cedenteId: string;
  createdAt: string;
  updatedAt: string;

  // ✅ para lista “abertos” (sem cedente selecionado)
  cedente?: { id: string; identificador: string; nomeCompleto: string } | null;
};

function fmtDate(iso: string) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR") + " " + d.toLocaleTimeString("pt-BR").slice(0, 5);
}

function StatusBadge({ status }: { status: ProtocolStatus }) {
  const meta = {
    DRAFT: { label: "Rascunho", cls: "bg-slate-100 text-slate-700 border-slate-200" },
    SENT: { label: "Enviado", cls: "bg-blue-50 text-blue-700 border-blue-200" },
    WAITING: { label: "Aguardando", cls: "bg-amber-50 text-amber-800 border-amber-200" },
    RESOLVED: { label: "Resolvido", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
    DENIED: { label: "Negado", cls: "bg-rose-50 text-rose-700 border-rose-200" },
  }[status];

  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${meta.cls}`}>
      {meta.label}
    </span>
  );
}

async function jget<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.ok) throw new Error(json?.error || "Falha");
  return json as T;
}

async function jpost<T>(url: string, body: any): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.ok) throw new Error(json?.error || "Falha");
  return json as T;
}

async function jpatch<T>(url: string, body: any): Promise<T> {
  const res = await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.ok) throw new Error(json?.error || "Falha");
  return json as T;
}

export default function ProtocolosProgramClient({ program }: { program: Program }) {
  const [cedentes, setCedentes] = useState<CedenteMini[]>([]);
  const [selectedCedenteId, setSelectedCedenteId] = useState<string>("");

  // ✅ lista do painel (pode ser “abertos do programa” ou “do cedente”)
  const [protocols, setProtocols] = useState<ProtocolRow[]>([]);
  const [loadingProtocols, setLoadingProtocols] = useState(false);

  const [selectedId, setSelectedId] = useState<string>("");
  const [selected, setSelected] = useState<ProtocolRow | null>(null);

  const [editorTitle, setEditorTitle] = useState("");
  const [editorStatus, setEditorStatus] = useState<ProtocolStatus>("DRAFT");
  const [editorComplaint, setEditorComplaint] = useState("");
  const [editorResponse, setEditorResponse] = useState("");

  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);

  const selectedCedente = useMemo(
    () => cedentes.find((c) => c.id === selectedCedenteId) || null,
    [cedentes, selectedCedenteId]
  );

  function showOk(msg: string) {
    setToast({ kind: "ok", msg });
    setTimeout(() => setToast(null), 2500);
  }
  function showErr(msg: string) {
    setToast({ kind: "err", msg });
    setTimeout(() => setToast(null), 4000);
  }

  async function loadCedentes() {
    const data = await jget<{ ok: true; rows: CedenteMini[] }>("/api/cedentes/mini");
    setCedentes(data.rows || []);
  }

  // ✅ NOVO: carrega “abertos do programa” (sem precisar selecionar cedente)
  async function loadOpenProtocols() {
    setLoadingProtocols(true);
    try {
      const data = await jget<{ ok: true; rows: ProtocolRow[] }>(
        `/api/protocolos?program=${encodeURIComponent(program)}&onlyOpen=1`
      );
      setProtocols(data.rows || []);
    } finally {
      setLoadingProtocols(false);
    }
  }

  async function loadProtocolsByCedente(cedenteId: string) {
    setLoadingProtocols(true);
    try {
      const data = await jget<{ ok: true; rows: ProtocolRow[] }>(
        `/api/protocolos?program=${encodeURIComponent(program)}&cedenteId=${encodeURIComponent(
          cedenteId
        )}`
      );
      setProtocols(data.rows || []);
    } finally {
      setLoadingProtocols(false);
    }
  }

  async function loadSelectedProtocol(id: string) {
    const data = await jget<{ ok: true; row: ProtocolRow }>(`/api/protocolos/${id}`);
    setSelected(data.row);
    setEditorTitle(data.row.title || "");
    setEditorStatus(data.row.status || "DRAFT");
    setEditorComplaint(data.row.complaint || "");
    setEditorResponse(data.row.response || "");
  }

  // ✅ bootstrap
  useEffect(() => {
    loadCedentes().catch((e) => showErr(e?.message || "Falha ao carregar cedentes"));
    loadOpenProtocols().catch((e) => showErr(e?.message || "Falha ao carregar protocolos abertos"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [program]);

  // ✅ quando muda cedente: lista vira “do cedente”; se limpar cedente: volta para “abertos”
  useEffect(() => {
    setSelectedId("");
    setSelected(null);
    setEditorTitle("");
    setEditorStatus("DRAFT");
    setEditorComplaint("");
    setEditorResponse("");

    if (!selectedCedenteId) {
      loadOpenProtocols().catch((e) => showErr(e?.message || "Falha ao carregar abertos"));
      return;
    }
    loadProtocolsByCedente(selectedCedenteId).catch((e) => showErr(e?.message || "Falha ao listar"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCedenteId]);

  async function createNewProtocol() {
    if (!selectedCedenteId) {
      showErr("Selecione um cedente para criar um protocolo.");
      return;
    }
    setSaving(true);
    try {
      const data = await jpost<{ ok: true; row: { id: string } }>("/api/protocolos", {
        program,
        cedenteId: selectedCedenteId,
        title: "Novo protocolo",
        complaint: "",
        status: "DRAFT",
      });

      showOk("Protocolo criado.");
      await loadProtocolsByCedente(selectedCedenteId);

      setSelectedId(data.row.id);
      await loadSelectedProtocol(data.row.id);
    } catch (e: any) {
      showErr(e?.message || "Falha ao criar protocolo");
    } finally {
      setSaving(false);
    }
  }

  async function saveSelected() {
    if (!selectedId) return;
    setSaving(true);
    try {
      await jpatch<{ ok: true; row: any }>(`/api/protocolos/${selectedId}`, {
        title: editorTitle,
        status: editorStatus,
        complaint: editorComplaint,
        response: editorResponse,
      });

      showOk("Salvo.");
      // ✅ atualiza lista atual
      if (selectedCedenteId) {
        await loadProtocolsByCedente(selectedCedenteId);
      } else {
        await loadOpenProtocols();
      }
      await loadSelectedProtocol(selectedId);
    } catch (e: any) {
      showErr(e?.message || "Falha ao salvar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      {toast ? (
        <div
          className={`rounded-md border px-3 py-2 text-sm ${
            toast.kind === "ok"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-rose-200 bg-rose-50 text-rose-800"
          }`}
        >
          {toast.msg}
        </div>
      ) : null}

      <div className="rounded-lg border bg-white p-4">
        <div className="text-sm font-medium text-slate-900 mb-2">Selecionar cedente</div>
        <select
          className="w-full rounded-md border px-3 py-2 text-sm"
          value={selectedCedenteId}
          onChange={(e) => setSelectedCedenteId(e.target.value)}
        >
          <option value="">Selecione...</option>
          {cedentes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nomeCompleto} — {c.identificador}
            </option>
          ))}
        </select>

        <div className="mt-2 text-xs text-slate-500">
          {selectedCedente
            ? `Cedente selecionado: ${selectedCedente.nomeCompleto} (${selectedCedente.identificador})`
            : "Sem cedente selecionado: mostrando protocolos abertos deste programa."}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* LISTA */}
        <div className="rounded-lg border bg-white">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <div className="text-sm font-medium text-slate-900">
              Protocolos ({loadingProtocols ? "..." : protocols.length})
            </div>

            <div className="flex items-center gap-2">
              {!selectedCedenteId ? (
                <button
                  type="button"
                  className="rounded-md border px-3 py-1.5 text-sm hover:bg-slate-50"
                  onClick={() => loadOpenProtocols().catch((e) => showErr(e?.message || "Falha"))}
                >
                  Atualizar abertos
                </button>
              ) : null}

              <button
                type="button"
                className="rounded-md border px-3 py-1.5 text-sm hover:bg-slate-50"
                onClick={createNewProtocol}
                disabled={saving}
              >
                Novo protocolo
              </button>
            </div>
          </div>

          <div className="p-2">
            {loadingProtocols ? (
              <div className="p-3 text-sm text-slate-500">Carregando...</div>
            ) : protocols.length === 0 ? (
              <div className="p-3 text-sm text-slate-500">
                {selectedCedenteId
                  ? "Nenhum protocolo para este cedente."
                  : "Nenhum protocolo aberto para este programa."}
              </div>
            ) : (
              <div className="space-y-2">
                {protocols.map((row) => {
                  const active = row.id === selectedId;
                  return (
                    <button
                      key={row.id}
                      type="button"
                      onClick={async () => {
                        setSelectedId(row.id);
                        try {
                          await loadSelectedProtocol(row.id);
                        } catch (e: any) {
                          showErr(e?.message || "Falha ao abrir protocolo");
                        }
                      }}
                      className={`w-full rounded-md border p-3 text-left hover:bg-slate-50 ${
                        active ? "border-slate-900" : "border-slate-200"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-slate-900">
                            {row.title || "(sem título)"}
                          </div>

                          {/* ✅ mostra o cedente quando estiver na lista “abertos do programa” */}
                          <div className="mt-1 text-xs text-slate-500">
                            {row.cedente?.nomeCompleto
                              ? `${row.cedente.nomeCompleto} — ${row.cedente.identificador}`
                              : selectedCedente?.nomeCompleto
                              ? `${selectedCedente.nomeCompleto} — ${selectedCedente.identificador}`
                              : `Cedente: ${row.cedenteId}`}
                            {" • "}
                            {fmtDate(row.updatedAt || row.createdAt)}
                          </div>
                        </div>

                        <StatusBadge status={row.status} />
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* EDITOR */}
        <div className="rounded-lg border bg-white">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <div className="text-sm font-medium text-slate-900">Editor do protocolo</div>
            <button
              type="button"
              className="rounded-md border px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-60"
              disabled={!selectedId || saving}
              onClick={saveSelected}
            >
              {saving ? "Salvando..." : "Salvar"}
            </button>
          </div>

          {!selectedId ? (
            <div className="p-4 text-sm text-slate-500">Selecione um protocolo na lista.</div>
          ) : (
            <div className="p-4 space-y-3">
              <div className="grid grid-cols-1 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Título</label>
                  <input
                    className="w-full rounded-md border px-3 py-2 text-sm"
                    value={editorTitle}
                    onChange={(e) => setEditorTitle(e.target.value)}
                    maxLength={120}
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Status</label>
                  <select
                    className="w-full rounded-md border px-3 py-2 text-sm"
                    value={editorStatus}
                    onChange={(e) => setEditorStatus(e.target.value as ProtocolStatus)}
                  >
                    <option value="DRAFT">Rascunho</option>
                    <option value="SENT">Enviado</option>
                    <option value="WAITING">Aguardando</option>
                    <option value="RESOLVED">Resolvido</option>
                    <option value="DENIED">Negado</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Reclamação (pode ser grande)
                  </label>
                  <textarea
                    className="w-full rounded-md border px-3 py-2 text-sm"
                    value={editorComplaint}
                    onChange={(e) => setEditorComplaint(e.target.value)}
                    rows={10}
                    style={{ minHeight: 200 }}
                    placeholder="Descreva detalhadamente a reclamação…"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Resposta da CIA (pode ser grande)
                  </label>
                  <textarea
                    className="w-full rounded-md border px-3 py-2 text-sm"
                    value={editorResponse}
                    onChange={(e) => setEditorResponse(e.target.value)}
                    rows={8}
                    style={{ minHeight: 160 }}
                    placeholder="Cole aqui o retorno/resposta da CIA…"
                  />
                </div>

                {selected ? (
                  <div className="pt-2 text-xs text-slate-500">
                    Criado em {fmtDate(selected.createdAt)} • Atualizado em {fmtDate(selected.updatedAt)}
                  </div>
                ) : null}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
