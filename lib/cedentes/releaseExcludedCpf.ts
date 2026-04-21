export async function releaseExcludedCpfIfNeeded(
  db: {
    cedente: {
      findUnique: Function;
      update: Function;
    };
    cedenteExclusion: {
      findFirst: Function;
    };
  },
  cpf: string
) {
  const normalizedCpf = String(cpf || "").replace(/\D+/g, "").slice(0, 11);
  if (normalizedCpf.length !== 11) return;

  const existing = await db.cedente.findUnique({
    where: { cpf: normalizedCpf },
    select: { id: true, status: true },
  });

  if (!existing || existing.status !== "REJECTED") return;

  const accountExclusion = await db.cedenteExclusion.findFirst({
    where: {
      cedenteId: existing.id,
      scope: "ACCOUNT",
    },
    select: { id: true },
  });

  if (!accountExclusion) return;

  await db.cedente.update({
    where: { id: existing.id },
    data: { cpf: `EXCL-${existing.id}` },
  });
}
