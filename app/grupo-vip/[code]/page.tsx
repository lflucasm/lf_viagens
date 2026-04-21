import VipPublicSignupClient from "./vip-public-signup-client";

export const dynamic = "force-dynamic";

export default async function Page({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  return <VipPublicSignupClient code={code} />;
}
