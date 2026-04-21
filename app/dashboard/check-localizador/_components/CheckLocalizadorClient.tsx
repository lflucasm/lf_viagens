"use client";

import { useEffect, useMemo, useState } from "react";

type Mode = "latam" | "smiles";
type LatamManualStatus = "CANCELADO" | "CONFIRMADO" | "ALTERADO";
type SmilesManualStatus = "" | "CONFIRMADO" | "DERRUBADO";

type RowBase = {
  id: string;
  numero: string;
  locator: string | null;
  firstPassengerLastName: string | null;
  departureDate: string | null;
  returnDate: string | null;
  createdAt: string;
  cedente: { identificador: string; nomeCompleto: string };
  checkUrl?: string;
  latamLocatorCheckStatus?: string | null;
  latamLocatorCheckedAt?: string | null;
  latamLocatorCheckNote?: string | null;
  smilesLocatorManualStatus?: string | null;
  smilesLocatorManualCheckedAt?: string | null;
  smilesLocatorLossCents?: number;
};

type LatamRow = RowBase & {
  purchaseCode: string | null;
};

type SmilesRow = RowBase & {
  departureAirportIata: string | null;
};

function fmtDateBR(v?: string | null) {
  if (!v) return "-";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("pt-BR");
}

function parseDateMs(v?: string | null) {
  if (!v) return null;
  const dt = new Date(v);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.getTime();
}

function nextFlightLabel(v1?: string | null, v2?: string | null) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayMs = today.getTime();

  const items = [
    { label: "Ida", v: v1 },
    { label: "Volta", v: v2 },
  ]
    .map((x) => {
      const dt = x.v ? new Date(x.v) : null;
      return dt && !Number.isNaN(dt.getTime()) ? { label: x.label, ms: dt.getTime() } : null;
    })
    .filter((x): x is { label: string; ms: number } => x != null);

  if (!items.length) return "-";

  const upcoming = items.filter((x) => x.ms >= todayMs);
  const chosen = upcoming.length
    ? upcoming.sort((a, b) => a.ms - b.ms)[0]
    : items.sort((a, b) => Math.abs(a.ms - todayMs) - Math.abs(b.ms - todayMs))[0];

  return `${chosen.label} (${new Date(chosen.ms).toLocaleDateString("pt-BR")})`;
}

function statusLabel(v?: string | null) {
  if (!v) return "Não definido";
  if (v === "CONFIRMADO") return "Confirmado";
  if (v === "CANCELADO") return "Cancelado";
  if (v === "ALTERADO") return "Alterado";
  return v;
}

function statusClass(v?: string | null) {
  if (v === "CONFIRMADO") return "text-emerald-700";
  if (v === "ALTERADO") return "text-amber-600";
  if (v === "CANCELADO") return "text-rose-700";
  return "text-slate-700";
}

function smilesManualStatusLabel(v?: string | null) {
  if (v === "CONFIRMADO") return "Confirmado";
  if (v === "DERRUBADO") return "Derrubado";
  return "Não marcado";
}

function smilesManualStatusClass(v?: string | null) {
  if (v === "CONFIRMADO") return "bg-emerald-100 text-emerald-700 border-emerald-200";
  if (v === "DERRUBADO") return "bg-rose-100 text-rose-700 border-rose-200";
  return "bg-slate-100 text-slate-600 border-slate-200";
}

