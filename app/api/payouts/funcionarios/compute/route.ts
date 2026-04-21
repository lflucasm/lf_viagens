import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-server";
import { dayBounds, todayISORecife } from "@/lib/payouts/employeePayouts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* =========================
   Utils
========================= */
function isISODate(v: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test((v || "").trim());
}

function safeInt(v: unknown, fb = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fb;
}

function taxByPercent(cents: number, percent: number) {
  return Math.round(Math.max(0, safeInt(cents, 0)) * (percent / 100));
}

function pointsValueCentsFallback(points: number, milheiroCents: number) {
  const denom = (safeInt(points, 0) || 0) / 1000;
  if (denom <= 0) return 0;
  return Math.round(denom * safeInt(milheiroCents, 0));
}

function commission1Fallback(pointsValueCents: number) {
  return Math.round(Math.max(0, safeInt(pointsValueCents, 0)) * 0.01);
}

function bonusFallback(args: { points: number; milheiroCents: number; metaMilheiroCents: number }) {
  const points = safeInt(args.points, 0);
  const mil = safeInt(args.milheiroCents, 0);
  const meta = safeInt(args.metaMilheiroCents, 0);
  if (!points || !mil || !meta) return 0;

  const diff = mil - meta;
  if (diff <= 0) return 0;

  const denom = points / 1000;
  const diffTotal = Math.round(denom * diff);
  return Math.round(diffTotal * 0.3);
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error);
}

/* =========================
  ✅ PV SEM TAXA
  - pointsValueCents (se vier)
  - total - embarqueFee
  - fallback pontos * milheiro
========================= */
function pvSemTaxaFromSale(s: {
  totalCents: number;
  embarqueFeeCents: number;
  pointsValueCents: number;
  points: number;
  milheiroCents: number;
}) {
  const pvDb = safeInt(s.pointsValueCents, 0);
  if (pvDb > 0) return pvDb;

  const total = safeInt(s.totalCents, 0);
  const fee = safeInt(s.embarqueFeeCents, 0);
  if (total > 0) return Math.max(total - fee, 0);

  return pointsValueCentsFallback(safeInt(s.points, 0), safeInt(s.milheiroCents, 0));
}

/* =========================
  Fee payer resolver (via feeCardLabel)
========================= */
function norm(s: string) {
  return String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

function normLogin(s: string) {
  return norm(s).replace(/^@+/, "").replace(/\s+/g, "").replace(/[^a-z0-9._-]/g, "");
}

function extractLoginHint(label?: string | null) {
  const raw = String(label || "").trim();
  if (!raw) return "";

  const mAt = raw.match(/@([a-zA-Z0-9._-]+)/);
  if (mAt?.[1]) return normLogin(mAt[1]);

  const mPar = raw.match(/\(([^)]+)\)/);
  if (mPar?.[1]) {
    const inside = mPar[1].trim().replace(/^@/, "");
    if (inside && !inside.includes(" ")) return normLogin(inside);
  }

  return "";
}

function extractCardOwnerName(label?: string | null) {
  let s = norm(label || "");
  if (!s) return "";

  if (s.startsWith("cartao ")) s = s.slice("cartao ".length).trim();

  for (const sep of [" - ", " (", " [", " | ", " • ", " · "]) {
    const idx = s.indexOf(sep);
    if (idx >= 0) {
      s = s.slice(0, idx).trim();
      break;
    }
  }

  s = s.replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
  return s;
}

function isCompanyCardName(owner: string) {
  const s = norm(owner);
  if (!s) return false;

  const needles = [
    "vias aereas",
    "via s aereas",
    "trademiles",
    "empresa",
    "corporativo",
    "business",
    "pj",
    "ltda",
    "viagens e turismo",
  ];
  return needles.some((k) => s.includes(k));
}

type TeamMemberLite = { id: string; nameNorm: string; loginNorm: string };

