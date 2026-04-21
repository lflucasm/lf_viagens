import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { clampInt, endOfYearExclusive, passengerLimit, pointsField, startOfYear } from "../../_helpers/sales";

type Program = "LATAM" | "SMILES" | "LIVELO" | "ESFERA";

function scoreMedia(score?: {
  rapidezBiometria?: number;
  rapidezSms?: number;
  resolucaoProblema?: number;
  confianca?: number;
} | null) {
  const a = Number(score?.rapidezBiometria || 0);
  const b = Number(score?.rapidezSms || 0);
  const c = Number(score?.resolucaoProblema || 0);
  const d = Number(score?.confianca || 0);
  const avg = (a + b + c + d) / 4;
  return Math.round(avg * 100) / 100;
}

function priorityBucket(leftover: number) {
  if (leftover >= 0 && leftover <= 2000) return { bucket: 0, label: "MAX" as const };
  if (leftover >= 3000 && leftover <= 10000) return { bucket: 3, label: "BAIXA" as const };
  if (leftover > 10000) return { bucket: 1, label: "OK" as const };
  return { bucket: 2, label: "MEIO" as const };
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  const program = (searchParams.get("program") || "") as Program;
  const pointsNeeded = clampInt(searchParams.get("points"));
  const passengersNeeded = clampInt(searchParams.get("passengers"));

  if (!["LATAM", "SMILES", "LIVELO", "ESFERA"].includes(program)) {
    return NextResponse.json({ ok: false, error: "program inválido" }, { status: 400 });
  }
  if (pointsNeeded <= 0 || passengersNeeded <= 0) {
    return NextResponse.json({ ok: true, suggestions: [] });
  }

  const yearStart = startOfYear();
  const yearEnd = endOfYearExclusive();
  const paxLimit = passengerLimit(program);

  // bloqueios ABERTOS para esse programa
  const blocked = await prisma.blockedAccount.findMany({
    where: { status: "OPEN", program },
    select: { cedenteId: true },
  });
  const blockedSet = new Set(blocked.map((b) => b.cedenteId));

  // contagem anual de passageiros (soma passengersCount)
  const usage = await prisma.emissionEvent.groupBy({
    by: ["cedenteId"],
    where: { program, issuedAt: { gte: yearStart, lt: yearEnd } },
    _sum: { passengersCount: true },
  });
  const usedMap = new Map<string, number>();
  for (const u of usage) usedMap.set(u.cedenteId, clampInt(u._sum.passengersCount));

  // cedentes aprovados
  const cedentes = await prisma.cedente.findMany({
    where: { status: "APPROVED" },
    select: {
      id: true,
      identificador: true,
      nomeCompleto: true,
      cpf: true,
      pontosLatam: true,
      pontosSmiles: true,
      pontosLivelo: true,
      pontosEsfera: true,
      biometriaHorario: {
        select: {
          turnoManha: true,
          turnoTarde: true,
          turnoNoite: true,
        },
      },
      score: {
        select: {
          rapidezBiometria: true,
          rapidezSms: true,
          resolucaoProblema: true,
          confianca: true,
        },
      },
      owner: { select: { id: true, name: true, login: true } },
    },
    take: 3000,
  });

  const field = pointsField(program) as "pontosLatam" | "pontosSmiles" | "pontosLivelo" | "pontosEsfera";

  const rows = cedentes
    .filter((c) => !blockedSet.has(c.id))
    .map((c) => {
      const ptsByProgram: Record<typeof field, number> = {
        pontosLatam: c.pontosLatam,
        pontosSmiles: c.pontosSmiles,
        pontosLivelo: c.pontosLivelo,
        pontosEsfera: c.pontosEsfera,
      };
      const pts = clampInt(ptsByProgram[field]);
      const used = usedMap.get(c.id) || 0;
      const availablePax = Math.max(0, paxLimit - used);

      const leftoverPoints = pts - pointsNeeded;
      const leftoverPax = availablePax - passengersNeeded;

      const hasPts = pts >= pointsNeeded;
      const hasPax = availablePax >= passengersNeeded;

      const alertPassengerOverflow = !hasPax;
      const eligible = hasPts;

      const pri = priorityBucket(leftoverPoints);

      return {
        cedente: {
          id: c.id,
          identificador: c.identificador,
          nomeCompleto: c.nomeCompleto,
          cpf: c.cpf,
          scoreMedia: scoreMedia(c.score),
          biometriaHorario: c.biometriaHorario
            ? {
                turnoManha: Boolean(c.biometriaHorario.turnoManha),
                turnoTarde: Boolean(c.biometriaHorario.turnoTarde),
                turnoNoite: Boolean(c.biometriaHorario.turnoNoite),
              }
            : null,
          owner: c.owner,
        },
        program,
        pointsNeeded,
        passengersNeeded,
        pts,
        paxLimit,
        usedPassengersYear: used,
        availablePassengersYear: availablePax,
        leftoverPoints,
        leftoverPax,
        eligible,
        priorityBucket: hasPts ? pri.bucket : 99,
        priorityLabel: hasPts ? pri.label : ("INELIGIVEL" as const),
        alerts: [
          ...(alertPassengerOverflow ? ["PASSAGEIROS_ESTOURADOS_COM_PONTOS"] : []),
          ...(hasPts ? [] : ["PONTOS_INSUFICIENTES"]),
        ],
      };
    });

  // sort: elegíveis por bucket e sobrar menos; depois ineligíveis
  rows.sort((a, b) => {
    if (a.priorityBucket !== b.priorityBucket) return a.priorityBucket - b.priorityBucket;
    return a.leftoverPoints - b.leftoverPoints;
  });

  return NextResponse.json({ ok: true, suggestions: rows.slice(0, 60) });
}
