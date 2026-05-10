import { prisma } from "@/lib/prisma";
import { reassignEmployeeScopedData } from "@/lib/reassign-staff-exit";

/** Logins de demo usuais (não inclui `lucas_fellype`). */
export const DEFAULT_DEMO_STAFF_LOGINS = ["eduarda", "paola", "lucas"] as const;

const PROTECTED_LOGINS = new Set(["lucas_fellype", "jephesson"]);

function norm(s: string) {
  return String(s ?? "").trim().toLowerCase();
}

async function assertNotLastAdminOfTeam(team: string, userId: string) {
  const u = await prisma.user.findFirst({
    where: { id: userId, team },
    select: { role: true },
  });
  if (!u || u.role !== "admin") return;
  const others = await prisma.user.count({
    where: { team, role: "admin", NOT: { id: userId } },
  });
  if (others < 1) {
    const e = new Error("LAST_ADMIN");
    (e as Error & { code?: string }).code = "LAST_ADMIN";
    throw e;
  }
}

export type RemoveStaffResult = {
  removed: string[];
  skipped: string[];
  errors: { login: string; error: string }[];
};

/**
 * Remove usuários por login: realoca dados bloqueantes para `reassignmentUserId` e apaga.
 * Não remove `lucas_fellype` nem `jephesson` nem o próprio `actingUserId`.
 */
export async function removeStaffUsersByLogins(opts: {
  logins: string[];
  reassignmentUserId: string;
  actingUserId: string;
}): Promise<RemoveStaffResult> {
  const removed: string[] = [];
  const skipped: string[] = [];
  const errors: { login: string; error: string }[] = [];

  const acting = await prisma.user.findUnique({
    where: { id: opts.actingUserId },
    select: { login: true },
  });
  const actingLoginNorm = acting ? norm(acting.login) : "";

  for (const raw of opts.logins) {
    const login = norm(raw);
    if (!login) continue;

    if (PROTECTED_LOGINS.has(login)) {
      skipped.push(`${login} (protegido)`);
      continue;
    }
    if (actingLoginNorm && login === actingLoginNorm) {
      skipped.push(`${login} (é você)`);
      continue;
    }

    const target = await prisma.user.findUnique({
      where: { login },
      select: { id: true, team: true, role: true, login: true },
    });

    if (!target) {
      skipped.push(`${login} (inexistente)`);
      continue;
    }

    if (target.id === opts.actingUserId) {
      skipped.push(`${login} (é você)`);
      continue;
    }

    try {
      await reassignEmployeeScopedData(prisma, {
        fromUserId: target.id,
        toUserId: opts.reassignmentUserId,
      });
      await assertNotLastAdminOfTeam(target.team, target.id);
      await prisma.user.delete({ where: { id: target.id } });
      removed.push(target.login);
    } catch (e: unknown) {
      const code = (e as { code?: string })?.code;
      const msg = e instanceof Error ? e.message : String(e);
      if (code === "LAST_ADMIN" || msg === "LAST_ADMIN") {
        errors.push({ login, error: "É o único administrador desse time — não removido." });
      } else if (code === "P2003") {
        errors.push({
          login,
          error: "Ainda há vínculo no banco (FK). Detalhe no log do servidor.",
        });
      } else {
        errors.push({ login, error: msg });
      }
    }
  }

  return { removed, skipped, errors };
}
