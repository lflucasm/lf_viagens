import WalletLatamClient from "./wallet-latam-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function WalletPage() {
  return (
    <div className="p-4 md:p-6">
      <div className="mb-4">
        <h1 className="text-xl font-semibold">Wallet — LATAM</h1>
        <p className="text-sm text-muted-foreground">
          Selecione um cedente, informe o valor (R$) e salve. A soma total fica
          no topo.
        </p>
      </div>

      <WalletLatamClient />
    </div>
  );
}
