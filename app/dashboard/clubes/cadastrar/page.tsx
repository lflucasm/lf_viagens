import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/auth-server";
import ClubesClient from "./ClubesClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const toISO = (d: Date) => d.toISOString();
const toISOOpt = (d: Date | null) => (d ? d.toISOString() : null);

export default async function Page() {
  const session = await getSessionFromCookies();
  if (!session?.user) redirect("/login?next=/dashboard/clube"); // ajuste se tua rota for /dashboard/clubes

  const team = session.user.team;

  const cedentes = await prisma.cedente.findMany({
    where: { owner: { team } },
    select: { id: true, identificador: true, nomeCompleto: true, cpf: true },
    orderBy: [{ nomeCompleto: "asc" }],
  });

  const clubesRaw = await prisma.clubSubscription.findMany({
    where: { team },
    include: {
      cedente: {
        select: { id: true, identificador: true, nomeCompleto: true, cpf: true },
      },
    },
    orderBy: [{ subscribedAt: "desc" }, { createdAt: "desc" }],
  });

  // ✅ aqui é o ajuste que resolve o erro
  const clubes = clubesRaw.map((c) => ({
    ...c,
    subscribedAt: toISO(c.subscribedAt), // ✅ obrigatório (string)
    lastRenewedAt: toISOOpt(c.lastRenewedAt),
    pointsExpireAt: toISOOpt(c.pointsExpireAt),
    smilesBonusEligibleAt: toISOOpt(c.smilesBonusEligibleAt),
    createdAt: toISO(c.createdAt), // ✅ obrigatório (string)
    updatedAt: toISO(c.updatedAt), // ✅ obrigatório (string)
  }));

  return <ClubesClient initialCedentes={cedentes} initialClubes={clubes} />;
}
