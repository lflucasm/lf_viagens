"use client";

import { useEffect, useMemo, useState } from "react";

type Owner = { id: string; name: string; login?: string | null; team?: string | null };

type Item = {
  id: string;
  nomeCompleto: string;
  cpf: string;

  telefone: string | null;
  emailCriado: string | null;

  banco: string | null;
  pixTipo: string | null;
  chavePix: string | null;
  titularConfirmado: boolean | null;

  pontosLatam: number;
  pontosSmiles: number;
  pontosLivelo: number;
  pontosEsfera: number;

  createdAt: string;

  owner: Owner;
};

type PointsDraft = {
  pontosLatam: number | "";
  pontosSmiles: number | "";
  pontosLivelo: number | "";
  pontosEsfera: number | "";
};

function labelMissing(c: Item) {
  const miss: string[] = [];

  if (!c.nomeCompleto?.trim()) miss.push("Nome");
  if (!c.cpf?.trim()) miss.push("CPF");

  if (!c.telefone?.trim()) miss.push("Telefone");
  if (!c.emailCriado?.trim()) miss.push("E-mail criado");

  if (!c.banco?.trim()) miss.push("Banco");
  if (!c.chavePix?.trim()) miss.push("Chave PIX");
  if (!c.pixTipo?.trim()) miss.push("Tipo PIX");
  if (!c.titularConfirmado) miss.push("Titular não confirmado");

  // senhas (se você quiser exigir, descomente e adapte os campos no Item)
  // if (!c.senhaEmailEnc) miss.push("Senha do e-mail");

  return miss;
}

export default function CedentesPendentesPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);

  // draft de pontos por cedente (pra você preencher antes de aprovar)
  const [draft, setDraft] = useState<Record<string, PointsDraft>>({});

  const totalPendentes = useMemo(() => items.length, [items]);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/cedentes/pendentes", { cache: "no-store" });
    const json = await res.json().catch(() => null);
    const list: Item[] = json?.data?.items || [];
    setItems(list);

    // inicializa os drafts com os pontos atuais do banco (geralmente 0)
    setDraft((prev) => {
      const next = { ...prev };
      for (const c of list) {
        if (!next[c.id]) {
          next[c.id] = {
            pontosLatam: c.pontosLatam ?? 0,
            pontosSmiles: c.pontosSmiles ?? 0,
            pontosLivelo: c.pontosLivelo ?? 0,
            pontosEsfera: c.pontosEsfera ?? 0,
          };
        }
      }
      return next;
    });

    setLoading(false);
  }

  async function review(id: string, action: "APPROVE" | "REJECT") {
    const points = draft[id] || {
      pontosLatam: 0,
      pontosSmiles: 0,
      pontosLivelo: 0,
      pontosEsfera: 0,
    };

    const payload: any = { action };

    // se aprovar: manda pontos para gravar junto (e ir pra lista)
    if (action === "APPROVE") {
      payload.points = {
        pontosLatam: Number(points.pontosLatam || 0),
        pontosSmiles: Number(points.pontosSmiles || 0),
        pontosLivelo: Number(points.pontosLivelo || 0),
        pontosEsfera: Number(points.pontosEsfera || 0),
      };
    }

    const res = await fetch(`/api/cedentes/${id}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const json = await res.json().catch(() => null);
    if (!json?.ok) return alert(json?.error || "Erro ao revisar");

    await load();
  }

  function setDraftField(id: string, key: keyof PointsDraft, value: number | "") {
    setDraft((prev) => ({
      ...prev,
      [id]: {
        ...(prev[id] || { pontosLatam: "", pontosSmiles: "", pontosLivelo: "", pontosEsfera: "" }),
        [key]: value,
      },
    }));
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="max-w-5xl">
      <div className="mb-4 flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Cedentes pendentes</h1>
          <div className="text-sm text-slate-600">
            Total: <b>{totalPendentes}</b>
          </div>
        </div>

        <button
          onClick={load}
          className="rounded-xl border px-3 py-2 text-sm hover:bg-slate-50"
        >
          Atualizar
        </button>
      </div>

      {loading && <div>Carregando...</div>}

      {!loading && items.length === 0 && (
        <div className="rounded-xl border p-4 text-sm text-slate-600">Nenhum pendente 🎉</div>
      )}

      <div className="space-y-3">
        {items.map((c) => {
          const missing = labelMissing(c);
          const d = draft[c.id] || {
            pontosLatam: 0,
            pontosSmiles: 0,
            pontosLivelo: 0,
            pontosEsfera: 0,
          };

          return (
            <div key={c.id} className="rounded-2xl border p-4">
              <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                <div>
                  <div className="text-lg font-semibold">{c.nomeCompleto}</div>

                  <div className="mt-1 text-sm text-slate-600 space-y-1">
                    <div>
                      CPF: <b>{c.cpf}</b> · Telefone: <b>{c.telefone ?? "-"}</b>
                    </div>
                    <div>
                      Email: <b>{c.emailCriado ?? "-"}</b>
                    </div>
                    <div>
                      PIX: <b>{c.banco ?? "-"}</b> · <b>{c.pixTipo ?? "-"}</b> ·{" "}
                      <b>{c.chavePix ?? "-"}</b> · Titular:{" "}
                      <b>{c.titularConfirmado ? "Sim" : "Não"}</b>
                    </div>
                    <div>
                      Responsável: <b>{c.owner?.name ?? "-"}</b>
                    </div>
                    <div>
                      Criado em{" "}
                      <b>{new Date(c.createdAt).toLocaleString("pt-BR")}</b>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border bg-slate-50 p-3 text-sm min-w-[260px]">
                  <div className="font-medium mb-2">Campos faltando</div>
                  {missing.length === 0 ? (
                    <div className="text-slate-700">Nenhum ✅</div>
                  ) : (
                    <ul className="list-disc pl-5 text-slate-700">
                      {missing.map((m) => (
                        <li key={m}>{m}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              <div className="mt-4 rounded-2xl border p-4">
                <div className="mb-2 font-semibold">Pontos (preencher antes de aprovar)</div>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                  <FieldNumber
                    label="Latam"
                    value={d.pontosLatam}
                    onChange={(v) => setDraftField(c.id, "pontosLatam", v)}
                  />
                  <FieldNumber
                    label="Smiles"
                    value={d.pontosSmiles}
                    onChange={(v) => setDraftField(c.id, "pontosSmiles", v)}
                  />
                  <FieldNumber
                    label="Livelo"
                    value={d.pontosLivelo}
                    onChange={(v) => setDraftField(c.id, "pontosLivelo", v)}
                  />
                  <FieldNumber
                    label="Esfera"
                    value={d.pontosEsfera}
                    onChange={(v) => setDraftField(c.id, "pontosEsfera", v)}
                  />
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  onClick={() => review(c.id, "APPROVE")}
                  className="rounded-xl bg-black px-3 py-2 text-sm text-white hover:bg-slate-900"
                >
                  Aprovar e enviar para lista
                </button>

                <button
                  onClick={() => review(c.id, "REJECT")}
                  className="rounded-xl border px-3 py-2 text-sm hover:bg-slate-50"
                >
                  Reprovar
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FieldNumber({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | "";
  onChange: (v: number | "") => void;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm">{label}</label>
      <input
        type="number"
        min={0}
        className="w-full rounded-xl border px-3 py-2"
        value={value}
        onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
      />
    </div>
  );
}
