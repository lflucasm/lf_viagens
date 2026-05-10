import type { PrismaClient } from "@prisma/client";

/**
 * Realoca dados “presos” em onDelete Restrict antes de apagar um usuário.
 * Espelha a lógica de `scripts/remove-demo-staff-and-normalize.mjs`.
 */
export async function reassignEmployeeScopedData(
  prisma: PrismaClient,
  args: { fromUserId: string; toUserId: string }
) {
  const { fromUserId, toUserId } = args;
  if (fromUserId === toUserId) return;

  await prisma.cedente.updateMany({
    where: { ownerId: fromUserId },
    data: { ownerId: toUserId },
  });

  await prisma.dividaAReceber.updateMany({
    where: { ownerId: fromUserId },
    data: { ownerId: toUserId },
  });

  await prisma.vipWhatsappLead.deleteMany({
    where: { employeeId: fromUserId },
  });
  await prisma.vipWhatsappLink.deleteMany({
    where: { employeeId: fromUserId },
  });
  await prisma.vipWhatsappRateioShare.deleteMany({
    where: { employeeId: fromUserId },
  });

  await prisma.agendaEvent.updateMany({
    where: { userId: fromUserId },
    data: { userId: toUserId },
  });
  await prisma.agendaEvent.updateMany({
    where: { createdById: fromUserId },
    data: { createdById: toUserId },
  });
  await prisma.agendaAudit.updateMany({
    where: { actorId: fromUserId },
    data: { actorId: toUserId },
  });

  await prisma.agendaMemberColor.deleteMany({
    where: { userId: fromUserId },
  });

  await prisma.anotacao.updateMany({
    where: { createdById: fromUserId },
    data: { createdById: toUserId },
  });

  await prisma.consolidatorSale.updateMany({
    where: { createdById: fromUserId },
    data: { createdById: toUserId },
  });

  await prisma.cliente.updateMany({
    where: { createdById: fromUserId },
    data: { createdById: toUserId },
  });
}
