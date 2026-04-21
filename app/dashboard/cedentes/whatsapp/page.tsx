"use client";

import { useEffect, useMemo, useState } from "react";

type Row = {
  id: string;
  identificador: string;
  nomeCompleto: string;
  telefone: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
  owner: { name: string; login: string };
  whatsappE164: string | null;
  whatsappUrl: string | null;
};

export default function CedentesWhatsappPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setLoading(true);
        setErr(null);

        const res = await fetch("/api/cedentes/whatsapp", { cache: "no-store" });
        const data = await res.json();

        if (!res.ok || !data?.ok) {
          throw new Error(data?.error || "Falha ao carregar cedentes");
        }

        if (alive) setRows(data.rows || []);
      } catch (e: any) {
        if (alive) setErr(e?.message || "Erro inesperado");
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) => {
      const t =
        `${r.identificador} ${r.nomeCompleto} ${r.telefone ?? ""} ${r.owner?.name ?? ""} ${r.owner?.login ?? ""}`.toLowerCase();
      return t.includes(s);
    });
  }, [rows, q]);

  return (
    <div className="mx-auto max-w-6xl p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold">Cedentes • WhatsApp</h1>
          <p className="text-sm opacity-70">
            Abra o WhatsApp do cedente direto pela lista (precisa ter DDD).
          </p>
        </div>

        <div className="flex gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar (nome, id, telefone, owner...)"
            className="w-full sm:w-80 rounded-md border px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div className="mt-4 rounded-lg border">
        {loading ? (
          <div className="p-4 text-sm">Carregando…</div>
        ) : err ? (
          <div className="p-4 text-sm text-red-600">{err}</div>
        ) : filtered.length === 0 ? (
          <div className="p-4 text-sm">Nenhum cedente encontrado.</div>
        ) : (
          <div className="overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="border-b bg-black/5">
                <tr>
                  <th className="px-3 py-2 text-left">Cedente</th>
                  <th className="px-3 py-2 text-left">Identificador</th>
                  <th className="px-3 py-2 text-left">Telefone</th>
                  <th className="px-3 py-2 text-left">Owner</th>
                  <th className="px-3 py-2 text-left">WhatsApp</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} className="border-b last:border-b-0">
                    <td className="px-3 py-2">
                      <div className="font-medium">{r.nomeCompleto}</div>
                      <div className="text-xs opacity-60">{r.status}</div>
                    </td>
                    <td className="px-3 py-2">{r.identificador}</td>
                    <td className="px-3 py-2">{r.telefone ?? "—"}</td>
                    <td className="px-3 py-2">
                      {r.owner?.name ?? "—"}{" "}
                      <span className="opacity-60">({r.owner?.login ?? "—"})</span>
                    </td>
                    <td className="px-3 py-2">
                      {r.whatsappUrl ? (
                        <a
                          href={r.whatsappUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 hover:bg-black/5"
                          title={`Abrir WhatsApp (${r.whatsappE164})`}
                        >
                          Abrir
                        </a>
                      ) : (
                        <span className="text-xs opacity-60">
                          Sem telefone válido (precisa DDD)
                        </span>
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
