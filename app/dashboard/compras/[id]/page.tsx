import NovaCompraClient from "../nova/NovaCompraClient";

export const dynamic = "force-dynamic";

export default function Page({
  params,
}: {
  params: { id: string };
}) {
  return <NovaCompraClient purchaseId={params.id} />;
}
