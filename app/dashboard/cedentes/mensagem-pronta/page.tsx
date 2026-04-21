"use client";

import { useEffect, useMemo, useState } from "react";
import { buildWhatsAppLink } from "@/lib/whatsapp";

type TemplateId = "INVITE_NEW_CEDENTES";

type CedenteRow = {
  id: string;
  identificador: string;
  nomeCompleto: string;
  telefone: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
  owner: { name: string; login: string };
  whatsappE164: string | null;
  whatsappUrl: string | null;
};

type InviteResponse = {
  ok?: boolean;
  data?: {
    inviteId: string;
    inviteCode: string;
    uses: number;
    lastUsedAt: string | null;
  };
  error?: string;
};

type CedentesWhatsappResponse = {
  ok?: boolean;
  rows?: CedenteRow[];
  error?: string;
};

const MESSAGE_TEMPLATES: Array<{ id: TemplateId; label: string }> = [
  { id: "INVITE_NEW_CEDENTES", label: "Convite novos cedentes" },
];

function getBaseUrl() {
  const env = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/+$/, "");
  if (env) return env;
  if (typeof window !== "undefined") return window.location.origin;
  return "";
}

function firstName(fullName: string) {
  const first = String(fullName || "").trim().split(/\s+/)[0] || "";
  return first || "Tudo bem";
}

function buildTemplateMessage(templateId: TemplateId, inviteUrl: string, cedenteName: string) {
  if (templateId === "INVITE_NEW_CEDENTES") {
    return [
      `Oi, ${firstName(cedenteName)}!`,
      "",
      "Temos uma oportunidade para indicar pessoas interessadas em compra e venda de milhas.",
      "Cada indicação aprovada rende R$ 20 para você.",
      "Quem entrar já começa recebendo R$ 50 antecipados na primeira venda pela Smiles.",
      "",
      "Se tiver alguém com interesse, pode encaminhar este link:",
      inviteUrl,
    ].join("\n");
  }

  return inviteUrl;
}

