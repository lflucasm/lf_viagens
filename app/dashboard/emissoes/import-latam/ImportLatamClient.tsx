"use client";

import { useMemo, useState } from "react";

type DryRunResp =
  | {
      ok: true;
      dryRun: true;
      sheet: string;
      threshold: number;
      config: {
        headerRow: number;
        dataStartRow: number;
        nameCol: string;
        monthStartCol: string;
        monthEndCol: string;
      };
      monthsDetected: Array<{ colIdx: number; label: string; issuedAt: string }>;
      plannedCount: number;
      unmatchedCount: number;
      unmatched: Array<{
        excelName: string;
        bestScore: number;
        best?: { id: string; nomeCompleto: string; identificador: string };
      }>;
      samplePlanned: Array<{
        cedenteId: string;
        issuedAt: string;
        passengersCount: number;
        note: string | null;
      }>;
    }
  | { ok: false; error: string };

type ImportResp =
  | {
      ok: true;
      dryRun: false;
      sheet: string;
      threshold: number;
      inserted: number;
      unmatchedCount: number;
      unmatched: any[];
    }
  | { ok: false; error: string };

function cn(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

export default function ImportLatamClient() {
  const [file, setFile] = useState<File | null>(null);

  const [sheetName, setSheetName] = useState<string>("Contagem CPF");

  const [headerRow, setHeaderRow] = useState<number>(2);
  const [dataStartRow, setDataStartRow] = useState<number>(3);

  const [nameCol, setNameCol] = useState<string>("A");
  const [monthStartCol, setMonthStartCol] = useState<string>("D");
  const [monthEndCol, setMonthEndCol] = useState<string>("Q");

  const [threshold, setThreshold] = useState<number>(0.9);

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DryRunResp | ImportResp | null>(null);

  const canRun = useMemo(() => !!file, [file]);

  async function postImport(dryRun: boolean) {
    if (!file) return alert("Selecione um arquivo .xlsx");

    setLoading(true);
    setResult(null);

    try {
      const fd = new FormData();
      fd.append("file", file);

      if (sheetName.trim()) fd.append("sheetName", sheetName.trim());
      fd.append("headerRow", String(headerRow));
      fd.append("dataStartRow", String(dataStartRow));
      fd.append("nameCol", nameCol.trim());
      fd.append("monthStartCol", monthStartCol.trim());
      fd.append("monthEndCol", monthEndCol.trim());
      fd.append("threshold", String(threshold));
      fd.append("dryRun", dryRun ? "true" : "false");

      const res = await fetch("/api/emissions/import-excel", {
        method: "POST",
        body: fd,
        cache: "no-store",
      });

      const json = (await res.json().catch(() => ({}))) as any;
      if (!res.ok || json?.ok === false) {
        throw new Error(json?.error || "Falha ao importar.");
      }

      setResult(json);
    } catch (e: any) {
      setResult({ ok: false, error: e?.message || "Erro" });
      alert(e?.message || "Erro ao importar");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Importar emissões — LATAM</h1>
        <p className="text-sm text-zinc-500">
          Converte uma planilha por mês/coluna em eventos (data = último dia do mês).
        </p>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-base font-semibold">Arquivo Excel</h2>

        <div className="grid gap-3 md:grid-cols-12">
          <div className="md:col-span-6">
            <label className="mb-1 block text-xs text-zinc-600">Selecionar .xlsx</label>
            <input
              type="file"
              accept=".xlsx"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="block w-full text-sm"
            />
            {file ? (
              <div className="mt-1 text-xs text-zinc-500">
                {file.name} ({Math.round(file.size / 1024)} KB)
              </div>
            ) : null}
          </div>

          <div className="md:col-span-6">
            <label className="mb-1 block text-xs text-zinc-600">Aba (sheet)</label>
            <input
              value={sheetName}
              onChange={(e) => setSheetName(e.target.value)}
              placeholder="Deixe em branco para usar a primeira aba"
              className="h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm shadow-sm outline-none focus:border-zinc-300"
            />
            <div className="mt-1 text-xs text-zinc-500">
              Dica: se deixar em branco, usa a primeira aba do arquivo.
            </div>
          </div>

          <div className="md:col-span-3">
            <label className="mb-1 block text-xs text-zinc-600">Linha mês/ano</label>
            <input
              type="number"
              min={1}
              value={headerRow}
              onChange={(e) => setHeaderRow(Number(e.target.value))}
              className="h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm shadow-sm outline-none focus:border-zinc-300"
            />
            <div className="mt-1 text-xs text-zinc-500">Ex.: 2</div>
          </div>

          <div className="md:col-span-3">
            <label className="mb-1 block text-xs text-zinc-600">Linha inicial dos dados</label>
            <input
              type="number"
              min={1}
              value={dataStartRow}
              onChange={(e) => setDataStartRow(Number(e.target.value))}
              className="h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm shadow-sm outline-none focus:border-zinc-300"
            />
            <div className="mt-1 text-xs text-zinc-500">Ex.: 3</div>
          </div>

          <div className="md:col-span-2">
            <label className="mb-1 block text-xs text-zinc-600">Coluna Nome</label>
            <input
              value={nameCol}
              onChange={(e) => setNameCol(e.target.value)}
              placeholder="A"
              className="h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm shadow-sm outline-none focus:border-zinc-300"
            />
          </div>

          <div className="md:col-span-2">
            <label className="mb-1 block text-xs text-zinc-600">Meses: de</label>
            <input
              value={monthStartCol}
              onChange={(e) => setMonthStartCol(e.target.value)}
              placeholder="D"
              className="h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm shadow-sm outline-none focus:border-zinc-300"
            />
          </div>

          <div className="md:col-span-2">
            <label className="mb-1 block text-xs text-zinc-600">Meses: até</label>
            <input
              value={monthEndCol}
              onChange={(e) => setMonthEndCol(e.target.value)}
              placeholder="Q"
              className="h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm shadow-sm outline-none focus:border-zinc-300"
            />
          </div>

          <div className="md:col-span-2">
            <label className="mb-1 block text-xs text-zinc-600">Match</label>
            <input
              type="number"
              step="0.01"
              min={0}
              max={1}
              value={threshold}
              onChange={(e) => setThreshold(Number(e.target.value))}
              className="h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm shadow-sm outline-none focus:border-zinc-300"
            />
            <div className="mt-1 text-xs text-zinc-500">Sugestão: 0.90</div>
          </div>

          <div className="md:col-span-12 flex flex-wrap gap-2">
            <button
              disabled={!canRun || loading}
              onClick={() => postImport(true)}
              className={cn(
                "h-10 rounded-xl border border-zinc-200 bg-white px-4 text-sm font-medium text-zinc-800 shadow-sm hover:bg-zinc-50",
                (!canRun || loading) && "opacity-60 cursor-not-allowed"
              )}
            >
              {loading ? "Processando..." : "Dry-run (validar)"}
            </button>

            <button
              disabled={!canRun || loading}
              onClick={() => postImport(false)}
              className={cn(
                "h-10 rounded-xl bg-zinc-900 px-4 text-sm font-medium text-white shadow-sm hover:bg-zinc-800",
                (!canRun || loading) && "opacity-60 cursor-not-allowed"
              )}
            >
              {loading ? "Processando..." : "Importar e gravar"}
            </button>

            <span className="ml-auto text-xs text-zinc-500 self-center">
              Endpoint: <span className="rounded bg-zinc-100 px-1 py-0.5">/api/emissions/import-excel</span>
            </span>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-base font-semibold">Resultado</h2>
          {result && "ok" in result ? (
            <span className={cn("text-xs", (result as any).ok ? "text-emerald-700" : "text-red-700")}>
              {(result as any).ok ? "OK" : "ERRO"}
            </span>
          ) : null}
        </div>

        {!result ? (
          <div className="text-sm text-zinc-600">
            Rode um <b>dry-run</b> para validar meses detectados e matches antes de gravar.
          </div>
        ) : (result as any).ok === false ? (
          <div className="text-sm text-red-700">{(result as any).error}</div>
        ) : (result as any).dryRun ? (
          <DryRunView data={result as DryRunResp & { ok: true; dryRun: true }} />
        ) : (
          <ImportView data={result as ImportResp & { ok: true; dryRun: false }} />
        )}
      </div>

      <div className="text-xs text-zinc-500">
        Dica: se você confiar no padrão de nomes, pode baixar o threshold (ex.: 0.85). Se tiver muitos homônimos,
        mantenha 0.90+.
      </div>
    </div>
  );
}

function DryRunView({ data }: { data: DryRunResp & { ok: true; dryRun: true } }) {
  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-4">
        <Kpi label="Aba" value={data.sheet} />
        <Kpi label="Meses detectados" value={String(data.monthsDetected.length)} />
        <Kpi label="Planejados" value={String(data.plannedCount)} strong />
        <Kpi label="Não encontrados" value={String(data.unmatchedCount)} warn={data.unmatchedCount > 0} />
      </div>

      <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-sm">
        <div className="text-xs text-zinc-500 mb-1">Config</div>
        <div className="flex flex-wrap gap-2">
          <Badge>headerRow: {data.config.headerRow}</Badge>
          <Badge>dataStartRow: {data.config.dataStartRow}</Badge>
          <Badge>nameCol: {data.config.nameCol}</Badge>
          <Badge>months: {data.config.monthStartCol}..{data.config.monthEndCol}</Badge>
          <Badge>threshold: {data.threshold}</Badge>
        </div>
      </div>

      <div>
        <div className="text-xs text-zinc-500 mb-1">Meses detectados</div>
        <div className="flex flex-wrap gap-2">
          {data.monthsDetected.map((m, i) => (
            <Badge key={i}>
              {m.label} → {new Date(m.issuedAt).toLocaleDateString("pt-BR")}
            </Badge>
          ))}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-zinc-200 p-3">
          <div className="text-xs text-zinc-500 mb-2">Amostra planejada</div>
          {data.samplePlanned.length === 0 ? (
            <div className="text-sm text-zinc-600">Nada planejado (tudo zero ou sem match).</div>
          ) : (
            <ul className="space-y-1 text-sm">
              {data.samplePlanned.slice(0, 10).map((x, i) => (
                <li key={i} className="flex justify-between gap-2">
                  <span className="truncate">{x.cedenteId.slice(0, 8)}…</span>
                  <span className="text-zinc-600">
                    {new Date(x.issuedAt).toLocaleDateString("pt-BR")} • {x.passengersCount} pax
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-xl border border-zinc-200 p-3">
          <div className="text-xs text-zinc-500 mb-2">Não encontrados (top 10)</div>
          {data.unmatched.length === 0 ? (
            <div className="text-sm text-zinc-600">Nenhum. ✅</div>
          ) : (
            <ul className="space-y-1 text-sm">
              {data.unmatched.slice(0, 10).map((u, i) => (
                <li key={i} className="flex flex-col gap-0.5">
                  <div className="font-medium truncate">{u.excelName}</div>
                  <div className="text-xs text-zinc-600">
                    melhor score: {u.bestScore.toFixed(3)}{" "}
                    {u.best ? `• sugestão: ${u.best.identificador} — ${u.best.nomeCompleto}` : ""}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function ImportView({ data }: { data: ImportResp & { ok: true; dryRun: false } }) {
  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-4">
        <Kpi label="Aba" value={data.sheet} />
        <Kpi label="Inseridos" value={String(data.inserted)} strong />
        <Kpi label="Não encontrados" value={String(data.unmatchedCount)} warn={data.unmatchedCount > 0} />
        <Kpi label="Threshold" value={String(data.threshold)} />
      </div>

      {data.unmatchedCount > 0 ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          Existem nomes não encontrados. Rode um dry-run com threshold menor (ex.: 0.85) ou corrija nomes na planilha.
        </div>
      ) : (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
          Importação concluída. ✅
        </div>
      )}
    </div>
  );
}

function Kpi({
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

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-xs text-zinc-700">
      {children}
    </span>
  );
}
