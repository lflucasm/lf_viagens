import { Suspense } from "react";
import CedenteCommissionsClient from "./CedenteCommissionsClient";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Comissões · Cedentes</h1>
          <p className="text-sm text-neutral-500">
            Filtre, confira e marque como paga/cancelada.
          </p>
        </div>
      </div>

      <Suspense fallback={<div className="text-sm text-neutral-500">Carregando...</div>}>
        <CedenteCommissionsClient />
      </Suspense>
    </div>
  );
}
