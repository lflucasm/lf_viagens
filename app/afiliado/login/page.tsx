import { redirect } from "next/navigation";
import { getAffiliateSessionServer } from "@/lib/affiliates/session";
import AffiliateLoginClient from "./AffiliateLoginClient";

export const dynamic = "force-dynamic";

export default async function Page() {
  const session = await getAffiliateSessionServer();
  if (session) redirect("/afiliado/dashboard");
  return <AffiliateLoginClient />;
}