function resolveFeePayerFromLabel(
  feeCardLabel: string | null | undefined,
  members: TeamMemberLite[]
): { ignore: boolean; userId: string | null } {
  const label = String(feeCardLabel || "").trim();
  if (!label) return { ignore: false, userId: null };

  const ownerName = extractCardOwnerName(label);
  if (ownerName && isCompanyCardName(ownerName)) return { ignore: true, userId: null };

  const loginHint = extractLoginHint(label);
  if (loginHint) {
    const byLogin = members.find((m) => m.loginNorm === loginHint);
    if (byLogin) return { ignore: false, userId: byLogin.id };
  }

  if (!ownerName) return { ignore: false, userId: null };
  const ownerNorm = norm(ownerName);

  const byNameExact = members.find((m) => m.nameNorm === ownerNorm);
  if (byNameExact) return { ignore: false, userId: byNameExact.id };

  let candidates = members.filter(
    (m) => (m.nameNorm && m.nameNorm.includes(ownerNorm)) || (m.nameNorm && ownerNorm.includes(m.nameNorm))
  );
  if (candidates.length === 1) return { ignore: false, userId: candidates[0].id };

  const tok = ownerNorm.split(" ")[0] || "";
  if (tok) {
    const tokLogin = normLogin(tok);
    candidates = members.filter((m) => {
      const firstName = (m.nameNorm.split(" ")[0] || "").trim();
      return firstName === tok || m.loginNorm === tokLogin || m.nameNorm.includes(tok);
    });
    if (candidates.length === 1) return { ignore: false, userId: candidates[0].id };
  }

  return { ignore: false, userId: null };
}

/* =========================
  ProfitShare helpers
========================= */
function pickShareForDate(
  shares: Array<{
    effectiveFrom: Date;
    effectiveTo: Date | null;
    items: Array<{ payeeId: string; bps: number }>;
  }>,
  refDate: Date
) {
  for (const s of shares) {
    if (s.effectiveFrom && s.effectiveFrom > refDate) continue;
    if (s.effectiveTo && refDate >= s.effectiveTo) continue;
    return s;
  }
  return null;
}

/**
 * ✅ Split correto:
 * - floor inicial
 * - reparte resto por maiores frações
 */
function splitByBps(pool: number, items: Array<{ payeeId: string; bps: number }>) {
  const out: Record<string, number> = {};
  const total = safeInt(pool, 0);
  if (!items?.length || total === 0) return out;

  const rows = items
    .map((it, idx) => ({
      idx,
      payeeId: it.payeeId,
      bps: Math.max(0, safeInt(it.bps, 0)),
    }))
    .filter((x) => !!x.payeeId && x.bps > 0);

  if (!rows.length) return out;

  const sumBps = rows.reduce((acc, r) => acc + r.bps, 0);
  if (sumBps <= 0) return out;

  let used = 0;
  const tmp = rows.map((r) => {
    const raw = (total * r.bps) / sumBps;
    const flo = Math.floor(raw);
    const frac = raw - flo;
    used += flo;
    return { ...r, flo, frac };
  });

  for (const r of tmp) out[r.payeeId] = (out[r.payeeId] ?? 0) + r.flo;

  let rem = total - used;
  if (rem > 0) {
    tmp.sort((a, b) => {
      if (b.frac !== a.frac) return b.frac - a.frac;
      if (b.bps !== a.bps) return b.bps - a.bps;
      return a.idx - b.idx;
    });

    let i = 0;
    while (rem > 0) {
      const r = tmp[i % tmp.length];
      out[r.payeeId] = (out[r.payeeId] ?? 0) + 1;
      rem -= 1;
      i += 1;
    }
  }

  return out;
}

function chooseMetaMilheiro(metaSaleOrPurchase: number | null | undefined) {
  const v = safeInt(metaSaleOrPurchase ?? 0, 0);
  return v > 0 ? v : 0;
}

/* =========================
  Helpers: purchaseId legado (numero) variants
========================= */
function makeNumeroVariants(numeros: string[]) {
  const clean = numeros.map((x) => String(x || "").trim()).filter(Boolean);
  const upper = clean.map((x) => x.toUpperCase());
  const lower = clean.map((x) => x.toLowerCase());
  return Array.from(new Set([...clean, ...upper, ...lower]));
}

type Basis = "PURCHASE_FINALIZED" | "SALE_DATE";

