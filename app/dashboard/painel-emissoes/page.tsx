// app/dashboard/painel-emissoes/page.tsx

import PainelEmissoesClient from "./PainelEmissoesClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;

function getOne(sp: SP, key: string) {
  const v = sp[key];
  return Array.isArray(v) ? v[0] || "" : v || "";
}

function normalizeProgram(v: string) {
  const p = String(v || "").toLowerCase().trim();
  return p === "latam" || p === "smiles" || p === "livelo" || p === "esfera"
    ? p
    : "latam";
}

export default function Page({ searchParams }: { searchParams: SP }) {
  const program = normalizeProgram(getOne(searchParams, "programa"));
  return <PainelEmissoesClient initialProgram={program} />;
}
