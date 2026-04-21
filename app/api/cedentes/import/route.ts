import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { PixTipo, CedenteStatus } from "@prisma/client";

/* =======================
   Tipos
======================= */
type ImportRow = {
  identificador?: string;
  nomeCompleto?: string;
  dataNascimento?: string | Date | null;
  cpf?: string;

  telefone?: string | null;
  emailCriado?: string | null;

  banco?: string | null;
  pixTipo?: keyof typeof PixTipo | PixTipo | null;
  chavePix?: string | null;

  // Senhas (agora SEM ENC)
  senhaEmail?: string | null;
  senhaSmiles?: string | null;
  senhaLatamPass?: string | null;
  senhaLivelo?: string | null;
  senhaEsfera?: string | null;

  // Pontos
  pontosLatam?: number | string | null;
  pontosSmiles?: number | string | null;
  pontosLivelo?: number | string | null;
  pontosEsfera?: number | string | null;

  // Responsável
  ownerId?: string;
};

/* =======================
   Utils
======================= */
function onlyDigits(v: unknown) {
  return String(v ?? "").replace(/\D+/g, "");
}

/**
 * ✅ Normalização segura de CPF
 * - remove pontos/espaços
 * - completa com zero à esquerda se vier com 10 dígitos
 */
function normalizeCpfSafe(v: unknown): string {
  let cpf = onlyDigits(v);

  if (cpf.length === 10) {
    cpf = "0" + cpf;
  }

  return cpf;
}

/**
 * ✅ Parser robusto de pontos (BACKEND)
 */
function parsePontosSafe(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) {
    if (Number.isInteger(v)) return Math.max(0, v);

    if (v > 0 && v < 1000) {
      const t = v * 1000;
      if (Math.abs(t - Math.round(t)) < 1e-6) {
        return Math.max(0, Math.round(t));
      }
    }

    return Math.max(0, Math.floor(v));
  }

  const s0 = String(v ?? "").trim();
  if (!s0) return 0;

  let s = s0.replace(/\s/g, "").replace(/[R$\u00A0]/g, "");

  if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    return Math.max(0, parseInt(s.replace(/\./g, ""), 10));
  }

  if (/^\d{1,3}(,\d{3})+$/.test(s)) {
    return Math.max(0, parseInt(s.replace(/,/g, ""), 10));
  }

  const lastDot = s.lastIndexOf(".");
  const lastComma = s.lastIndexOf(",");

  if (lastDot >= 0 && lastComma >= 0) {
    const commaIsDecimal = lastComma > lastDot;

    if (commaIsDecimal) {
      s = s.replace(/\./g, "").replace(/,/g, ".");
    } else {
      s = s.replace(/,/g, "");
    }

    const n = Number(s.replace(/[^\d.]/g, ""));
    return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
  }

  if (lastDot >= 0) {
    if (/^\d{1,3}\.\d{3}$/.test(s)) {
      return Math.max(0, parseInt(s.replace(".", ""), 10));
    }

    const n = Number(s.replace(/[^\d.]/g, ""));
    if (Number.isFinite(n) && n > 0 && n < 1000) {
      const t = n * 1000;
      if (Math.abs(t - Math.round(t)) < 1e-6) return Math.round(t);
    }
    return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
  }

  if (lastComma >= 0) {
    if (/^\d{1,3},\d{3}$/.test(s)) {
      return Math.max(0, parseInt(s.replace(",", ""), 10));
    }
    const n = Number(s.replace(/[^\d,]/g, "").replace(/,/g, "."));
    return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
  }

  const digits = s.replace(/\D+/g, "");
  return digits ? Math.max(0, parseInt(digits, 10)) : 0;
}

function parseDateSafe(v: unknown): Date | null {
  if (!v) return null;
  if (v instanceof Date && !isNaN(v.getTime())) return v;

  const s = String(v).trim();
  if (!s) return null;

  const iso = new Date(s);
  if (!isNaN(iso.getTime())) return iso;

  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) {
    const d = new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function normalizePixTipo(v: unknown): PixTipo {
  const s = String(v ?? "").trim().toUpperCase();
  if (s in PixTipo) return PixTipo[s as keyof typeof PixTipo];
  return PixTipo.CPF;
}

function makeIdentifier(nome: string, index: number) {
  const cleaned = nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]+/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, " ")
    .trim();

  const first = cleaned.split(/\s+/)[0] || "CED";
  const prefix = first.replace(/[^A-Z0-9]/g, "").slice(0, 3).padEnd(3, "X");
  return `${prefix}-${String(index + 1).padStart(3, "0")}`;
}

function asPlain(v: unknown): string | null {
  const s = String(v ?? "").trim();
  return s ? s : null;
}

/* ✅ NOVO: no CREATE, se faltar dado textual -> "PREENCHER" */
function asFillText(v: unknown): string {
  const s = String(v ?? "").trim();
  return s ? s : "PREENCHER";
}

