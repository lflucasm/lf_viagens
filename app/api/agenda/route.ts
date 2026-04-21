import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function noCacheHeaders() {
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    Pragma: "no-cache",
    Expires: "0",
    "Surrogate-Control": "no-store",
  };
}
function ok(data: any) {
  return NextResponse.json({ ok: true, data }, { headers: noCacheHeaders() });
}
function bad(error: string, status = 400) {
  return NextResponse.json(
    { ok: false, error },
    { status, headers: noCacheHeaders() }
  );
}

function isBrDate(s: string) {
  return /^\d{2}\/\d{2}\/\d{4}$/.test(String(s || ""));
}
function isBrMonth(s: string) {
  return /^\d{2}\/\d{4}$/.test(String(s || ""));
}
function brToISO(ddmmyyyy: string) {
  if (!isBrDate(ddmmyyyy)) return "";
  const [dd, mm, yyyy] = ddmmyyyy.split("/");
  const d = Number(dd),
    m = Number(mm),
    y = Number(yyyy);
  if (!d || !m || !y) return "";
  if (m < 1 || m > 12) return "";
  if (d < 1 || d > 31) return "";
  const iso = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(
    2,
    "0"
  )}`;
  // valida (evita 31/02 etc)
  const dt = new Date(`${iso}T12:00:00.000Z`);
  if (Number.isNaN(dt.getTime())) return "";
  const back = dt.toISOString().slice(0, 10);
  if (back !== iso) return "";
  return iso;
}
function isoToBR(iso: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(iso || ""))) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}
function brMonthToYM(mmYYYY: string) {
  if (!isBrMonth(mmYYYY)) return "";
  const [mm, yyyy] = mmYYYY.split("/");
  const m = Number(mm),
    y = Number(yyyy);
  if (!m || !y || m < 1 || m > 12) return "";
  return `${y}-${String(m).padStart(2, "0")}`;
}
function daysInMonthYM(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0, 12, 0, 0));
  return last.getUTCDate();
}

function parseHHMM(s: string) {
  const m = /^(\d{2}):(\d{2})$/.exec(String(s || "").trim());
  if (!m) return NaN;
  const hh = Number(m[1]),
    mm = Number(m[2]);
  if (hh < 0 || hh > 23) return NaN;
  if (mm < 0 || mm > 59) return NaN;
  return hh * 60 + mm;
}
function fmtMin(min: number) {
  const hh = String(Math.floor(min / 60)).padStart(2, "0");
  const mm = String(min % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

function todayRecifeISO(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Recife",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}
function addMonthsYM(ym: string, delta: number) {
  const [y, m] = ym.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + delta, 1, 12, 0, 0));
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  return `${yy}-${mm}`;
}
function canEditMonth(ym: string) {
  const todayISO = todayRecifeISO();
  const currentYM = todayISO.slice(0, 7);
  if (ym === currentYM) return true;

  const nextYM = addMonthsYM(currentYM, 1);
  if (ym !== nextYM) return false;

  // libera mês seguinte 10 dias antes do dia 01
  const unlock = new Date(`${nextYM}-01T12:00:00.000Z`);
  unlock.setUTCDate(unlock.getUTCDate() - 10);
  const unlockISO = unlock.toISOString().slice(0, 10);

  return todayISO >= unlockISO;
}

function intervalRule(
  type: "SHIFT" | "ABSENCE",
  startMin: number,
  endMin: number
) {
  if (!Number.isFinite(startMin) || !Number.isFinite(endMin))
    return "Horário inválido.";
  if (startMin < 0 || endMin > 1440 || startMin >= endMin)
    return "Intervalo inválido.";

  // ausência dia inteiro
  if (type === "ABSENCE" && startMin === 0 && endMin === 1440) return null;

  const OPEN = 7 * 60;
  const CLOSE = 22 * 60;
  if (startMin < OPEN || endMin > CLOSE)
    return "Fora do horário (07:00–22:00).";

  if (type === "SHIFT") {
    const dur = endMin - startMin;
    const isFive =
      (startMin === 7 * 60 && endMin === 12 * 60) ||
      (startMin === 12 * 60 && endMin === 17 * 60) ||
      (startMin === 17 * 60 && endMin === 22 * 60);
    const isOne = dur === 60;

    if (!isFive && !isOne) {
      return "Turno deve ser bloco de 5h (07–12, 12–17, 17–22) ou bloco de 1h.";
    }
  }

  // ausência: aceita qualquer intervalo, mas sugiro 1h em 1h (UI resolve)
  return null;
}

async function getMembersWithColors(team: string) {
  const users = await prisma.user.findMany({
    where: { team },
    select: { id: true, name: true, login: true },
    orderBy: { name: "asc" },
  });

  const colors = await prisma.agendaMemberColor.findMany({
    where: { team },
    select: { userId: true, colorHex: true },
  });

  const map = new Map(colors.map((c) => [c.userId, c.colorHex]));
  const palette = [
    "#2563EB",
    "#DC2626",
    "#16A34A",
    "#9333EA",
    "#EA580C",
    "#0D9488",
    "#DB2777",
    "#4B5563",
  ];

  function pickColor(uid: string) {
    let h = 0;
    for (let i = 0; i < uid.length; i++) h = (h * 31 + uid.charCodeAt(i)) >>> 0;
    return palette[h % palette.length];
  }

  return users.map((u) => ({
    ...u,
    colorHex: map.get(u.id) || pickColor(u.id),
  }));
}

function overlap(aStart: number, aEnd: number, bStart: number, bEnd: number) {
  return aStart < bEnd && aEnd > bStart;
}

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const url = new URL(req.url);

    const mes = url.searchParams.get("mes") || "";
    const de = url.searchParams.get("de") || "";
    const ate = url.searchParams.get("ate") || "";

    let startISO = "";
    let endISO = "";

    if (mes) {
      const ym = brMonthToYM(mes);
      if (!ym) return bad("Parâmetro 'mes' inválido. Use MM/AAAA.");
      const days = daysInMonthYM(ym);
      startISO = `${ym}-01`;
      endISO = `${ym}-${String(days).padStart(2, "0")}`;
    } else if (de && ate) {
      startISO = brToISO(de);
      endISO = brToISO(ate);
      if (!startISO || !endISO)
        return bad("Use 'de' e 'ate' no formato DD/MM/AAAA.");
      if (startISO > endISO) return bad("'de' não pode ser maior que 'ate'.");
    } else {
      return bad("Informe 'mes=MM/AAAA' OU 'de=DD/MM/AAAA&ate=DD/MM/AAAA'.");
    }

    const [members, events] = await Promise.all([
      getMembersWithColors(session.team),
      prisma.agendaEvent.findMany({
        where: {
          team: session.team,
          status: "ACTIVE",
          dateISO: { gte: startISO, lte: endISO },
        },
        include: {
          user: { select: { id: true, name: true, login: true } },
          createdBy: { select: { id: true, name: true, login: true } },
        },
        orderBy: [{ dateISO: "asc" }, { startMin: "asc" }],
      }),
    ]);

    const eventsOut = events.map((e) => ({
      id: e.id,
      team: e.team,
      type: e.type,
      status: e.status,
      dateISO: e.dateISO,
      dateBR: isoToBR(e.dateISO),
      startMin: e.startMin,
      endMin: e.endMin,
      startHHMM: fmtMin(e.startMin),
      endHHMM: fmtMin(e.endMin),
      note: e.note || "",
      user: e.user,
      createdBy: e.createdBy,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
    }));

    return ok({ members, events: eventsOut });
  } catch (e: any) {
    return bad(e?.message || "Erro interno.", 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const body = await req.json().catch(() => null);
    if (!body) return bad("JSON inválido.");

    const type = String(body.type || "").toUpperCase() as "SHIFT" | "ABSENCE";
    if (type !== "SHIFT" && type !== "ABSENCE")
      return bad("type deve ser SHIFT ou ABSENCE.");

    const dateBR = String(body.date || "").trim();
    const dateISO = brToISO(dateBR);
    if (!dateISO) return bad("Data inválida. Use DD/MM/AAAA.");

    const ym = dateISO.slice(0, 7);
    if (!canEditMonth(ym)) {
      return bad("Cadastro/edição não liberados para este mês ainda.", 403);
    }

    // ✅ Corrigido: Session não tem userId. Use body.userId ou session.id.
    const userId = String(body.userId || session.id || "").trim() || session.id;
    const note = String(body.note || "").trim() || null;

    let startMin = 0;
    let endMin = 0;

    if (type === "ABSENCE" && body.allDay) {
      startMin = 0;
      endMin = 1440;
    } else {
      startMin = parseHHMM(String(body.start || "").trim());
      endMin = parseHHMM(String(body.end || "").trim());
    }

    const ruleErr = intervalRule(type, startMin, endMin);
    if (ruleErr) return bad(ruleErr);

    // conflitos (mesmo user + mesma data)
    const existing = await prisma.agendaEvent.findMany({
      where: { team: session.team, status: "ACTIVE", dateISO, userId },
      select: { id: true, type: true, startMin: true, endMin: true },
    });

    for (const e of existing) {
      if (overlap(startMin, endMin, e.startMin, e.endMin)) {
        return bad(
          `Conflito com ${
            e.type === "SHIFT" ? "turno" : "ausência"
          } existente (${fmtMin(e.startMin)}–${fmtMin(e.endMin)}).`
        );
      }
    }

    const created = await prisma.agendaEvent.create({
      data: {
        team: session.team,
        type,
        status: "ACTIVE",
        dateISO,
        startMin,
        endMin,
        note,
        userId,
        createdById: session.id,
        audits: {
          create: {
            team: session.team,
            action: "CREATE",
            actorId: session.id,
            toUserId: userId,
            toStartMin: startMin,
            toEndMin: endMin,
            note: note || undefined,
          },
        },
      },
    });

    return ok({ id: created.id });
  } catch (e: any) {
    return bad(e?.message || "Erro interno.", 500);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await requireSession();
    const url = new URL(req.url);
    const id = url.searchParams.get("id") || "";
    if (!id) return bad("Informe ?id=...");

    const body = await req.json().catch(() => null);
    if (!body) return bad("JSON inválido.");

    const existing = await prisma.agendaEvent.findFirst({
      where: { id, team: session.team },
      select: {
        id: true,
        userId: true,
        dateISO: true,
        startMin: true,
        endMin: true,
        type: true,
        status: true,
      },
    });
    if (!existing) return bad("Evento não encontrado.", 404);
    if (existing.status !== "ACTIVE")
      return bad("Evento já está cancelado.", 400);

    const ym = existing.dateISO.slice(0, 7);
    if (!canEditMonth(ym))
      return bad("Edição não liberada para este mês ainda.", 403);

    // troca/re-atribuição
    if (body.swapToUserId) {
      const toUserId = String(body.swapToUserId || "").trim();
      if (!toUserId) return bad("swapToUserId inválido.");

      // conflito com agenda do destino
      const destEvents = await prisma.agendaEvent.findMany({
        where: {
          team: session.team,
          status: "ACTIVE",
          dateISO: existing.dateISO,
          userId: toUserId,
        },
        select: { startMin: true, endMin: true },
      });
      for (const e of destEvents) {
        if (overlap(existing.startMin, existing.endMin, e.startMin, e.endMin)) {
          return bad("Conflito: o destino já tem evento nesse horário.");
        }
      }

      await prisma.agendaEvent.update({
        where: { id },
        data: {
          userId: toUserId,
          audits: {
            create: {
              team: session.team,
              action: "SWAP",
              actorId: session.id,
              fromUserId: existing.userId,
              toUserId,
              fromStartMin: existing.startMin,
              fromEndMin: existing.endMin,
              toStartMin: existing.startMin,
              toEndMin: existing.endMin,
              note: String(body.note || "").trim() || undefined,
            },
          },
        },
      });

      return ok({ id });
    }

    // edição normal (horário/nota)
    const nextNote =
      body.note !== undefined ? String(body.note || "").trim() || null : undefined;

    let nextStart = existing.startMin;
    let nextEnd = existing.endMin;

    if (body.allDay && existing.type === "ABSENCE") {
      nextStart = 0;
      nextEnd = 1440;
    } else {
      if (body.start) nextStart = parseHHMM(String(body.start));
      if (body.end) nextEnd = parseHHMM(String(body.end));
    }

    const ruleErr = intervalRule(existing.type as any, nextStart, nextEnd);
    if (ruleErr) return bad(ruleErr);

    // conflito com outros eventos do próprio user (exclui ele mesmo)
    const conflicts = await prisma.agendaEvent.findMany({
      where: {
        team: session.team,
        status: "ACTIVE",
        dateISO: existing.dateISO,
        userId: existing.userId,
        NOT: { id: existing.id },
      },
      select: { startMin: true, endMin: true, type: true },
    });

    for (const e of conflicts) {
      if (overlap(nextStart, nextEnd, e.startMin, e.endMin)) {
        return bad("Conflito com outro evento do mesmo usuário.");
      }
    }

    await prisma.agendaEvent.update({
      where: { id },
      data: {
        startMin: nextStart,
        endMin: nextEnd,
        note: nextNote,
        audits: {
          create: {
            team: session.team,
            action: "UPDATE",
            actorId: session.id,
            fromStartMin: existing.startMin,
            fromEndMin: existing.endMin,
            toStartMin: nextStart,
            toEndMin: nextEnd,
            note: nextNote || undefined,
          },
        },
      },
    });

    return ok({ id });
  } catch (e: any) {
    return bad(e?.message || "Erro interno.", 500);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await requireSession();
    const url = new URL(req.url);
    const id = url.searchParams.get("id") || "";
    if (!id) return bad("Informe ?id=...");

    const existing = await prisma.agendaEvent.findFirst({
      where: { id, team: session.team },
      select: {
        id: true,
        dateISO: true,
        userId: true,
        startMin: true,
        endMin: true,
        status: true,
      },
    });
    if (!existing) return bad("Evento não encontrado.", 404);
    if (existing.status !== "ACTIVE") return ok({ id }); // idempotente

    const ym = existing.dateISO.slice(0, 7);
    if (!canEditMonth(ym))
      return bad("Exclusão não liberada para este mês ainda.", 403);

    await prisma.agendaEvent.update({
      where: { id },
      data: {
        status: "CANCELED",
        canceledAt: new Date(),
        canceledById: session.id,
        audits: {
          create: {
            team: session.team,
            action: "DELETE",
            actorId: session.id,
            fromUserId: existing.userId,
            fromStartMin: existing.startMin,
            fromEndMin: existing.endMin,
          },
        },
      },
    });

    return ok({ id });
  } catch (e: any) {
    return bad(e?.message || "Erro interno.", 500);
  }
}
