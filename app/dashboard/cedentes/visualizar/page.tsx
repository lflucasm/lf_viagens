export const dynamic = "force-dynamic";

import CedentesVisualizarClient from "./CedentesVisualizarClient";
import CedentesVisualizarLatamClient from "./CedentesVisualizarLatamClient";
import CedentesVisualizarSmilesClient from "./CedentesVisualizarSmilesClient";
import CedentesVisualizarLiveloClient from "./cedentes-visualizar-livelo-client";
import CedentesVisualizarEsferaClient from "./CedentesVisualizarEsferaClient";

type SearchParams = { [key: string]: string | string[] | undefined };

function firstParam(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

export default async function Page({
  searchParams,
}: {
  searchParams: SearchParams | Promise<SearchParams>;
}) {
  const sp = await Promise.resolve(searchParams);

  const programaRaw =
    firstParam(sp.programa) || firstParam(sp.program) || firstParam(sp.p);

  const p = (programaRaw || "").toLowerCase();

  if (p === "latam") return <CedentesVisualizarLatamClient />;
  if (p === "smiles") return <CedentesVisualizarSmilesClient />;
  if (p === "livelo") return <CedentesVisualizarLiveloClient />;
  if (p === "esfera") return <CedentesVisualizarEsferaClient />;

  // default: lista geral (todos)
  return <CedentesVisualizarClient />;
}