/* =========================
  POST /api/payouts/funcionarios/compute
  body: { date: "YYYY-MM-DD", basis?: "PURCHASE_FINALIZED"|"SALE_DATE", force?: boolean }

  ✅ C1/C2/FEE:
    - SALE_DATE (default): vendas do dia (criação do registro)
    - PURCHASE_FINALIZED: vendas ligadas às compras finalizadas no dia

  ✅ C3:
    - sempre por compras finalizadas no dia
========================= */
export async function POST(req: Request) {
  try {
    const sess = await requireSession();
    const team = String(sess.team || "");
    const meId = String(sess.id || "");
    const role = String(sess.role || "");
    const isAdmin = role === "admin";

    if (!team || !meId) return NextResponse.json({ ok: false, error: "Não autenticado" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const date = String(body?.date || "").trim();

    const basisRaw = String(body?.basis || "SALE_DATE").trim().toUpperCase();
    const basis: Basis = basisRaw === "PURCHASE_FINALIZED" ? "PURCHASE_FINALIZED" : "SALE_DATE";

    const force = Boolean(body?.force);
    if (force && !isAdmin) {
      return NextResponse.json(
        { ok: false, error: "Somente admin pode forçar o recálculo." },
        { status: 403 }
      );
    }

    if (!date || !isISODate(date)) {
      return NextResponse.json({ ok: false, error: "date obrigatório (YYYY-MM-DD)" }, { status: 400 });
    }

    const today = todayISORecife();
    if (date > today) {
      return NextResponse.json({ ok: false, error: "Não computa datas futuras." }, { status: 400 });
    }

    const settings = await prisma.settings.upsert({
      where: { key: "default" },
      create: { key: "default" },
      update: {},
      select: { taxPercent: true, taxEffectiveFrom: true },
    });

    const effectiveISO = settings.taxEffectiveFrom
      ? settings.taxEffectiveFrom.toISOString().slice(0, 10)
      : null;
    const defaultPercent = 8;
    const configuredPercent = Number.isFinite(settings.taxPercent)
      ? Math.max(0, Math.min(100, Number(settings.taxPercent)))
      : defaultPercent;
    const taxPercent = effectiveISO && date >= effectiveISO ? configuredPercent : defaultPercent;

    const { start, end } = dayBounds(date);

    // ✅ força: apaga tudo que NÃO foi pago e reconstrói
    if (force) {
      await prisma.employeePayout.deleteMany({ where: { team, date, paidById: null } });
    }

    // ✅ membros do time (para feeCardLabel -> userId)
    const membersRaw = await prisma.user.findMany({
      where: { team, role: { in: ["admin", "staff"] } },
      select: { id: true, name: true, login: true },
    });
    const members: TeamMemberLite[] = membersRaw.map((u) => ({
      id: String(u.id),
      nameNorm: norm(String(u.name || "")),
      loginNorm: normLogin(String(u.login || "")),
    }));

    // 1) preserva payouts já pagos
    const existingPayouts = await prisma.employeePayout.findMany({
      where: { team, date },
      select: { userId: true, paidById: true },
    });
    const existingByUserId = new Map(existingPayouts.map((p) => [p.userId, p]));

    // 2) compras FINALIZADAS no dia (pra C3) — garante CLOSED
    const purchasesFinalized = await prisma.purchase.findMany({
      where: {
        status: "CLOSED",
        finalizedAt: { gte: start, lt: end },
        cedente: { owner: { team } },
      },
      select: {
        id: true,
        numero: true,
        finalizedAt: true,
        totalCents: true,
        metaMilheiroCents: true,
        finalSalesPointsValueCents: true,
        finalProfitBrutoCents: true,
        finalBonusCents: true,
        finalProfitCents: true,
        cedente: { select: { ownerId: true } },
      },
      orderBy: { finalizedAt: "desc" },
    });

    const purchaseIdsFinalized = purchasesFinalized.map((p) => p.id);

    const purchaseMetaById = new Map<string, number>(
      purchasesFinalized.map((p) => [p.id, safeInt(p.metaMilheiroCents, 0)] as const)
    );

    // Map numero -> id (para legado)
    const idByNumeroUpper = new Map<string, string>(
      purchasesFinalized
        .map((p) => [String(p.numero || "").trim().toUpperCase(), p.id] as const)
        .filter(([k]) => !!k)
    );

    function normalizePurchaseIdUsingFinalized(raw: string) {
      const r = String(raw || "").trim();
      if (!r) return "";
      const upper = r.toUpperCase();
      return idByNumeroUpper.get(upper) || r;
    }

    // 3) sales das compras finalizadas (pra fallback de C3 e também quando basis=PURCHASE_FINALIZED)
    const numerosFinalized = purchasesFinalized.map((p) => String(p.numero || "").trim()).filter(Boolean);
    const numerosAllFinalized = makeNumeroVariants(numerosFinalized);

    const salesForFinalizedPurchases =
      purchaseIdsFinalized.length > 0
        ? await prisma.sale.findMany({
            where: {
              AND: [
                {
                  OR: [
                    { purchaseId: { in: purchaseIdsFinalized } },
                    { purchaseId: { in: numerosAllFinalized } },
                  ],
                },
                // ✅ sem NULL (campo não é nullable no Prisma)
                { paymentStatus: { not: "CANCELED" } },
              ],
            },
            select: {
              id: true,
              purchaseId: true,
              createdAt: true,

              points: true,
              milheiroCents: true,
              totalCents: true,
              embarqueFeeCents: true,
              feeCardLabel: true,

              commissionCents: true,
              bonusCents: true,
              pointsValueCents: true,

              metaMilheiroCents: true,
              sellerId: true,

              purchase: { select: { metaMilheiroCents: true } },
            },
          })
        : [];

    // Index para fallback do C3
    const salesByPurchaseIdForC3: Record<
      string,
      Array<{
        points: number;
        milheiroCents: number;
        totalCents: number;
        embarqueFeeCents: number;
        feeCardLabel: string | null;
        pointsValueCents: number;
        bonusCents: number | null;
        metaMilheiroCents: number;
        purchaseMetaMilheiroCents: number;
        sellerId: string | null;
      }>
    > = {};

    for (const s of salesForFinalizedPurchases) {
      const pidNorm = normalizePurchaseIdUsingFinalized(String(s.purchaseId || ""));
      if (!pidNorm) continue;

      const purchaseMeta =
        safeInt(s.purchase?.metaMilheiroCents, 0) ||
        safeInt(purchaseMetaById.get(pidNorm) ?? 0, 0);

      (salesByPurchaseIdForC3[pidNorm] ||= []).push({
        points: safeInt(s.points, 0),
        milheiroCents: safeInt(s.milheiroCents, 0),
        totalCents: safeInt(s.totalCents, 0),
        embarqueFeeCents: safeInt(s.embarqueFeeCents, 0),
        feeCardLabel: s.feeCardLabel ?? null,

        pointsValueCents: safeInt(s.pointsValueCents, 0),
        bonusCents: typeof s.bonusCents === "number" ? safeInt(s.bonusCents, 0) : null,
        metaMilheiroCents: safeInt(s.metaMilheiroCents, 0),
        purchaseMetaMilheiroCents: purchaseMeta,
        sellerId: s.sellerId ?? null,
      });
    }

    // ✅ lucro líquido REAL por compra (C3)
    function computeLucroLiquidoCompra(p: (typeof purchasesFinalized)[number]) {
      const cost = safeInt(p.totalCents, 0);

      const pvDb = safeInt(p.finalSalesPointsValueCents ?? 0, 0);
      const bonusDb = safeInt(p.finalBonusCents ?? 0, 0);

      if (pvDb > 0 && p.finalBonusCents !== null && p.finalBonusCents !== undefined) {
        const bruto = pvDb - cost;
        return bruto - bonusDb;
      }

      const brutoDb = safeInt(p.finalProfitBrutoCents ?? 0, 0);
      if (brutoDb !== 0 && p.finalBonusCents !== null && p.finalBonusCents !== undefined) {
        return brutoDb - bonusDb;
      }

      const ss = salesByPurchaseIdForC3[p.id] || [];
      if (!ss.length) return safeInt(p.finalProfitCents ?? 0, 0);

      let pvSemTaxaSum = 0;
      let bonusSum = 0;

      for (const s of ss) {
        const pvSemTaxa = pvSemTaxaFromSale({
          totalCents: s.totalCents,
          embarqueFeeCents: s.embarqueFeeCents,
          pointsValueCents: s.pointsValueCents,
          points: s.points,
          milheiroCents: s.milheiroCents,
        });
        pvSemTaxaSum += pvSemTaxa;

        if (s.bonusCents !== null) {
          bonusSum += safeInt(s.bonusCents, 0);
        } else {
          const meta = chooseMetaMilheiro(
            safeInt(s.metaMilheiroCents, 0) > 0 ? s.metaMilheiroCents : s.purchaseMetaMilheiroCents
          );
          bonusSum += bonusFallback({ points: s.points, milheiroCents: s.milheiroCents, metaMilheiroCents: meta });
        }
      }

      const bruto = pvSemTaxaSum - cost;
      return bruto - bonusSum;
    }

    // 4) ProfitShare dos owners envolvidos (C3)
    const ownerIds = Array.from(new Set(purchasesFinalized.map((p) => p.cedente.ownerId).filter(Boolean)));

    const shares = await prisma.profitShare.findMany({
      where: {
        team,
        ownerId: { in: ownerIds.length ? ownerIds : ["__none__"] },
        isActive: true,
        effectiveFrom: { lte: end },
      },
      orderBy: { effectiveFrom: "desc" },
      include: { items: true },
    });

    const sharesByOwner: Record<string, typeof shares> = {};
    for (const s of shares) (sharesByOwner[s.ownerId] ||= []).push(s);

    type Agg = {
      commission1Cents: number;
      commission2Cents: number;
      commission3RateioCents: number;
      feeCents: number;
      salesCount: number;
    };

    const byUser: Record<string, Agg> = {};
    const ensure = (u: string) =>
      (byUser[u] ||= {
        commission1Cents: 0,
        commission2Cents: 0,
        commission3RateioCents: 0,
        feeCents: 0,
        salesCount: 0,
      });

    /* =========================
       5) SALES que entram em C1/C2/FEE
    ========================= */
    type SaleForCommission = {
      id: string;
      purchaseId: string;
      points: number;
      milheiroCents: number;
      totalCents: number;
      embarqueFeeCents: number;
      feeCardLabel: string | null;
      commissionCents: number;
      bonusCents: number | null;
      pointsValueCents: number;
      metaMilheiroCents: number;
      sellerId: string | null;
      purchaseMetaMilheiroCents: number;
    };

    let salesForCommission: SaleForCommission[] = [];

    if (basis === "PURCHASE_FINALIZED") {
      // pega exatamente as vendas “pertencentes” às compras finalizadas do dia
      salesForCommission = salesForFinalizedPurchases.map((s) => {
        const pidNorm = normalizePurchaseIdUsingFinalized(String(s.purchaseId || ""));
        const purchaseMeta =
          safeInt(s.purchase?.metaMilheiroCents, 0) ||
          safeInt(purchaseMetaById.get(pidNorm) ?? 0, 0);

        return {
          id: String(s.id),
          purchaseId: String(s.purchaseId || ""),
          points: safeInt(s.points, 0),
          milheiroCents: safeInt(s.milheiroCents, 0),
          totalCents: safeInt(s.totalCents, 0),
          embarqueFeeCents: safeInt(s.embarqueFeeCents, 0),
          feeCardLabel: s.feeCardLabel ?? null,
          commissionCents: safeInt(s.commissionCents, 0),
          bonusCents: typeof s.bonusCents === "number" ? safeInt(s.bonusCents, 0) : null,
          pointsValueCents: safeInt(s.pointsValueCents, 0),
          metaMilheiroCents: safeInt(s.metaMilheiroCents, 0),
          sellerId: s.sellerId ?? null,
          purchaseMetaMilheiroCents: purchaseMeta,
        };
      });
    } else {
      // SALE_DATE: vendas criadas no dia + filtra por team via purchase id/numero
      const salesTodayRaw = await prisma.sale.findMany({
        where: {
          createdAt: { gte: start, lt: end },
          paymentStatus: { not: "CANCELED" },
        },
        select: {
          id: true,
          purchaseId: true,
          createdAt: true,

          points: true,
          milheiroCents: true,
          totalCents: true,
          embarqueFeeCents: true,
          feeCardLabel: true,

          commissionCents: true,
          bonusCents: true,
          pointsValueCents: true,

          metaMilheiroCents: true,
          sellerId: true,
        },
      });

      const rawPurchaseIds = Array.from(
        new Set(salesTodayRaw.map((s) => String(s.purchaseId || "").trim()).filter(Boolean))
      );

      // tenta casar por id e por numero
      const maybeIds = rawPurchaseIds.filter((x) => x.length >= 20); // heurística ok
      const numerosAll = makeNumeroVariants(rawPurchaseIds);

      const purchasesRef = await prisma.purchase.findMany({
        where: {
          cedente: { owner: { team } },
          OR: [
            { id: { in: maybeIds.length ? maybeIds : ["__none__"] } },
            { numero: { in: numerosAll.length ? numerosAll : ["__none__"] } },
          ],
        },
        select: {
          id: true,
          numero: true,
          metaMilheiroCents: true,
        },
      });

      const byId = new Map(purchasesRef.map((p) => [p.id, p]));
      const byNumeroUpper = new Map(purchasesRef.map((p) => [String(p.numero || "").trim().toUpperCase(), p]));

      for (const s of salesTodayRaw) {
        const rawPid = String(s.purchaseId || "").trim();
        if (!rawPid) continue;

        const p = byId.get(rawPid) || byNumeroUpper.get(rawPid.toUpperCase());
        if (!p) continue; // fora do team

        salesForCommission.push({
          id: String(s.id),
          purchaseId: rawPid,
          points: safeInt(s.points, 0),
          milheiroCents: safeInt(s.milheiroCents, 0),
          totalCents: safeInt(s.totalCents, 0),
          embarqueFeeCents: safeInt(s.embarqueFeeCents, 0),
          feeCardLabel: s.feeCardLabel ?? null,

          commissionCents: safeInt(s.commissionCents, 0),
          bonusCents: typeof s.bonusCents === "number" ? safeInt(s.bonusCents, 0) : null,
          pointsValueCents: safeInt(s.pointsValueCents, 0),

          metaMilheiroCents: safeInt(s.metaMilheiroCents, 0),
          sellerId: s.sellerId ?? null,
          purchaseMetaMilheiroCents: safeInt(p.metaMilheiroCents, 0),
        });
      }
    }

    // 6) C1/C2 por seller + ✅ Fee reembolsado pro pagador do cartão (fallback seller)
    for (const s of salesForCommission) {
      const sellerId = s.sellerId;

      // C1/C2 só se tiver seller
      if (sellerId) {
        const pvSemTaxa = pvSemTaxaFromSale({
          totalCents: s.totalCents,
          embarqueFeeCents: s.embarqueFeeCents,
          pointsValueCents: s.pointsValueCents,
          points: s.points,
          milheiroCents: s.milheiroCents,
        });

        const meta = chooseMetaMilheiro(
          safeInt(s.metaMilheiroCents, 0) > 0 ? s.metaMilheiroCents : s.purchaseMetaMilheiroCents
        );

        const c1 = safeInt(s.commissionCents, 0) > 0 ? safeInt(s.commissionCents, 0) : commission1Fallback(pvSemTaxa);
        const c2 =
          safeInt(s.bonusCents ?? 0, 0) > 0
            ? safeInt(s.bonusCents ?? 0, 0)
            : bonusFallback({ points: s.points, milheiroCents: s.milheiroCents, metaMilheiroCents: meta });

        const aSeller = ensure(sellerId);
        aSeller.commission1Cents += safeInt(c1, 0);
        aSeller.commission2Cents += safeInt(c2, 0);
        aSeller.salesCount += 1;
      }

      // ✅ Fee: vai pra pessoa do cartão (ou fallback seller)
      const fee = safeInt(s.embarqueFeeCents, 0);
      if (fee > 0) {
        const { ignore, userId } = resolveFeePayerFromLabel(s.feeCardLabel, members);
        if (!ignore) {
          const receiverId = userId || sellerId;
          if (receiverId) ensure(receiverId).feeCents += fee;
        }
      }
    }

    // 7) ✅ C3 = rateio do lucro líquido REAL por compra finalizada no dia
    for (const p of purchasesFinalized) {
      const pool = computeLucroLiquidoCompra(p);
      if (safeInt(pool, 0) <= 0) continue;

      const ownerId = p.cedente.ownerId;
      if (!ownerId) continue;

      const ownerShares = sharesByOwner[ownerId] || [];
      const share = pickShareForDate(
        ownerShares.map((x) => ({
          effectiveFrom: x.effectiveFrom,
          effectiveTo: x.effectiveTo,
          items: x.items.map((i) => ({ payeeId: i.payeeId, bps: i.bps })),
        })),
        p.finalizedAt ?? start
      );

      const items = share?.items?.length ? share.items : [{ payeeId: ownerId, bps: 10000 }];
      const splits = splitByBps(pool, items);

      for (const payeeId of Object.keys(splits)) {
        ensure(payeeId).commission3RateioCents += safeInt(splits[payeeId], 0);
      }
    }

    const balcaoOps = await prisma.balcaoOperacao.findMany({
      where: {
        team,
        createdAt: { gte: start, lt: end },
        employeeId: { not: null },
      },
      select: {
        employeeId: true,
      },
    });

    for (const op of balcaoOps) {
      const employeeId = String(op.employeeId || "").trim();
      if (!employeeId) continue;
      ensure(employeeId);
    }

    const computedUserIds = Object.keys(byUser);

    if (!computedUserIds.length) {
      // sem nada pra computar: limpa não pagos e sai
      await prisma.employeePayout.deleteMany({ where: { team, date, paidById: null } });
      return NextResponse.json({
        ok: true,
        date,
        basis,
        force,
        users: 0,
        purchasesFinalized: purchasesFinalized.length,
        salesForCommission: salesForCommission.length,
        salesForFinalizedPurchases: salesForFinalizedPurchases.length,
        balcaoOps: balcaoOps.length,
      });
    }

    // 8) remove payouts "lixo" não pagos (mantém consistência)
    await prisma.employeePayout.deleteMany({
      where: {
        team,
        date,
        paidById: null,
        userId: { notIn: computedUserIds.length ? computedUserIds : ["__none__"] },
      },
    });

    // 9) upsert preservando pagos
    for (const userId of computedUserIds) {
      const agg = byUser[userId];
      const existing = existingByUserId.get(userId);
      if (existing?.paidById) continue;

      const c1 = safeInt(agg.commission1Cents, 0);
      const c2 = safeInt(agg.commission2Cents, 0);
      const c3 = safeInt(agg.commission3RateioCents, 0);

      const gross = c1 + c2 + c3;
      const tax = taxByPercent(gross, taxPercent);
      const fee = safeInt(agg.feeCents, 0);
      const net = gross - tax + fee;

      await prisma.employeePayout.upsert({
        where: { team_date_userId: { team, date, userId } },
        create: {
          team,
          date,
          userId,
          grossProfitCents: gross,
          tax7Cents: tax, // legado
          feeCents: fee,
          netPayCents: net,
          breakdown: {
            commission1Cents: c1,
            commission2Cents: c2,
            commission3RateioCents: c3,
            salesCount: safeInt(agg.salesCount, 0),
            taxPercent,
            basis,
          },
        },
        update: {
          grossProfitCents: gross,
          tax7Cents: tax,
          feeCents: fee,
          netPayCents: net,
          breakdown: {
            commission1Cents: c1,
            commission2Cents: c2,
            commission3RateioCents: c3,
            salesCount: safeInt(agg.salesCount, 0),
            taxPercent,
            basis,
          },
        },
      });
    }

    return NextResponse.json({
      ok: true,
      date,
      basis,
      force,
      users: computedUserIds.length,
      purchasesFinalized: purchasesFinalized.length,
      salesForCommission: salesForCommission.length,
      salesForFinalizedPurchases: salesForFinalizedPurchases.length,
      balcaoOps: balcaoOps.length,
    });
  } catch (e: unknown) {
    const errorMessage = getErrorMessage(e);
    const msg = errorMessage === "UNAUTHENTICATED" ? "Não autenticado" : errorMessage;
    const status = errorMessage === "UNAUTHENTICATED" ? 401 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
