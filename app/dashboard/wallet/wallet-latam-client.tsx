"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/cn";

type Owner = { id: string; name: string; login: string };

type CedenteRow = {
  id: string;
  identificador: string;
  nomeCompleto: string;
  cpf: string;
  owner: Owner;

  wallet: number; // cents
  walletUpdatedAt: string | null;
};

function formatBRL(cents: number) {
  const v = (Number(cents) || 0) / 100;
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(v);
}

function parseBRLToCents(input: string) {
  // aceita: "1234", "1.234,56", "R$ 1.234,56"
  const s = String(input || "")
    .replace(/[^\d,]/g, "") // deixa dígitos e vírgula
    .trim();

  if (!s) return 0;

  const parts = s.split(",");
  const intPart = (parts[0] || "").replace(/\D/g, "");
  const decPartRaw = (parts[1] || "").replace(/\D/g, "");
  const decPart = (decPartRaw + "00").slice(0, 2); // 2 casas

  const full = `${intPart}${decPart}`.replace(/^0+/, "") || "0";
  return Number(full);
}

export default function WalletLatamClient() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<CedenteRow[]>([]);
  const [totalCents, setTotalCents] = useState(0);

  // dropdown pesquisável
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string>("");
  const [amountText, setAmountText] = useState<string>("");

  const dropdownRef = useRef<HTMLDivElement | null>(null);

  async function load() {
    setLoading(true);
    try {
      const r = await fetch("/api/wallet/latam", { cache: "no-store" });
      const j = await r.json();
      if (!j?.ok) throw new Error(j?.error || "Falha ao carregar.");
      setRows(j.rows || []);
      setTotalCents(j.totalCents || 0);
    } catch (e: any) {
      console.error(e);
      alert(e?.message || "Erro ao carregar wallet.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  // fechar dropdown clicando fora
  useEffect(() => {
    function onDocClick(ev: MouseEvent) {
      if (!open) return;
      const el = dropdownRef.current;
      if (!el) return;
      if (ev.target instanceof Node && !el.contains(ev.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const selected = useMemo(
    () => rows.find((r) => r.id === selectedId) || null,
    [rows, selectedId]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const hay = `${r.nomeCompleto} ${r.identificador} ${r.cpf}`.toLowerCase();
      return hay.includes(q);
    });
  }, [rows, query]);

  // ✅ tabela de baixo: só quem tem saldo cadastrado (> 0)
  const rowsWithValue = useMemo(() => {
    return [...rows]
      .filter((r) => (r.wallet || 0) > 0)
      .sort((a, b) => (b.wallet || 0) - (a.wallet || 0));
  }, [rows]);

  async function upsertAmount(cedenteId: string, amountCents: number) {
    const r = await fetch("/api/wallet/latam", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cedenteId, amountCents }),
    });
    const j = await r.json();
    if (!j?.ok) throw new Error(j?.error || "Falha ao salvar.");

    setRows((prev) =>
      prev.map((x) =>
        x.id === cedenteId
          ? { ...x, wallet: j.saved.amountCents, walletUpdatedAt: j.saved.updatedAt }
          : x
      )
    );
    setTotalCents(j.totalCents || 0);

    return j;
  }

  async function save() {
    if (!selectedId) return;
    const cents = parseBRLToCents(amountText);

    try {
      await upsertAmount(selectedId, cents);
      setAmountText(formatBRL(cents)); // deixa o input bonitinho
    } catch (e: any) {
      console.error(e);
      alert(e?.message || "Erro ao salvar.");
    }
  }

  async function zero(cedenteId: string) {
    const r = rows.find((x) => x.id === cedenteId);
    const label = r ? `${r.nomeCompleto} (${r.identificador})` : "este cedente";
    const ok = window.confirm(`Zerar o saldo da wallet de ${label}?`);
    if (!ok) return;

    try {
      await upsertAmount(cedenteId, 0);

      // se for o selecionado, atualiza o input
      if (selectedId === cedenteId) {
        setAmountText(formatBRL(0));
      }
    } catch (e: any) {
      console.error(e);
      alert(e?.message || "Erro ao zerar.");
    }
  }

  function pickCedente(id: string) {
    setSelectedId(id);
    const r = rows.find((x) => x.id === id);
    setAmountText(r ? formatBRL(r.wallet || 0) : "");
    setOpen(false);
    setQuery("");
  }

  function editFromTable(id: string) {
    setSelectedId(id);
    const r = rows.find((x) => x.id === id);
    setAmountText(r ? formatBRL(r.wallet || 0) : "");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div className="space-y-4">
      {/* Total */}
      <div className="rounded-2xl border bg-white p-4 shadow-sm">
        <div className="text-sm text-muted-foreground">Total na wallet (LATAM)</div>
        <div className="mt-1 text-2xl font-semibold">{formatBRL(totalCents)}</div>
      </div>

      {/* Form */}
      <div className="rounded-2xl border bg-white p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-3">
          {/* Dropdown */}
          <div className="md:col-span-2" ref={dropdownRef}>
            <label className="text-sm font-medium">Cedente LATAM</label>

            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className={cn(
                "mt-1 w-full rounded-xl border px-3 py-2 text-left",
                "hover:bg-muted/30"
              )}
            >
              {selected ? (
                <div className="flex flex-col">
                  <span className="font-medium">{selected.nomeCompleto}</span>
                  <span className="text-xs text-muted-foreground">
                    {selected.identificador} • CPF {selected.cpf}
                  </span>
                </div>
              ) : (
                <span className="text-muted-foreground">
                  Clique para selecionar e pesquisar…
                </span>
              )}
            </button>

            {open && (
              <div className="mt-2 rounded-xl border bg-white shadow-lg">
                <div className="p-2">
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Pesquisar por nome, identificador ou CPF…"
                    className="w-full rounded-lg border px-3 py-2 text-sm"
                    autoFocus
                  />
                </div>
                <div className="max-h-72 overflow-auto p-1">
                  {filtered.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-muted-foreground">
                      Nenhum cedente encontrado.
                    </div>
                  ) : (
                    filtered.map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => pickCedente(r.id)}
                        className={cn(
                          "w-full rounded-lg px-3 py-2 text-left text-sm",
                          "hover:bg-muted/40"
                        )}
                      >
                        <div className="font-medium">{r.nomeCompleto}</div>
                        <div className="text-xs text-muted-foreground">
                          {r.identificador} • CPF {r.cpf} • Wallet: {formatBRL(r.wallet || 0)}
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Valor */}
          <div>
            <label className="text-sm font-medium">Valor (R$)</label>
            <input
              value={amountText}
              onChange={(e) => setAmountText(e.target.value)}
              placeholder="Ex: 1.234,56"
              className="mt-1 w-full rounded-xl border px-3 py-2"
            />

            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={save}
                disabled={!selectedId || loading}
                className={cn(
                  "flex-1 rounded-xl px-3 py-2 font-medium",
                  !selectedId || loading
                    ? "cursor-not-allowed bg-muted text-muted-foreground"
                    : "bg-black text-white hover:opacity-90"
                )}
              >
                Salvar
              </button>

              <button
                type="button"
                onClick={() => selectedId && zero(selectedId)}
                disabled={!selectedId || loading}
                className={cn(
                  "rounded-xl border px-3 py-2 font-medium",
                  !selectedId || loading
                    ? "cursor-not-allowed text-muted-foreground"
                    : "hover:bg-muted/30"
                )}
                title="Zerar saldo (depois de sacar/usar)"
              >
                Zerar
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ✅ Listagem: só os que têm saldo > 0 */}
      <div className="rounded-2xl border bg-white p-4 shadow-sm">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div>
            <div className="text-sm font-medium">Saldos cadastrados</div>
            <div className="text-xs text-muted-foreground">
              {rowsWithValue.length} cedentes com saldo
            </div>
          </div>

          <button
            type="button"
            onClick={load}
            className="rounded-xl border px-3 py-2 text-sm hover:bg-muted/30"
          >
            Atualizar
          </button>
        </div>

        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground">
              <tr className="border-b">
                <th className="py-2">Cedente</th>
                <th className="py-2">Identificador</th>
                <th className="py-2">CPF</th>
                <th className="py-2 text-right">Wallet (R$)</th>
                <th className="py-2 text-right">Ações</th>
              </tr>
            </thead>

            <tbody>
              {rowsWithValue.map((r) => (
                <tr key={r.id} className="border-b last:border-b-0">
                  <td className="py-2">
                    <div className="font-medium">{r.nomeCompleto}</div>
                    <div className="text-xs text-muted-foreground">
                      Owner: {r.owner?.name || r.owner?.login || "-"}
                    </div>
                  </td>

                  <td className="py-2">{r.identificador}</td>
                  <td className="py-2">{r.cpf}</td>

                  <td className="py-2 text-right font-medium">
                    {formatBRL(r.wallet || 0)}
                  </td>

                  <td className="py-2 text-right">
                    <button
                      type="button"
                      onClick={() => editFromTable(r.id)}
                      className="mr-2 rounded-xl border px-3 py-1.5 text-sm hover:bg-muted/30"
                    >
                      Editar
                    </button>

                    <button
                      type="button"
                      onClick={() => zero(r.id)}
                      className="rounded-xl border px-3 py-1.5 text-sm hover:bg-muted/30"
                      title="Depois de sacar/usar, zere para sair da lista"
                    >
                      Zerar
                    </button>
                  </td>
                </tr>
              ))}

              {!loading && rowsWithValue.length === 0 && (
                <tr>
                  <td className="py-6 text-center text-muted-foreground" colSpan={5}>
                    Nenhum saldo cadastrado ainda (wallet &gt; R$ 0,00).
                  </td>
                </tr>
              )}

              {loading && (
                <tr>
                  <td className="py-6 text-center text-muted-foreground" colSpan={5}>
                    Carregando…
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
