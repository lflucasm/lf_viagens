import { prisma } from "@/lib/prisma";

function pad5(n: number) {
  return String(n).padStart(5, "0");
}

/**
 * Gera número sequencial: ID00001, ID00002...
 * Usa tabela Counter (key/value).
 */
export async function nextNumeroCompra() {
  const counter = await prisma.counter.upsert({
    where: { key: "purchase" },
    create: { key: "purchase", value: 1 },
    update: { value: { increment: 1 } },
    select: { value: true },
  });

  return `ID${pad5(counter.value)}`;
}