/* ✅ NOVO: no CREATE, se faltar dado textual opcional -> null (ou PREENCHER dependendo do campo) */
function asFillNullable(v: unknown): string | null {
  const s = String(v ?? "").trim();
  return s ? s : null;
}

/* =======================
   POST
======================= */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const rows: ImportRow[] = Array.isArray(body?.rows) ? body.rows : [];

    if (!rows.length) {
      return NextResponse.json(
        { ok: false, error: "Nenhum dado para importar" },
        { status: 400 }
      );
    }

    let count = 0;
    const errors: Array<{ i: number; reason: string }> = [];

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];

      const nomeCompleto = String(r?.nomeCompleto ?? "").trim();
      const cpf = normalizeCpfSafe(r?.cpf);

      if (!nomeCompleto) {
        errors.push({ i, reason: "nomeCompleto vazio" });
        continue;
      }

      if (cpf.length !== 11) {
        // não bloqueia, só registra
        errors.push({ i, reason: "cpf inválido (ajustado para importação)" });
      }

      const ownerId = String(r?.ownerId ?? "").trim();
      if (!ownerId) {
        errors.push({ i, reason: "ownerId ausente" });
        continue;
      }

      const identificador =
        String(r?.identificador ?? "").trim() || makeIdentifier(nomeCompleto, i);

      try {
        await prisma.cedente.upsert({
          where: { cpf },

          create: {
            identificador,
            nomeCompleto,
            cpf,
            dataNascimento: parseDateSafe(r?.dataNascimento),

            // ✅ se faltar dado -> "PREENCHER"
            telefone: asFillText(r?.telefone),
            emailCriado: asFillText(r?.emailCriado),

            banco: asFillText(r?.banco),
            pixTipo: normalizePixTipo(r?.pixTipo),
            chavePix: asFillText(r?.chavePix),

            titularConfirmado: true,

            // ✅ SENHAS (SEM ENC) — se faltar -> "PREENCHER"
            senhaEmail: asFillText(r?.senhaEmail),
            senhaSmiles: asFillText(r?.senhaSmiles),
            senhaLatamPass: asFillText(r?.senhaLatamPass),
            senhaLivelo: asFillText(r?.senhaLivelo),
            senhaEsfera: asFillText(r?.senhaEsfera),

            // ✅ PONTOS — se faltar -> 0 (parse já faz)
            pontosLatam: parsePontosSafe(r?.pontosLatam),
            pontosSmiles: parsePontosSafe(r?.pontosSmiles),
            pontosLivelo: parsePontosSafe(r?.pontosLivelo),
            pontosEsfera: parsePontosSafe(r?.pontosEsfera),

            status: CedenteStatus.APPROVED,
            ownerId,
          },

          update: {
            nomeCompleto,
            dataNascimento: r?.dataNascimento ? parseDateSafe(r.dataNascimento) : undefined,

            telefone: r?.telefone ? String(r.telefone).trim() : undefined,
            emailCriado: r?.emailCriado ? String(r.emailCriado).trim() : undefined,

            banco: r?.banco ? String(r.banco).trim() : undefined,
            pixTipo: r?.pixTipo ? normalizePixTipo(r.pixTipo) : undefined,
            chavePix: r?.chavePix ? String(r.chavePix).trim() : undefined,

            // ✅ SENHAS (SEM ENC)
            senhaEmail: r?.senhaEmail ? asPlain(r.senhaEmail) : undefined,
            senhaSmiles: r?.senhaSmiles ? asPlain(r.senhaSmiles) : undefined,
            senhaLatamPass: r?.senhaLatamPass ? asPlain(r.senhaLatamPass) : undefined,
            senhaLivelo: r?.senhaLivelo ? asPlain(r.senhaLivelo) : undefined,
            senhaEsfera: r?.senhaEsfera ? asPlain(r.senhaEsfera) : undefined,

            pontosLatam: r?.pontosLatam != null ? parsePontosSafe(r.pontosLatam) : undefined,
            pontosSmiles: r?.pontosSmiles != null ? parsePontosSafe(r.pontosSmiles) : undefined,
            pontosLivelo: r?.pontosLivelo != null ? parsePontosSafe(r.pontosLivelo) : undefined,
            pontosEsfera: r?.pontosEsfera != null ? parsePontosSafe(r.pontosEsfera) : undefined,

            ownerId,
          },
        });

        count++;
      } catch (e: any) {
        errors.push({ i, reason: e?.code || "erro ao salvar" });
      }
    }

    return NextResponse.json({
      ok: true,
      data: {
        count,
        skipped: rows.length - count,
        errors: errors.slice(0, 50),
      },
    });
  } catch (e) {
    console.error("[IMPORT CEDENTES]", e);
    return NextResponse.json(
      { ok: false, error: "Erro ao importar cedentes" },
      { status: 500 }
    );
  }
}
