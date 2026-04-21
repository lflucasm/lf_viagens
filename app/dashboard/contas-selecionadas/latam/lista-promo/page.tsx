"use client";

import { useEffect, useMemo, useState } from "react";
import { Copy, KeyRound, MessageCircle, X } from "lucide-react";

type PromoStatus = "PENDING" | "ELIGIBLE" | "DENIED" | "USED";

type Item = {
  id: string;
  listDate: string;
  status: PromoStatus;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  usedAt: string | null;
  scoreMedia: number;
  cedente: {
    id: string;
    identificador: string;
    nomeCompleto: string;
    cpf: string;
    telefone?: string | null;
    pontosLatam: number;
    pontosLivelo: number;
    paxDisponivel: number;
    owner: { id: string; name: string; login: string };
  };
  addedBy: null | { id: string; name: string; login: string };
  reviewedBy: null | { id: string; name: string; login: string };
};

type SortBy = "ALPHA" | "SCORE" | "LATAM" | "LIVELO" | "PAX";

type ApiResp = {
  ok: true;
  listDate: string;
  today: string;
  recentDates: string[];
  summary: {
    total: number;
    pending: number;
    eligible: number;
    denied: number;
    used: number;
  };
  groups: {
    eligible: Item[];
    pending: Item[];
    denied: Item[];
    used: Item[];
  };
};

type CredentialsState = {
  cedenteId: string;
  nomeCompleto: string;
  identificador: string;
  cpf: string;
  email: string | null;
  senhaEmail: string | null;
  senhaLatam: string | null;
  senhaLivelo: string | null;
};

function fmtInt(n: number) {
  return new Intl.NumberFormat("pt-BR").format(n || 0);
}

function maskCpf(cpf: string) {
  const d = (cpf || "").replace(/\D+/g, "").slice(0, 11);
  if (d.length !== 11) return cpf;
  return `***.***.${d.slice(6, 9)}-${d.slice(9, 11)}`;
}

function whatsappHref(telefone?: string | null) {
  let d = String(telefone || "").replace(/\D+/g, "");
  if (!d) return null;

  while (d.startsWith("00")) d = d.slice(2);
  if (d.length === 10 || d.length === 11) d = `55${d}`;
  if (d.length < 12) return null;

  return `https://wa.me/${d}`;
}

function dateBR(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR");
}

function dateLabelLong(isoDate: string) {
  const [y, m, d] = isoDate.split("-").map(Number);
  if (!y || !m || !d) return isoDate;
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

function normalizeScore(v: unknown) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(10, Math.round(n * 100) / 100));
}

