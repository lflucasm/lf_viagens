/**
 * One-off (produção / staging): remove contas de demo `eduarda`, `paola`, `lucas`
 * (login normalizado em minúsculas; não afeta `lucas_fellype`).
 *
 * - Realoca FKs com onDelete Restrict antes do DELETE.
 * - Remove links/leads VIP WhatsApp do funcionário (leads em cascata removem pagamentos).
 * - Define `lucas_fellype` como admin com time "LF Viagens".
 * - Define `jephesson` como developer com time "LF Viagens".
 * - Migra usuários com time legado (ex.: `@vias_aereas`) para "LF Viagens" — único time
 *   usado pelo sistema.
 *
 * Uso:
 *   DATABASE_URL="postgresql://..." node scripts/remove-demo-staff-and-normalize.mjs
 *   node --env-file=.env scripts/remove-demo-staff-and-normalize.mjs
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const norm = (s) => String(s ?? "").trim().toLowerCase();

const REMOVE_LOGINS = ["eduarda", "paola", "lucas"];
const ADMIN_LOGIN = "lucas_fellype";
const DEV_LOGIN = "jephesson";
const TEAM_LF = "LF Viagens";
/** Valores antigos de `team` no banco; todo mundo deve ficar em TEAM_LF. */
const LEGACY_TEAMS = ["@vias_aereas", "vias_aereas"];

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL ausente.");
    process.exit(1);
  }

  const pool = new Pool({ connectionString: url });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    const admin = await prisma.user.findUnique({
      where: { login: norm(ADMIN_LOGIN) },
      select: { id: true },
    });
    if (!admin) {
      console.error(`Usuário admin "${ADMIN_LOGIN}" não encontrado.`);
      process.exit(1);
    }

    for (const login of REMOVE_LOGINS) {
      const u = await prisma.user.findUnique({
        where: { login: norm(login) },
        select: { id: true, login: true },
      });
      if (!u) {
        console.log(`[skip] login inexistente: ${login}`);
        continue;
      }

      console.log(`[remove] ${u.login} (${u.id})`);

      await prisma.cedente.updateMany({
        where: { ownerId: u.id },
        data: { ownerId: admin.id },
      });

      await prisma.dividaAReceber.updateMany({
        where: { ownerId: u.id },
        data: { ownerId: admin.id },
      });

      await prisma.vipWhatsappLead.deleteMany({
        where: { employeeId: u.id },
      });
      await prisma.vipWhatsappLink.deleteMany({
        where: { employeeId: u.id },
      });
      await prisma.vipWhatsappRateioShare.deleteMany({
        where: { employeeId: u.id },
      });

      await prisma.agendaEvent.updateMany({
        where: { createdById: u.id },
        data: { createdById: admin.id },
      });
      await prisma.agendaAudit.updateMany({
        where: { actorId: u.id },
        data: { actorId: admin.id },
      });
      await prisma.anotacao.updateMany({
        where: { createdById: u.id },
        data: { createdById: admin.id },
      });
      await prisma.consolidatorSale.updateMany({
        where: { createdById: u.id },
        data: { createdById: admin.id },
      });

      await prisma.user.delete({ where: { id: u.id } });
      console.log(`[ok] removido: ${u.login}`);
    }

    await prisma.user.update({
      where: { login: norm(ADMIN_LOGIN) },
      data: { team: TEAM_LF, role: "admin" },
    });
    await prisma.user.update({
      where: { login: norm(DEV_LOGIN) },
      data: { team: TEAM_LF, role: "developer" },
    });

    const migrated = await prisma.user.updateMany({
      where: { team: { in: LEGACY_TEAMS } },
      data: { team: TEAM_LF },
    });
    if (migrated.count > 0) {
      console.log(`[team] ${migrated.count} usuário(s) migrados para "${TEAM_LF}" (times legados).`);
    }

    console.log(`Concluído: ${ADMIN_LOGIN} (admin) e ${DEV_LOGIN} (developer) no time "${TEAM_LF}".`);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
