"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type Program = "LATAM" | "SMILES" | "LIVELO" | "ESFERA";

type Cedente = {
  id: string;
  identificador: string;
  nomeCompleto: string;
  cpf: string;
};

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    cache: "no-store",
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  const text = await res.text().catch(() => "");
  let data: Record<string, unknown> = {};
  try {
    data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    data = {};
  }
  if (!res.ok || data?.ok === false) {
    throw new Error(String(data?.error || `Erro ${res.status}`));
  }
  return data as T;
}

function norm(v?: string) {
  return (v || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function onlyDigits(v?: string) {
  return (v || "").replace(/\D+/g, "");
}

function fmtMoneyBR(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const ORIGEM: Program[] = ["LIVELO", "ESFERA"];
const DESTINO: Program[] = ["LATAM", "SMILES"];

export default function TransferirPontosClient() {
  const [query, setQuery] = useState("");
  const [all, setAll] = useState<Cedente[]>([]);
  const [loading, setLoading] = useState(false);
  const [cedenteSel, setCedenteSel] = useState<Cedente | null>(null);

  const [from, setFrom] = useState<Program>("LIVELO");
  const [to, setTo] = useState<Program>("LATAM");
  const [points, setPoints] = useState(0);
  const [bonusPoints, setBonusPoints] = useState(0);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const [milheiros, setMilheiros] = useState<
    Record<string, { avgMilheiroCents: number; cedentePoints: number }>
  >({});

  useEffect(() => {
    let a = true;
    (async () => {
      setLoading(true);
      try {
        const out = await api<{ data: Cedente[] }>("/api/cedentes/approved");
        if (a) setAll(Array.isArray(out?.data) ? out.data : []);
      } catch {
        if (a) setAll([]);
      } finally {
        if (a) setLoading(false);
      }
    })();
    return () => {
      a = false;
    };
  }, []);

  useEffect(() => {
    if (!cedenteSel?.id) {
      setMilheiros({});
      return;
    }
    let a = true;
    (async () => {
      try {
        const out = await api<{
          items: Array<{
            program: Program;
            avgMilheiroCents: number;
            cedentePoints: number;
          }>;
        }>(`/api/cedentes/${cedenteSel.id}/program-inventory`);
        if (!a) return;
        const m: Record<string, { avgMilheiroCents: number; cedentePoints: number }> = {};
        for (const it of out.items || []) {
          m[it.program] = {
            avgMilheiroCents: it.avgMilheiroCents,
            cedentePoints: it.cedentePoints,
          };
        }
        setMilheiros(m);
      } catch {
        if (a) setMilheiros({});
      }
    })();
    return () => {
      a = false;
    };
  }, [cedenteSel?.id]);

  const filtrados = useMemo(() => {
    const s = norm(query);
    if (s.length < 2) return [];
    const dig = onlyDigits(query);
    return all
      .filter((c) => {
        const nome = norm(c.nomeCompleto);
        const id = norm(c.identificador);
        const cpf = onlyDigits(c.cpf);
        if (dig.length >= 2) {
          return cpf.includes(dig) || onlyDigits(c.identificador).includes(dig) || nome.includes(s) || id.includes(s);
        }
        return nome.includes(s) || id.includes(s);
      })
      .slice(0, 25);
  }, [all, query]);

  useEffect(() => {
    if (from === "LIVELO" || from === "ESFERA") {
      if (to !== "LATAM" && to !== "SMILES") setTo("LATAM");
    }
  }, [from, to]);

  async function submit() {
    setErr(null);
    setOkMsg(null);
    if (!cedenteSel) return setErr("Selecione o cedente.");
    if (points <= 0) return setErr("Informe os pontos a transferir.");
    setBusy(true);
    try {
      await api("/api/pontos/transferir", {
        method: "POST",
        body: JSON.stringify({
          cedenteId: cedenteSel.id,
          programFrom: from,
          programTo: to,
          points,
          bonusPoints: bonusPoints || 0,
          note: note.trim() || null,
        }),
      });
      setOkMsg("Transferência concluída.");
      setPoints(0);
      setBonusPoints(0);
      setNote("");
      const out = await api<{ data: Cedente[] }>("/api/cedentes/approved");
      setAll(Array.isArray(out?.data) ? out.data : []);
      const inv = await api<{
        items: Array<{ program: Program; avgMilheiroCents: number; cedentePoints: number }>;
      }>(`/api/cedentes/${cedenteSel.id}/program-inventory`);
      const m: Record<string, { avgMilheiroCents: number; cedentePoints: number }> = {};
      for (const it of inv.items || []) {
        m[it.program] = {
          avgMilheiroCents: it.avgMilheiroCents,
          cedentePoints: it.cedentePoints,
        };
      }
      setMilheiros(m);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Falha na transferência.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Transferir pontos</h1>
        <p className="text-sm text-gray-600">
          LIVELO ou Esfera → LATAM ou Smiles. O custo médio (milheiro) segue o inventário do cedente.
        </p>
        <Link href="/dashboard/compras/nova" className="text-sm text-blue-700 underline mt-2 inline-block">
          ← Compra / clube
        </Link>
      </div>

      <div className="rounded-xl border p-4 space-y-3">
        <h2 className="font-medium text-sm">Cedente</h2>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full rounded-md border px-3 py-2 text-sm"
          placeholder="Buscar…"
        />
        {loading && <div className="text-xs text-gray-500">Carregando…</div>}
        {query.trim().length >= 2 && filtrados.length > 0 && (
          <div className="max-h-40 overflow-auto rounded-md border">
            {filtrados.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setCedenteSel(c)}
                className={`flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-gray-50 ${
                  cedenteSel?.id === c.id ? "bg-gray-50" : ""
                }`}
              >
                <span className="font-medium">{c.nomeCompleto}</span>
                <span className="text-xs text-gray-500">{c.identificador}</span>
              </button>
            ))}
          </div>
        )}
        {cedenteSel && (
          <div className="rounded-lg bg-slate-50 p-3 text-sm">
            <div className="font-medium">{cedenteSel.nomeCompleto}</div>
            {milheiros[from] && milheiros[to] && (
              <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-gray-700">
                <div>
                  <div className="text-gray-500">Origem ({from})</div>
                  <div>Saldo: {milheiros[from].cedentePoints.toLocaleString("pt-BR")}</div>
                  <div>Milheiro: {fmtMoneyBR(milheiros[from].avgMilheiroCents)}</div>
                </div>
                <div>
                  <div className="text-gray-500">Destino ({to})</div>
                  <div>Saldo: {milheiros[to].cedentePoints.toLocaleString("pt-BR")}</div>
                  <div>Milheiro: {fmtMoneyBR(milheiros[to].avgMilheiroCents)}</div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="rounded-xl border p-4 space-y-3">
        <h2 className="font-medium text-sm">Transferência</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            <span className="text-gray-600">De</span>
            <select
              value={from}
              onChange={(e) => setFrom(e.target.value as Program)}
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
            >
              {ORIGEM.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="text-gray-600">Para</span>
            <select
              value={to}
              onChange={(e) => setTo(e.target.value as Program)}
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
            >
              {DESTINO.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="text-gray-600">Pontos</span>
            <input
              type="number"
              value={points || ""}
              onChange={(e) => setPoints(Math.max(0, Math.trunc(Number(e.target.value) || 0)))}
              className="mt-1 w-full rounded-md border px-3 py-2 font-mono text-sm"
            />
          </label>
          <label className="text-sm">
            <span className="text-gray-600">Bônus no destino (opcional)</span>
            <input
              type="number"
              value={bonusPoints || ""}
              onChange={(e) => setBonusPoints(Math.max(0, Math.trunc(Number(e.target.value) || 0)))}
              className="mt-1 w-full rounded-md border px-3 py-2 font-mono text-sm"
            />
          </label>
        </div>
        <label className="block text-sm">
          <span className="text-gray-600">Observação</span>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
          />
        </label>
        {err && <div className="text-sm text-red-600">{err}</div>}
        {okMsg && <div className="text-sm text-emerald-700">{okMsg}</div>}
        <button
          type="button"
          onClick={() => void submit()}
          disabled={busy || !cedenteSel}
          className="rounded-md bg-black px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          {busy ? "Processando…" : "Transferir"}
        </button>
      </div>
    </div>
  );
}
