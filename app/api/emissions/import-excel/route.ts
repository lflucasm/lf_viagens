import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionServer as getSession } from "@/lib/auth-server";
import { LoyaltyProgram } from "@prisma/client";
import * as XLSX from "xlsx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** =========================
 *  NORMALIZAÇÕES / MATCH
 *  ========================= */

function normName(s: string) {
  return (s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Similaridade Dice (bigrams)
function diceSimilarity(a: string, b: string) {
  const A = normName(a);
  const B = normName(b);
  if (!A || !B) return 0;
  if (A === B) return 1;

  const bigrams = (s: string) => {
    const out: string[] = [];
    for (let i = 0; i < s.length - 1; i++) out.push(s.slice(i, i + 2));
    return out;
  };

  const a2 = bigrams(A);
  const b2 = bigrams(B);
  if (a2.length === 0 || b2.length === 0) return 0;

  const map = new Map<string, number>();
  for (const x of a2) map.set(x, (map.get(x) || 0) + 1);

  let inter = 0;
  for (const x of b2) {
    const c = map.get(x) || 0;
    if (c > 0) {
      inter++;
      map.set(x, c - 1);
    }
  }
  return (2 * inter) / (a2.length + b2.length);
}

/** =========================
 *  PARSE DE MÊS
 *  Aceita: "dez/24", "jan/25", "jan/25 (at)", "jan/2025"
 *  Aceita também: DATA em Excel (serial), Date, "01/12/2024"
 *  E SEMPRE retorna o ÚLTIMO DIA do mês (UTC)
 *  ========================= */

const monthMap: Record<string, number> = {
  jan: 0,
  fev: 1,
  mar: 2,
  abr: 3,
  mai: 4,
  jun: 5,
  jul: 6,
  ago: 7,
  set: 8,
  out: 9,
  nov: 10,
  dez: 11,
};

function lastDayUTC(year: number, mon: number) {
  return new Date(Date.UTC(year, mon + 1, 0, 23, 59, 59, 999));
}

function parseMonthHeaderToLastDayUTC(headerRaw: any): Date | null {
  // 1) Se já vier como Date
  if (headerRaw instanceof Date && !isNaN(headerRaw.getTime())) {
    const y = headerRaw.getUTCFullYear();
    const m = headerRaw.getUTCMonth();
    return lastDayUTC(y, m);
  }

  // 2) Se vier como número (serial Excel)
  if (typeof headerRaw === "number" && Number.isFinite(headerRaw)) {
    const dc = XLSX.SSF.parse_date_code(headerRaw);
    if (dc && dc.y && dc.m) {
      const y = Number(dc.y);
      const m = Number(dc.m) - 1;
      if (Number.isFinite(y) && Number.isFinite(m) && m >= 0 && m <= 11) {
        return lastDayUTC(y, m);
      }
    }
  }

  // 3) String
  const s0 = String(headerRaw ?? "").trim().toLowerCase();
  if (!s0) return null;

  // procura "dez/24" mesmo dentro de "01/12/2024 (dez/24)"
  const mm = s0.match(/([a-zç]{3})\/(\d{2}|\d{4})/i);
  if (mm) {
    const monStr = mm[1].slice(0, 3);
    const mon = monthMap[monStr];
    if (mon === undefined) return null;

    let year = Number(mm[2]);
    if (!Number.isFinite(year)) return null;
    if (year < 100) year = 2000 + year;

    return lastDayUTC(year, mon);
  }

  const cleaned = s0.replace(/\(.*?\)/g, "").replace(/\s+/g, " ").trim();

  // DD/MM/AAAA
  const br = cleaned.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (br) {
    const mon = Number(br[2]) - 1;
    const year = Number(br[3]);
    if (Number.isFinite(mon) && Number.isFinite(year) && year >= 1900 && mon >= 0 && mon <= 11) {
      return lastDayUTC(year, mon);
    }
  }

  // YYYY-MM-DD
  const iso = cleaned.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) {
    const mon = Number(iso[2]) - 1;
    const year = Number(iso[1]);
    if (Number.isFinite(mon) && Number.isFinite(year) && year >= 1900 && mon >= 0 && mon <= 11) {
      return lastDayUTC(year, mon);
    }
  }

  return null;
}

/** =========================
 *  UTIL
 *  ========================= */

function toIntOrZero(v: any) {
  if (typeof v === "number") return Number.isFinite(v) ? Math.trunc(v) : 0;
  const s = String(v ?? "").trim().replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

// "A" => 0, "D" => 3, "AA" => 26
function colLettersToIdx(col: string) {
  const s = String(col || "").trim().toUpperCase();
  if (!/^[A-Z]+$/.test(s)) return NaN;
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    n = n * 26 + (s.charCodeAt(i) - 64);
  }
  return n - 1;
}

type MonthCol = { colIdx: number; dateLastDayUTC: Date; label: string };

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.id) {
      return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 });
    }

    const form = await req.formData();
    const file = form.get("file") as File | null;

    const sheetName = String(form.get("sheetName") || "").trim(); // opcional
    const headerRow = Math.max(1, Number(form.get("headerRow") || 2)); // 1-based
    const dataStartRow = Math.max(1, Number(form.get("dataStartRow") || 3)); // 1-based
    const nameCol = String(form.get("nameCol") || "A").trim();
    const monthStartCol = String(form.get("monthStartCol") || "D").trim();
    const monthEndCol = String(form.get("monthEndCol") || "Q").trim();

    const threshold = Math.max(0, Math.min(1, Number(form.get("threshold") ?? 0.9)));
    const dryRun = String(form.get("dryRun") || "true").toLowerCase() === "true";

    if (!file) {
      return NextResponse.json(
        { ok: false, error: 'Arquivo .xlsx é obrigatório (field: "file").' },
        { status: 400 }
      );
    }

    const nameColIdx = colLettersToIdx(nameCol);
    const startIdx = colLettersToIdx(monthStartCol);
    const endIdx = colLettersToIdx(monthEndCol);

    if (![nameColIdx, startIdx, endIdx].every(Number.isFinite)) {
      return NextResponse.json(
        { ok: false, error: "Colunas inválidas. Use letras: A, D, Q, AA..." },
        { status: 400 }
      );
    }
    const monthFrom = Math.min(startIdx, endIdx);
    const monthTo = Math.max(startIdx, endIdx);

    const buf = Buffer.from(await file.arrayBuffer());
    const wb = XLSX.read(buf, { type: "buffer" });

    const targetSheetName = sheetName || wb.SheetNames[0];
    const ws = wb.Sheets[targetSheetName];
    if (!ws) {
      return NextResponse.json(
        {
          ok: false,
          error: `Aba não encontrada: ${targetSheetName}. Abas disponíveis: ${wb.SheetNames.join(", ")}`,
        },
        { status: 400 }
      );
    }

    const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: "" });

    const headerIdx = headerRow - 1;
    const dataIdx = dataStartRow - 1;

    const header = rows[headerIdx];
    if (!header) {
      return NextResponse.json(
        { ok: false, error: `Linha do cabeçalho (${headerRow}) não existe na aba.` },
        { status: 400 }
      );
    }

    // Detecta meses no range escolhido
    const monthCols: MonthCol[] = [];
    for (let colIdx = monthFrom; colIdx <= monthTo; colIdx++) {
      const label = header[colIdx]; // raw (pode ser número/date)
      const d = parseMonthHeaderToLastDayUTC(label);
      if (d) monthCols.push({ colIdx, dateLastDayUTC: d, label: String(label ?? "").trim() });
    }
    if (monthCols.length === 0) {
      return NextResponse.json(
        { ok: false, error: `Não consegui interpretar nenhum mês na linha ${headerRow} entre ${monthStartCol}..${monthEndCol}.` },
        { status: 400 }
      );
    }

    // ✅ LATAM fixo
    const program = LoyaltyProgram.LATAM;

    const cedentes = await prisma.cedente.findMany({
      select: { id: true, identificador: true, nomeCompleto: true, cpf: true },
    });

    const cedentesNorm = cedentes.map((c) => ({ ...c, nomeNorm: normName(c.nomeCompleto) }));

    const unmatched: Array<{
      excelName: string;
      bestScore: number;
      best?: { id: string; nomeCompleto: string; identificador: string };
    }> = [];

    const plannedEvents: Array<{
      cedenteId: string;
      issuedAt: Date;
      passengersCount: number;
      note: string | null;
    }> = [];

    for (let r = dataIdx; r < rows.length; r++) {
      const row = rows[r];
      if (!row) continue;

      const excelName = String(row[nameColIdx] ?? "").trim();
      if (!excelName) continue;

      let bestScore = 0;
      let best: (typeof cedentesNorm)[number] | null = null;

      for (const c of cedentesNorm) {
        const s = diceSimilarity(excelName, c.nomeCompleto);
        if (s > bestScore) {
          bestScore = s;
          best = c;
        }
      }

      if (!best || bestScore < threshold) {
        unmatched.push({
          excelName,
          bestScore,
          best: best
            ? { id: best.id, nomeCompleto: best.nomeCompleto, identificador: best.identificador }
            : undefined,
        });
        continue;
      }

      for (const mc of monthCols) {
        const qty = toIntOrZero(row[mc.colIdx]);
        if (qty <= 0) continue;

        plannedEvents.push({
          cedenteId: best.id,
          issuedAt: mc.dateLastDayUTC, // ✅ sempre último dia do mês
          passengersCount: qty,
          note: `Import Excel (${targetSheetName}) — ${mc.label} — nomeExcel="${excelName}" — score=${bestScore.toFixed(
            3
          )}`,
        });
      }
    }

    if (dryRun) {
      return NextResponse.json({
        ok: true,
        dryRun: true,
        sheet: targetSheetName,
        program,
        threshold,
        config: {
          headerRow,
          dataStartRow,
          nameCol,
          monthStartCol,
          monthEndCol,
        },
        monthsDetected: monthCols.map((m) => ({
          colIdx: m.colIdx,
          label: m.label,
          issuedAt: m.dateLastDayUTC.toISOString(),
        })),
        plannedCount: plannedEvents.length,
        unmatchedCount: unmatched.length,
        unmatched: unmatched.slice(0, 50),
        samplePlanned: plannedEvents.slice(0, 50).map((e) => ({ ...e, issuedAt: e.issuedAt.toISOString() })),
      });
    }

    // ✅ FIX: insert em lote (evita timeout de transaction)
    const BATCH_SIZE = 500;
    let inserted = 0;

    for (let i = 0; i < plannedEvents.length; i += BATCH_SIZE) {
      const batch = plannedEvents.slice(i, i + BATCH_SIZE);

      const res = await prisma.emissionEvent.createMany({
        data: batch.map((e) => ({
          cedenteId: e.cedenteId,
          program,
          passengersCount: e.passengersCount,
          issuedAt: e.issuedAt, // ✅ último dia do mês
          source: "MANUAL" as any,
          note: e.note,
        })),
        skipDuplicates: false,
      });

      inserted += res.count;
    }

    return NextResponse.json({
      ok: true,
      dryRun: false,
      sheet: targetSheetName,
      program,
      threshold,
      inserted,
      unmatchedCount: unmatched.length,
      unmatched: unmatched.slice(0, 50),
    });
  } catch (err: any) {
    console.error("IMPORT EXCEL ERROR:", err);
    return NextResponse.json({ ok: false, error: err?.message || "Erro inesperado ao importar" }, { status: 500 });
  }
}
