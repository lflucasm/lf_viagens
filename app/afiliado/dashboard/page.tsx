import { redirect } from "next/navigation";
import { getAffiliateSessionServer } from "@/lib/affiliates/session";
import AffiliateDashboardClient from "./AffiliateDashboardClient";

export const dynamic = "force-dynamic";

export default async function Page() {
  const session = await getAffiliateSessionServer();
  if (!session) redirect("/afiliado/login?next=/afiliado/dashboard");
  return <AffiliateDashboardClient />;
}
