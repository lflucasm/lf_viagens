// app/dashboard/contas-selecionadas/livelo/aniversario/page.tsx
import { prisma } from "@/lib/prisma";
import { getSessionServer } from "@/lib/auth-server";

export const dynamic = "force-dynamic";

const TZ = "America/Sao_Paulo";

function monthNumberInTZ(date: Date, tz: string) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, month: "numeric" }).formatToParts(
    date
  );
  const m = parts.find((p) => p.type === "month")?.value;
  return Number(m || 0);
}

function dayNumberInTZ(date: Date, tz: string) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, day: "numeric" }).formatToParts(
    date
  );
  const d = parts.find((p) => p.type === "day")?.value;
  return Number(d || 0);
}

function monthLabelNow(tz: string) {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: tz, month: "long", year: "numeric" }).format(
    new Date()
  );
}

function fmtBirth(date: Date, tz: string) {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: tz, day: "2-digit", month: "2-digit" }).format(
    date
  );
}

function maskCpf(cpf: string) {
  const d = (cpf || "").replace(/\D+/g, "").slice(0, 11);
  if (d.length !== 11) return cpf || "—";
  return `***.***.${d.slice(6, 9)}-${d.slice(9, 11)}`;
}

export default async function Page() {
  const session = await getSessionServer();

  if (!session?.id) {
    return <div className="p-6 text-sm text-red-600">Não autenticado.</div>;
  }

  const rows = await prisma.cedente.findMany({
    where: {
      status: "APPROVED",
      dataNascimento: { not: null },
      owner: { team: session.team },
    },
    select: {
      id: true,
      nomeCompleto: true,
      cpf: true,
      dataNascimento: true,
      owner: { select: { name: true, login: true } },
    },
  });

  const currentMonth = monthNumberInTZ(new Date(), TZ);

  const aniversariantes = rows
    .filter((r) => r.dataNascimento && monthNumberInTZ(r.dataNascimento, TZ) === currentMonth)
    .sort((a, b) => {
      const da = a.dataNascimento ? dayNumberInTZ(a.dataNascimento, TZ) : 0;
      const db = b.dataNascimento ? dayNumberInTZ(b.dataNascimento, TZ) : 0;
      if (da !== db) return da - db;
      return a.nomeCompleto.localeCompare(b.nomeCompleto);
    });

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Aniversariantes • Livelo</h1>
        <p className="text-sm text-zinc-600">
          Mês atual: <b className="font-medium capitalize">{monthLabelNow(TZ)}</b>
        </p>
      </div>

      <div className="rounded border border-zinc-200 bg-white overflow-x-auto">
        <table className="min-w-[760px] w-full text-sm">
          <thead className="bg-zinc-50">
            <tr className="text-left">
              <th className="p-3">Cedente</th>
              <th className="p-3">Data</th>
              <th className="p-3">CPF</th>
              <th className="p-3">Responsável</th>
            </tr>
          </thead>
          <tbody>
            {aniversariantes.length === 0 ? (
              <tr>
                <td className="p-4 text-zinc-600" colSpan={4}>
                  Nenhum aniversariante neste mês.
                </td>
              </tr>
            ) : (
              aniversariantes.map((r) => (
                <tr key={r.id} className="border-t border-zinc-100">
                  <td className="p-3">
                    <div className="font-medium">{r.nomeCompleto}</div>
                  </td>
                  <td className="p-3">{r.dataNascimento ? fmtBirth(r.dataNascimento, TZ) : "—"}</td>
                  <td className="p-3">{maskCpf(r.cpf)}</td>
                  <td className="p-3">
                    {r.owner?.name ?? "—"}{" "}
                    <span className="text-xs text-zinc-500">@{r.owner?.login ?? "—"}</span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