export default function CedentesMensagemProntaPage() {
  const [rows, setRows] = useState<CedenteRow[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [templateId, setTemplateId] =
    useState<TemplateId>("INVITE_NEW_CEDENTES");
  const [inviteUrl, setInviteUrl] = useState("");
  const [inviteError, setInviteError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setLoading(true);
        setErr(null);
        setInviteError(null);

        const [cedRes, inviteRes] = await Promise.all([
          fetch("/api/cedentes/whatsapp", { cache: "no-store" }),
          fetch("/api/me/invite", { cache: "no-store" }),
        ]);

        const cedData =
          (await cedRes.json().catch(() => ({}))) as CedentesWhatsappResponse;
        const inviteData =
          (await inviteRes.json().catch(() => ({}))) as InviteResponse;

        if (!cedRes.ok || !cedData?.ok) {
          throw new Error(cedData?.error || "Falha ao carregar cedentes.");
        }

        if (alive) {
          setRows(Array.isArray(cedData.rows) ? cedData.rows : []);
        }

        if (!inviteRes.ok || !inviteData?.ok || !inviteData?.data?.inviteCode) {
          if (alive) {
            setInviteUrl("");
            setInviteError(
              inviteData?.error ||
                "Não foi possível localizar o link de convite do usuário logado."
            );
          }
        } else if (alive) {
          const baseUrl = getBaseUrl();
          setInviteUrl(`${baseUrl}/convite/${inviteData.data.inviteCode}`);
        }
      } catch (error: unknown) {
        if (alive) {
          setErr(
            error instanceof Error && error.message
              ? error.message
              : "Erro ao carregar a página."
          );
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;

    return rows.filter((row) => {
      const text =
        `${row.nomeCompleto} ${row.identificador} ${row.telefone ?? ""} ${row.owner?.login ?? ""}`.toLowerCase();
      return text.includes(s);
    });
  }, [rows, q]);

  const previewMessage = useMemo(() => {
    if (!inviteUrl) return "";
    return buildTemplateMessage(templateId, inviteUrl, "cedente");
  }, [inviteUrl, templateId]);

  async function copyPreviewMessage() {
    if (!previewMessage) return;
    try {
      await navigator.clipboard.writeText(previewMessage);
      alert("Mensagem copiada.");
    } catch {
      alert("Não foi possível copiar a mensagem.");
    }
  }

  function openWhatsapp(row: CedenteRow) {
    if (!row.whatsappE164 || !inviteUrl) return;
    const text = buildTemplateMessage(templateId, inviteUrl, row.nomeCompleto);
    const url = buildWhatsAppLink(row.whatsappE164, text);
    window.open(url, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="mx-auto max-w-7xl p-4">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">Cedentes • Mensagem pronta</h1>
        <p className="text-sm text-slate-600">
          Escolha um template e encaminhe a mensagem direto no WhatsApp dos
          cedentes usando o link de convite do usuário logado.
        </p>
      </div>

      <div className="mt-4 rounded-2xl border bg-white p-4">
        <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
          <div className="space-y-4">
            <label className="block space-y-1">
              <div className="text-xs text-slate-600">Mensagem pronta</div>
              <select
                className="w-full rounded-xl border px-3 py-2 text-sm bg-white"
                value={templateId}
                onChange={(e) => setTemplateId(e.target.value as TemplateId)}
              >
                {MESSAGE_TEMPLATES.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block space-y-1">
              <div className="text-xs text-slate-600">
                Link de convite do usuário logado
              </div>
              <input
                readOnly
                value={inviteUrl || "—"}
                className="w-full rounded-xl border px-3 py-2 text-sm"
              />
            </label>

            {inviteError ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                {inviteError}
              </div>
            ) : null}

            <button
              type="button"
              onClick={copyPreviewMessage}
              disabled={!previewMessage}
              className="rounded-xl border px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-50"
            >
              Copiar mensagem
            </button>
          </div>

          <div className="space-y-2">
            <div className="text-xs text-slate-600">Prévia</div>
            <textarea
              readOnly
              value={previewMessage}
              className="min-h-[220px] w-full rounded-xl border px-3 py-3 text-sm"
            />
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border bg-white p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="font-medium">Cedentes cadastrados</div>
            <div className="text-sm text-slate-500">
              Responsável exibido apenas pelo `@login`.
            </div>
          </div>

          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar (nome, id, telefone, @responsável...)"
            className="w-full rounded-xl border px-3 py-2 text-sm sm:w-96"
          />
        </div>

        <div className="mt-4 rounded-xl border">
          {loading ? (
            <div className="p-4 text-sm text-slate-600">Carregando...</div>
          ) : err ? (
            <div className="p-4 text-sm text-red-600">{err}</div>
          ) : filtered.length === 0 ? (
            <div className="p-4 text-sm text-slate-600">
              Nenhum cedente encontrado.
            </div>
          ) : (
            <div className="overflow-auto">
              <table className="min-w-full text-sm">
                <thead className="border-b bg-slate-50 text-slate-700">
                  <tr>
                    <th className="px-3 py-2 text-left">Cedente</th>
                    <th className="px-3 py-2 text-left">Identificador</th>
                    <th className="px-3 py-2 text-left">Responsável</th>
                    <th className="px-3 py-2 text-left">Telefone</th>
                    <th className="px-3 py-2 text-left">WhatsApp</th>
                    <th className="px-3 py-2 text-left">Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row) => (
                    <tr key={row.id} className="border-b last:border-b-0">
                      <td className="px-3 py-2">
                        <div className="font-medium">{row.nomeCompleto}</div>
                        <div className="text-xs text-slate-500">{row.status}</div>
                      </td>
                      <td className="px-3 py-2">{row.identificador}</td>
                      <td className="px-3 py-2">@{row.owner?.login || "—"}</td>
                      <td className="px-3 py-2">{row.telefone || "—"}</td>
                      <td className="px-3 py-2">
                        {row.whatsappUrl ? (
                          <a
                            href={row.whatsappUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center rounded-xl border px-3 py-1.5 hover:bg-slate-50"
                          >
                            Abrir
                          </a>
                        ) : (
                          <span className="text-xs text-slate-500">
                            Sem telefone válido
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          onClick={() => openWhatsapp(row)}
                          disabled={!row.whatsappE164 || !inviteUrl}
                          className="rounded-xl bg-black px-3 py-1.5 text-white disabled:opacity-50"
                        >
                          Encaminhar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
