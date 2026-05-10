import { redirect } from "next/navigation";
import { getSessionServer } from "@/lib/auth-server";
import { isAdminRole } from "@/lib/session-roles";
import ConfiguracoesClient from "./ConfiguracoesClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ConfiguracoesPage() {
  const s = await getSessionServer();
  if (!s) redirect("/login?next=/dashboard/configuracoes");
  if (!isAdminRole(s.role)) redirect("/dashboard");
  return <ConfiguracoesClient />;
}
