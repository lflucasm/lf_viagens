import "server-only";
import { requireSession } from "@/lib/auth-server";
import { isAdminRole } from "@/lib/session-roles";

export async function requireAdminSession() {
  const sess = await requireSession();
  if (!isAdminRole(sess.role)) {
    const err = new Error("FORBIDDEN");
    (err as Error & { code?: string }).code = "FORBIDDEN";
    throw err;
  }
  return sess;
}