function fmtMoneyBR(cents?: number | null) {
  const v = Number(cents || 0) / 100;
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function parseMoneyToCents(input: string) {
  const normalized = String(input || "")
    .trim()
    .replace(/\s/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const n = Number(normalized);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n * 100);
}

type SmilesFlightStatus = {
  label: string;
  hint?: string;
  textClass: string;
  badgeClass: string;
};

const FORTY_EIGHT_HOURS_MS = 48 * 60 * 60 * 1000;

function getSmilesFlightStatus(
  departureDate?: string | null,
  returnDate?: string | null
): SmilesFlightStatus {
  const nowMs = Date.now();

  const segments = [departureDate, returnDate]
    .map((v) => parseDateMs(v))
    .filter((x): x is number => x != null)
    .sort((a, b) => a - b);

  if (!segments.length) {
    return {
      label: "Sem data",
      textClass: "text-slate-700",
      badgeClass: "bg-slate-100 text-slate-700 border-slate-200",
    };
  }

  const pastCount = segments.filter((ms) => ms < nowMs).length;
  const upcoming = segments.filter((ms) => ms >= nowMs);

  if (!upcoming.length) {
    return {
      label: "Trechos voados",
      hint: "Tudo concluído",
      textClass: "text-emerald-700",
      badgeClass: "bg-emerald-100 text-emerald-700 border-emerald-200",
    };
  }

  const nextDiff = upcoming[0] - nowMs;
  if (nextDiff <= FORTY_EIGHT_HOURS_MS) {
    return {
      label: "Voo em até 48h",
      hint: "Checagem prioritária",
      textClass: "text-sky-700",
      badgeClass: "bg-sky-100 text-sky-700 border-sky-200",
    };
  }

  if (segments.length >= 2 && pastCount === 1) {
    return {
      label: "Ida voada",
      hint: "Aguardando volta",
      textClass: "text-amber-700",
      badgeClass: "bg-amber-100 text-amber-700 border-amber-200",
    };
  }

  return {
    label: "Aguardando voo",
    hint: "Fora da janela de 48h",
    textClass: "text-slate-700",
    badgeClass: "bg-slate-100 text-slate-700 border-slate-200",
  };
}

export default function CheckLocalizadorClient({ mode }: { mode: Mode }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [rows, setRows] = useState<Array<LatamRow | SmilesRow>>([]);
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");

    fetch(`/api/check-localizador/${mode}`, {
      cache: "no-store",
      credentials: "include",
    })
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (!r.ok || j?.ok === false) throw new Error(j?.error || `Erro ${r.status}`);
        if (!active) return;
        setRows(Array.isArray(j?.rows) ? j.rows : []);
      })
      .catch((e: unknown) => {
        if (!active) return;
        setRows([]);
        const msg =
          e instanceof Error && e.message ? e.message : "Erro ao carregar dados.";
        setError(msg);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [mode]);

  const title = useMemo(
    () => (mode === "latam" ? "Check Localizador - Latam" : "Check Localizador - Smiles"),
    [mode]
  );
  const totalCols = mode === "latam" ? 9 : 9;

  async function updateManualStatus(saleId: string, status: LatamManualStatus) {
    setSavingId(saleId);
    try {
      const res = await fetch("/api/check-localizador/latam", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ saleId, status }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j?.ok === false) {
        throw new Error(j?.error || `Erro ${res.status}`);
      }

      const row = j?.row || null;
      if (row?.id) {
        setRows((prev) =>
          prev.map((r) =>
            r.id === row.id
              ? {
                  ...r,
                  latamLocatorCheckStatus: row.latamLocatorCheckStatus || null,
                  latamLocatorCheckedAt: row.latamLocatorCheckedAt || null,
                  latamLocatorCheckNote: row.latamLocatorCheckNote || null,
                }
              : r
          )
        );
      }
    } catch (e: unknown) {
      const msg =
        e instanceof Error && e.message ? e.message : "Falha ao atualizar status.";
      alert(msg);
    } finally {
      setSavingId(null);
    }
  }

  async function updateSmilesManualCheck(
    saleId: string,
    status: SmilesManualStatus,
    lossCents = 0
  ) {
    setSavingId(saleId);
    try {
      const res = await fetch("/api/check-localizador/smiles", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ saleId, status, lossCents }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j?.ok === false) {
        throw new Error(j?.error || `Erro ${res.status}`);
      }

      const row = j?.row || null;
      if (row?.id) {
        setRows((prev) =>
          prev.map((r) =>
            r.id === row.id
              ? {
                  ...r,
                  smilesLocatorManualStatus: row.smilesLocatorManualStatus || null,
                  smilesLocatorManualCheckedAt: row.smilesLocatorManualCheckedAt || null,
                  smilesLocatorLossCents: Number(row.smilesLocatorLossCents || 0),
                }
              : r
          )
        );
      }
    } catch (e: unknown) {
      const msg =
        e instanceof Error && e.message ? e.message : "Falha ao atualizar check manual.";
      alert(msg);
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">{title}</h1>
        <p className="text-sm text-slate-500">
          Ordenado por proximidade do próximo voo (ida ou volta).
        </p>
        {mode === "smiles" ? (
          <p className="text-xs text-slate-500 mt-1">
            Azul: próximo trecho em até 48h • Amarelo: ida já voada e aguardando volta • Verde:
            trechos voados
          </p>
        ) : null}
      </div>

      {error ? <div className="text-sm text-rose-600">{error}</div> : null}

      <div className="rounded-2xl border bg-white overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b text-slate-600">
            <tr>
              <th className="px-3 py-2 text-left">Próximo voo</th>
              {mode === "latam" ? <th className="px-3 py-2 text-left">Código compra</th> : null}
              <th className="px-3 py-2 text-left">Localizador</th>
              <th className="px-3 py-2 text-left">Sobrenome</th>
              {mode === "smiles" ? <th className="px-3 py-2 text-left">Aeroporto ida</th> : null}
              <th className="px-3 py-2 text-left">Data ida</th>
              <th className="px-3 py-2 text-left">Data volta</th>
              <th className="px-3 py-2 text-left">Cedente</th>
              {mode === "latam" ? <th className="px-3 py-2 text-left">Status</th> : null}
              {mode === "smiles" ? <th className="px-3 py-2 text-left">Status voo</th> : null}
              {mode === "smiles" ? <th className="px-3 py-2 text-left">Check manual</th> : null}
              {mode === "latam" ? <th className="px-3 py-2 text-left">Ação</th> : null}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="px-3 py-6 text-slate-500" colSpan={totalCols}>
                  Carregando...
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td className="px-3 py-6 text-slate-500" colSpan={totalCols}>
                  Nenhum registro encontrado.
                </td>
              </tr>
            ) : (
              rows.map((r) => {
                const smilesFlightStatus =
                  mode === "smiles"
                    ? getSmilesFlightStatus(r.departureDate, r.returnDate)
                    : null;

                const smilesManualRowClass =
                  mode === "smiles" && r.smilesLocatorManualStatus === "DERRUBADO"
                    ? "bg-rose-50/70"
                    : "";

                return (
                <tr key={r.id} className={`border-b last:border-b-0 ${smilesManualRowClass}`}>
                  <td className="px-3 py-2">{nextFlightLabel(r.departureDate, r.returnDate)}</td>
                  {mode === "latam" ? (
                    <td className="px-3 py-2 font-mono">{(r as LatamRow).purchaseCode || "-"}</td>
                  ) : null}
                  <td className="px-3 py-2 font-mono">{r.locator || "-"}</td>
                  <td className="px-3 py-2">{r.firstPassengerLastName || "-"}</td>
                  {mode === "smiles" ? (
                    <td className="px-3 py-2 font-mono">{(r as SmilesRow).departureAirportIata || "-"}</td>
                  ) : null}
                  <td className="px-3 py-2">{fmtDateBR(r.departureDate)}</td>
                  <td className="px-3 py-2">{fmtDateBR(r.returnDate)}</td>
                  <td className="px-3 py-2">
                    <div className="font-medium">{r.cedente?.nomeCompleto || "-"}</div>
                    <div className="text-xs text-slate-500">{r.cedente?.identificador || "-"}</div>
                  </td>
                  {mode === "smiles" && smilesFlightStatus ? (
                    <td className="px-3 py-2">
                      <div
                        className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${smilesFlightStatus.badgeClass}`}
                      >
                        {smilesFlightStatus.label}
                      </div>
                      {smilesFlightStatus.hint ? (
                        <div className={`mt-1 text-xs ${smilesFlightStatus.textClass}`}>
                          {smilesFlightStatus.hint}
                        </div>
                      ) : null}
                    </td>
                  ) : null}
                  {mode === "smiles" ? (
                    <td className="px-3 py-2">
                      <div className="space-y-2">
                        <select
                          className={`rounded-lg border px-2 py-1 text-xs bg-white min-w-[140px] ${
                            r.smilesLocatorManualStatus === "DERRUBADO"
                              ? "border-rose-300 text-rose-700 bg-rose-50"
                              : r.smilesLocatorManualStatus === "CONFIRMADO"
                                ? "border-emerald-300 text-emerald-700 bg-emerald-50"
                                : "border-slate-300 text-slate-700"
                          }`}
                          value={(r.smilesLocatorManualStatus || "") as string}
                          disabled={savingId === r.id}
                          onChange={(e) => {
                            const next = String(e.target.value || "") as SmilesManualStatus;
                            if (next === "DERRUBADO") {
                              const suggested = r.smilesLocatorLossCents
                                ? String((r.smilesLocatorLossCents / 100).toFixed(2)).replace(".", ",")
                                : "";
                              const raw = window.prompt(
                                "Qual o valor do prejuízo (R$) para lançar no prejuízo e abater nos impostos?",
                                suggested
                              );
                              if (raw === null) return;
                              const parsed = parseMoneyToCents(raw);
                              if (parsed <= 0) {
                                window.alert("Informe um valor de prejuízo maior que zero.");
                                return;
                              }
                              updateSmilesManualCheck(r.id, "DERRUBADO", parsed);
                              return;
                            }

                            updateSmilesManualCheck(r.id, next, 0);
                          }}
                        >
                          <option value="">Não marcado</option>
                          <option value="CONFIRMADO">Confirmado</option>
                          <option value="DERRUBADO">Derrubado</option>
                        </select>
                        {r.smilesLocatorManualStatus === "DERRUBADO" &&
                        Number(r.smilesLocatorLossCents || 0) > 0 ? (
                          <div className="text-xs font-medium text-rose-700">
                            Prejuízo: {fmtMoneyBR(r.smilesLocatorLossCents || 0)}
                          </div>
                        ) : null}
                      </div>
                    </td>
                  ) : null}
                  {mode === "latam" ? (
                    <td className="px-3 py-2">
                      <div className={`font-medium ${statusClass(r.latamLocatorCheckStatus)}`}>
                        {statusLabel(r.latamLocatorCheckStatus)}
                      </div>
                      <div className="text-xs text-slate-500">
                        {fmtDateBR(r.latamLocatorCheckedAt)}
                      </div>
                      {r.latamLocatorCheckNote ? (
                        <div className="text-xs text-slate-500 mt-1 max-w-[280px] break-words">
                          {r.latamLocatorCheckNote}
                        </div>
                      ) : null}
                    </td>
                  ) : null}
                  {mode === "latam" ? (
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-2 items-center">
                        <a
                          href={r.checkUrl || "#"}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-lg border px-2 py-1 text-xs hover:bg-slate-50"
                        >
                          Abrir LATAM
                        </a>
                        <select
                          className="rounded-lg border px-2 py-1 text-xs bg-white"
                          value={(r.latamLocatorCheckStatus || "") as string}
                          disabled={savingId === r.id}
                          onChange={(e) => {
                            const v = String(e.target.value || "") as LatamManualStatus;
                            if (!v) return;
                            updateManualStatus(r.id, v);
                          }}
                        >
                          <option value="">Selecionar...</option>
                          <option value="CANCELADO">Cancelado</option>
                          <option value="CONFIRMADO">Confirmado</option>
                          <option value="ALTERADO">Alterado</option>
                        </select>
                      </div>
                    </td>
                  ) : null}
                </tr>
              );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