function fmtScore(v: unknown) {
  return normalizeScore(v).toLocaleString("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

function scorePillClass(v: unknown) {
  const s = normalizeScore(v);
  if (s >= 8) return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (s >= 6) return "border-amber-200 bg-amber-50 text-amber-700";
  if (s >= 4) return "border-orange-200 bg-orange-50 text-orange-700";
  return "border-rose-200 bg-rose-50 text-rose-700";
}

function statusMeta(status: PromoStatus) {
  if (status === "ELIGIBLE") {
    return {
      label: "Apto",
      cls: "border-emerald-200 bg-emerald-50 text-emerald-700",
    };
  }
  if (status === "DENIED") {
    return {
      label: "Negado",
      cls: "border-rose-200 bg-rose-50 text-rose-700",
    };
  }
  if (status === "USED") {
    return {
      label: "Usado",
      cls: "border-sky-200 bg-sky-50 text-sky-700",
    };
  }
  return {
    label: "Aguardando",
    cls: "border-amber-200 bg-amber-50 text-amber-700",
  };
}

function SummaryCard({
  title,
  value,
  tone,
}: {
  title: string;
  value: string;
  tone: "slate" | "emerald" | "amber" | "rose" | "sky";
}) {
  const toneClass =
    tone === "emerald"
      ? "border-emerald-100 bg-emerald-50/70"
      : tone === "amber"
        ? "border-amber-100 bg-amber-50/70"
        : tone === "rose"
          ? "border-rose-100 bg-rose-50/70"
          : tone === "sky"
            ? "border-sky-100 bg-sky-50/70"
            : "border-slate-200 bg-white";

  return (
    <div className={`rounded-2xl border p-4 shadow-sm ${toneClass}`}>
      <div className="text-xs text-slate-500">{title}</div>
      <div className="mt-1 text-2xl font-semibold text-slate-900">{value}</div>
    </div>
  );
}

function Section({
  title,
  rows,
  emptyText,
  onChangeStatus,
  onOpenCredentials,
  sortBy,
  ownerId,
}: {
  title: string;
  rows: Item[];
  emptyText: string;
  onChangeStatus: (itemId: string, status: PromoStatus) => Promise<void>;
  onOpenCredentials: (item: Item) => void;
  sortBy: SortBy;
  ownerId: string;
}) {
  const filteredAndSorted = useMemo(() => {
    const filtered = ownerId
      ? rows.filter((row) => row.cedente.owner.id === ownerId)
      : rows;

    return [...filtered].sort((a, b) => {
      if (sortBy === "SCORE" && b.scoreMedia !== a.scoreMedia) return b.scoreMedia - a.scoreMedia;
      if (sortBy === "LATAM" && b.cedente.pontosLatam !== a.cedente.pontosLatam) {
        return b.cedente.pontosLatam - a.cedente.pontosLatam;
      }
      if (sortBy === "LIVELO" && b.cedente.pontosLivelo !== a.cedente.pontosLivelo) {
        return b.cedente.pontosLivelo - a.cedente.pontosLivelo;
      }
      if (sortBy === "PAX" && b.cedente.paxDisponivel !== a.cedente.paxDisponivel) {
        return b.cedente.paxDisponivel - a.cedente.paxDisponivel;
      }
      return a.cedente.nomeCompleto.localeCompare(b.cedente.nomeCompleto, "pt-BR");
    });
  }, [rows, sortBy, ownerId]);

  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold">{title}</div>
        <div className="text-xs text-neutral-500">{filteredAndSorted.length} contas</div>
      </div>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[1020px] text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-neutral-500">
              <th className="py-2 pr-3">Cedente</th>
              <th className="py-2 pr-3">Responsável</th>
              <th className="py-2 pr-3 text-right">LATAM</th>
              <th className="py-2 pr-3 text-right">LIVELO</th>
              <th className="py-2 pr-3 text-right">PAX disp.</th>
              <th className="py-2 pr-3 text-right">Score</th>
              <th className="py-2 pr-3">Status</th>
              <th className="py-2 pr-3">Ações</th>
            </tr>
          </thead>
          <tbody>
            {filteredAndSorted.map((item) => {
              const meta = statusMeta(item.status);
              const waHref = whatsappHref(item.cedente.telefone);

              return (
                <tr key={item.id} className="border-b last:border-b-0">
                  <td className="py-3 pr-3">
                    <div className="font-medium">{item.cedente.nomeCompleto}</div>
                    <div className="text-xs text-slate-500">
                      {item.cedente.identificador} • CPF: {maskCpf(item.cedente.cpf)}
                    </div>
                  </td>
                  <td className="py-3 pr-3">
                    <div className="font-medium">@{item.cedente.owner.login}</div>
                  </td>
                  <td className="py-3 pr-3 text-right font-medium tabular-nums">
                    {fmtInt(item.cedente.pontosLatam || 0)}
                  </td>
                  <td className="py-3 pr-3 text-right font-medium tabular-nums">
                    {fmtInt(item.cedente.pontosLivelo || 0)}
                  </td>
                  <td className="py-3 pr-3 text-right font-medium tabular-nums">
                    {fmtInt(item.cedente.paxDisponivel || 0)}
                  </td>
                  <td className="py-3 pr-3 text-right">
                    <span
                      className={`inline-flex rounded-full border px-2 py-1 text-xs ${scorePillClass(
                        item.scoreMedia
                      )}`}
                    >
                      {fmtScore(item.scoreMedia)}
                    </span>
                  </td>
                  <td className="py-3 pr-3">
                    <span className={`inline-flex rounded-full border px-2 py-1 text-xs ${meta.cls}`}>
                      {meta.label}
                    </span>
                    <div className="mt-1 text-xs text-slate-500">
                      {item.reviewedBy
                        ? `@${item.reviewedBy.login}`
                        : `por @${item.addedBy?.login || "sistema"}`}
                    </div>
                  </td>
                  <td className="py-3 pr-3">
                    <div className="flex flex-wrap items-center gap-2">
                      {waHref ? (
                        <a
                          href={waHref}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                          title="WhatsApp"
                        >
                          <MessageCircle size={16} />
                        </a>
                      ) : null}

                      <button
                        type="button"
                        className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                        title="Credenciais"
                        onClick={() => onOpenCredentials(item)}
                      >
                        <KeyRound size={16} />
                      </button>

                      {item.status !== "PENDING" ? (
                        <button
                          className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
                          onClick={() => onChangeStatus(item.id, "PENDING")}
                        >
                          Desfazer
                        </button>
                      ) : null}

                      {item.status !== "ELIGIBLE" ? (
                        <button
                          className="rounded-xl border px-3 py-1.5 text-xs hover:bg-neutral-50"
                          onClick={() => onChangeStatus(item.id, "ELIGIBLE")}
                        >
                          Apto
                        </button>
                      ) : null}

                      {item.status === "PENDING" ? (
                        <button
                          className="rounded-xl border border-rose-200 bg-white px-3 py-1.5 text-xs text-rose-700 hover:bg-rose-50"
                          onClick={() => onChangeStatus(item.id, "DENIED")}
                        >
                          Negar
                        </button>
                      ) : null}

                      {item.status === "ELIGIBLE" ? (
                        <button
                          className="rounded-xl border border-sky-300 bg-sky-50 px-3 py-1.5 text-xs font-medium text-sky-700 hover:bg-sky-100"
                          onClick={() => onChangeStatus(item.id, "USED")}
                        >
                          Marcar usado
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}

            {!filteredAndSorted.length ? (
              <tr>
                <td className="py-8 text-center text-sm text-slate-500" colSpan={8}>
                  {emptyText}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function LatamListaPromoPage() {
  const [data, setData] = useState<ApiResp | null>(null);
  const [listDate, setListDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [credentials, setCredentials] = useState<CredentialsState | null>(null);
  const [credentialsLoading, setCredentialsLoading] = useState(false);
  const [credentialsError, setCredentialsError] = useState("");
  const [copiedField, setCopiedField] = useState("");
  const [sortBy, setSortBy] = useState<SortBy>("ALPHA");
  const [ownerId, setOwnerId] = useState("");

  const ownerOptions = useMemo(() => {
    const map = new Map<string, { id: string; login: string }>();
    const rows = [
      ...(data?.groups.eligible || []),
      ...(data?.groups.pending || []),
      ...(data?.groups.denied || []),
      ...(data?.groups.used || []),
    ];

    rows.forEach((row) => {
      map.set(row.cedente.owner.id, {
        id: row.cedente.owner.id,
        login: row.cedente.owner.login,
      });
    });

    return Array.from(map.values()).sort((a, b) =>
      a.login.localeCompare(b.login, "pt-BR")
    );
  }, [data]);

  async function load(dateOverride?: string) {
    const targetDate = dateOverride || listDate;
    setLoading(true);
    setError("");
    try {
      const qs = targetDate ? `?date=${encodeURIComponent(targetDate)}` : "";
      const res = await fetch(`/api/contas-selecionadas/latam/lista-promo${qs}`, {
        cache: "no-store",
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Falha ao carregar lista promo.");

      setData(json);
      setListDate(String(json.listDate || ""));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Falha ao carregar lista promo.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function changeStatus(itemId: string, status: PromoStatus) {
    try {
      const res = await fetch("/api/contas-selecionadas/latam/lista-promo", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId, status }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Falha ao atualizar status.");
      await load(listDate);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Falha ao atualizar status.");
    }
  }

  async function copyValue(fieldId: string, value?: string | null) {
    const text = String(value || "").trim();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(fieldId);
      window.setTimeout(() => {
        setCopiedField((curr) => (curr === fieldId ? "" : curr));
      }, 1400);
    } catch {
      // noop
    }
  }

  async function openCredentials(item: Item) {
    setCredentials({
      cedenteId: item.cedente.id,
      nomeCompleto: item.cedente.nomeCompleto,
      identificador: item.cedente.identificador,
      cpf: item.cedente.cpf,
      email: null,
      senhaEmail: null,
      senhaLatam: null,
      senhaLivelo: null,
    });
    setCredentialsError("");
    setCredentialsLoading(true);

    try {
      const [latamRes, liveloRes] = await Promise.all([
        fetch(
          `/api/cedentes/credentials?cedenteId=${encodeURIComponent(
            item.cedente.id
          )}&program=LATAM`,
          { cache: "no-store" }
        ),
        fetch(
          `/api/cedentes/credentials?cedenteId=${encodeURIComponent(
            item.cedente.id
          )}&program=LIVELO`,
          { cache: "no-store" }
        ),
      ]);

      const [latamJson, liveloJson] = await Promise.all([
        latamRes.json().catch(() => null),
        liveloRes.json().catch(() => null),
      ]);

      if (!latamRes.ok || !latamJson?.ok) {
        throw new Error(latamJson?.error || "Falha ao carregar credenciais LATAM.");
      }
      if (!liveloRes.ok || !liveloJson?.ok) {
        throw new Error(liveloJson?.error || "Falha ao carregar credenciais LIVELO.");
      }

      setCredentials({
        cedenteId: item.cedente.id,
        nomeCompleto: item.cedente.nomeCompleto,
        identificador: item.cedente.identificador,
        cpf: String(latamJson.data?.cpf || item.cedente.cpf || ""),
        email: latamJson.data?.email ?? liveloJson.data?.email ?? null,
        senhaEmail: latamJson.data?.senhaEmail ?? liveloJson.data?.senhaEmail ?? null,
        senhaLatam: latamJson.data?.senhaPrograma ?? null,
        senhaLivelo: liveloJson.data?.senhaPrograma ?? null,
      });
    } catch (e: unknown) {
      setCredentialsError(
        e instanceof Error ? e.message : "Falha ao carregar credenciais."
      );
    } finally {
      setCredentialsLoading(false);
    }
  }

  if (loading && !data) {
    return <div className="p-6 text-sm text-neutral-600">Carregando…</div>;
  }

  return (
    <div className="p-6">
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="text-2xl font-semibold">Lista promo • Latam</div>
          <div className="text-sm text-neutral-500">
            Cada data funciona como uma lista separada. O atalho em cedentes LATAM adiciona a conta na lista do dia.
          </div>
        </div>

        <div className="flex flex-col gap-2 md:flex-row md:items-center">
          <input
            type="date"
            value={listDate}
            onChange={(e) => setListDate(e.target.value)}
            className="rounded-2xl border bg-white px-4 py-2 text-sm outline-none"
          />
          <button
            className="rounded-2xl border bg-white px-4 py-2 text-sm hover:bg-neutral-50"
            onClick={() => data?.today && load(data.today)}
          >
            Hoje
          </button>
          <button
            className="rounded-2xl border bg-black px-4 py-2 text-sm text-white hover:opacity-90"
            onClick={() => load(listDate)}
          >
            Atualizar
          </button>
        </div>
      </div>

      {data ? (
        <div className="mb-4 rounded-2xl border bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="text-sm font-semibold">Lista selecionada</div>
              <div className="mt-1 text-sm text-neutral-600">{dateLabelLong(data.listDate)}</div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <span className="text-xs text-neutral-500">Responsável:</span>
              <select
                className="rounded-xl border bg-white px-3 py-2 text-sm outline-none"
                value={ownerId}
                onChange={(e) => setOwnerId(e.target.value)}
              >
                <option value="">Todos</option>
                {ownerOptions.map((owner) => (
                  <option key={owner.id} value={owner.id}>
                    @{owner.login}
                  </option>
                ))}
              </select>

              <span className="text-xs text-neutral-500">Ordenar por:</span>
              <select
                className="rounded-xl border bg-white px-3 py-2 text-sm outline-none"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortBy)}
              >
                <option value="ALPHA">Ordem alfabética</option>
                <option value="SCORE">Score</option>
                <option value="LATAM">Pontos LATAM</option>
                <option value="LIVELO">Pontos LIVELO</option>
                <option value="PAX">PAX disponível</option>
              </select>
            </div>
          </div>

          {data.recentDates.length ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {data.recentDates.map((date) => (
                <button
                  key={date}
                  className={`rounded-full border px-3 py-1 text-xs ${
                    data.listDate === date
                      ? "border-black bg-black text-white"
                      : "bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                  onClick={() => load(date)}
                >
                  {date}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <SummaryCard title="Total na lista" value={fmtInt(data?.summary.total || 0)} tone="slate" />
        <SummaryCard title="Aptos" value={fmtInt(data?.summary.eligible || 0)} tone="emerald" />
        <SummaryCard title="Aguardando" value={fmtInt(data?.summary.pending || 0)} tone="amber" />
        <SummaryCard title="Negados" value={fmtInt(data?.summary.denied || 0)} tone="rose" />
        <SummaryCard title="Usados" value={fmtInt(data?.summary.used || 0)} tone="sky" />
      </div>

      <div className="mt-4 grid gap-4">
        <Section
          title="Aptos para promoção"
          rows={data?.groups.eligible || []}
          emptyText="Nenhuma conta apta nesta lista."
          onChangeStatus={changeStatus}
          onOpenCredentials={openCredentials}
          sortBy={sortBy}
          ownerId={ownerId}
        />

        <Section
          title="Aguardando decisão"
          rows={data?.groups.pending || []}
          emptyText="Nenhuma conta aguardando nesta lista."
          onChangeStatus={changeStatus}
          onOpenCredentials={openCredentials}
          sortBy={sortBy}
          ownerId={ownerId}
        />

        <Section
          title="Negados"
          rows={data?.groups.denied || []}
          emptyText="Nenhuma conta negada nesta lista."
          onChangeStatus={changeStatus}
          onOpenCredentials={openCredentials}
          sortBy={sortBy}
          ownerId={ownerId}
        />

        <Section
          title="Usados"
          rows={data?.groups.used || []}
          emptyText="Nenhuma conta marcada como usada nesta lista."
          onChangeStatus={changeStatus}
          onOpenCredentials={openCredentials}
          sortBy={sortBy}
          ownerId={ownerId}
        />
      </div>

      {credentials ? (
        <div className="fixed inset-0 z-50">
          <button
            type="button"
            className="absolute inset-0 bg-black/45"
            aria-label="Fechar credenciais"
            onClick={() => {
              setCredentials(null);
              setCredentialsError("");
              setCopiedField("");
            }}
          />
          <div className="absolute left-1/2 top-1/2 w-[min(94vw,700px)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border bg-white p-5 shadow-2xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <div className="text-lg font-semibold">Credenciais</div>
                <div className="text-sm text-slate-500">
                  {credentials.nomeCompleto} • {credentials.identificador}
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setCredentials(null);
                  setCredentialsError("");
                  setCopiedField("");
                }}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border text-slate-600 hover:bg-slate-100"
                title="Fechar"
              >
                <X size={16} />
              </button>
            </div>

            {credentialsError ? (
              <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {credentialsError}
              </div>
            ) : null}

            {credentialsLoading ? (
              <div className="rounded-xl border bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                Carregando credenciais…
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="rounded-xl border bg-slate-50 p-3">
                  <div className="text-xs uppercase tracking-wide text-slate-500">CPF (login)</div>
                  <div className="mt-1 break-all font-medium">{credentials.cpf || "-"}</div>
                  <button
                    type="button"
                    onClick={() => copyValue("cpf", credentials.cpf)}
                    className="mt-2 inline-flex items-center gap-1 text-xs text-slate-600 hover:text-slate-900"
                  >
                    <Copy size={13} /> {copiedField === "cpf" ? "Copiado" : "Copiar"}
                  </button>
                </div>

                <div className="rounded-xl border bg-slate-50 p-3">
                  <div className="text-xs uppercase tracking-wide text-slate-500">Senha LATAM</div>
                  <div className="mt-1 break-all font-medium">{credentials.senhaLatam || "-"}</div>
                  <button
                    type="button"
                    onClick={() => copyValue("senhaLatam", credentials.senhaLatam)}
                    className="mt-2 inline-flex items-center gap-1 text-xs text-slate-600 hover:text-slate-900"
                  >
                    <Copy size={13} /> {copiedField === "senhaLatam" ? "Copiado" : "Copiar"}
                  </button>
                </div>

                <div className="rounded-xl border bg-slate-50 p-3">
                  <div className="text-xs uppercase tracking-wide text-slate-500">Senha LIVELO</div>
                  <div className="mt-1 break-all font-medium">{credentials.senhaLivelo || "-"}</div>
                  <button
                    type="button"
                    onClick={() => copyValue("senhaLivelo", credentials.senhaLivelo)}
                    className="mt-2 inline-flex items-center gap-1 text-xs text-slate-600 hover:text-slate-900"
                  >
                    <Copy size={13} /> {copiedField === "senhaLivelo" ? "Copiado" : "Copiar"}
                  </button>
                </div>

                <div className="rounded-xl border bg-slate-50 p-3">
                  <div className="text-xs uppercase tracking-wide text-slate-500">E-mail</div>
                  <div className="mt-1 break-all font-medium">{credentials.email || "-"}</div>
                  <button
                    type="button"
                    onClick={() => copyValue("email", credentials.email)}
                    className="mt-2 inline-flex items-center gap-1 text-xs text-slate-600 hover:text-slate-900"
                  >
                    <Copy size={13} /> {copiedField === "email" ? "Copiado" : "Copiar"}
                  </button>
                </div>

                <div className="rounded-xl border bg-slate-50 p-3 md:col-span-2">
                  <div className="text-xs uppercase tracking-wide text-slate-500">Senha do e-mail</div>
                  <div className="mt-1 break-all font-medium">{credentials.senhaEmail || "-"}</div>
                  <button
                    type="button"
                    onClick={() => copyValue("senhaEmail", credentials.senhaEmail)}
                    className="mt-2 inline-flex items-center gap-1 text-xs text-slate-600 hover:text-slate-900"
                  >
                    <Copy size={13} /> {copiedField === "senhaEmail" ? "Copiado" : "Copiar"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
