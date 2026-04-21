"use client";

import Link from "next/link";
import { useMemo, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type ClienteTipo = "PESSOA" | "EMPRESA";
type ClienteOrigem = "BALCAO_MILHAS" | "PARTICULAR" | "SITE" | "OUTROS";
type AffiliateOption = {
  id: string;
  name: string;
  document: string;
  commissionBps: number;
  isActive?: boolean;
};

function onlyDigits(v: string) {
  return (v || "").replace(/\D+/g, "");
}

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  return fallback;
}

function Input({
  label,
  value,
  onChange,
  placeholder,
  optional,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  optional?: boolean;
}) {
  return (
    <label className="space-y-1">
      <div className="flex items-center justify-between">
        <div className="text-xs text-slate-600">{label}</div>
        {optional ? <div className="text-[11px] text-slate-400">Opcional</div> : null}
      </div>
      <input
        className="w-full rounded-xl border px-3 py-2 text-sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </label>
  );
}

export default function EditarClienteClient({ id }: { id: string }) {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [affiliates, setAffiliates] = useState<AffiliateOption[]>([]);
  const [currentAffiliate, setCurrentAffiliate] = useState<AffiliateOption | null>(null);

  const [tipo, setTipo] = useState<ClienteTipo>("PESSOA");
  const [nome, setNome] = useState("");
  const [cpfCnpj, setCpfCnpj] = useState("");
  const [telefone, setTelefone] = useState("");
  const [affiliateId, setAffiliateId] = useState("");

  const [origem, setOrigem] = useState<ClienteOrigem>("BALCAO_MILHAS");
  const [origemDescricao, setOrigemDescricao] = useState("");

  const cpfCnpjNorm = useMemo(() => {
    const d = onlyDigits(cpfCnpj);
    return d.length ? d : "";
  }, [cpfCnpj]);

  const affiliateOptions = useMemo(() => {
    if (!currentAffiliate) return affiliates;
    if (affiliates.some((affiliate) => affiliate.id === currentAffiliate.id)) return affiliates;
    return [currentAffiliate, ...affiliates];
  }, [affiliates, currentAffiliate]);

  async function loadAffiliates() {
    try {
      const r = await fetch("/api/afiliados?active=1", { cache: "no-store" });
      const j = await r.json();
      if (j?.ok) setAffiliates(j.data.affiliates || []);
    } catch {
      setAffiliates([]);
    }
  }

  async function load() {
    setLoading(true);
    try {
      const r = await fetch(`/api/clientes/${id}`, { cache: "no-store" });
      const j = await r.json();
      if (!j?.ok) throw new Error(j?.error || "Erro ao carregar cliente");

      const c = j.data.cliente;
      setTipo(c.tipo);
      setNome(c.nome || "");
      setCpfCnpj(c.cpfCnpj || "");
      setTelefone(c.telefone || "");
      setOrigem(c.origem);
      setOrigemDescricao(c.origemDescricao || "");
      setAffiliateId(c.affiliateId || "");
      setCurrentAffiliate(c.affiliate || null);
    } catch (e: unknown) {
      alert(errorMessage(e, "Erro ao carregar cliente"));
      router.push("/dashboard/clientes");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAffiliates();
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function salvar() {
    setSaving(true);
    try {
      const payload = {
        tipo,
        nome: nome.trim(),
        cpfCnpj: cpfCnpjNorm || null,
        telefone: onlyDigits(telefone) || null,
        origem,
        origemDescricao: origem === "OUTROS" ? origemDescricao.trim() : null,
        affiliateId: affiliateId || null,
      };

      const r = await fetch(`/api/clientes/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const j = await r.json();
      if (!j?.ok) throw new Error(j?.error || "Erro ao atualizar cliente");

      router.push("/dashboard/clientes");
      router.refresh();
    } catch (e: unknown) {
      alert(errorMessage(e, "Erro ao atualizar cliente"));
    } finally {
      setSaving(false);
    }
  }

  const canSave =
    nome.trim().length > 1 &&
    origem &&
    (origem !== "OUTROS" || origemDescricao.trim().length > 1);

  if (loading) {
    return (
      <div className="rounded-2xl border bg-white p-5 text-sm text-slate-600">
        Carregando cliente...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Editar cliente</h1>
          <p className="text-sm text-slate-600">Atualize os dados do cliente.</p>
        </div>

        <div className="flex gap-2">
          <Link
            href="/dashboard/clientes"
            className="rounded-xl border px-4 py-2 text-sm hover:bg-slate-50"
          >
            Voltar
          </Link>

          <button
            onClick={salvar}
            disabled={!canSave || saving}
            className="rounded-xl bg-black px-4 py-2 text-sm text-white hover:bg-gray-800 disabled:opacity-60"
          >
            {saving ? "Salvando..." : "Salvar alterações"}
          </button>
        </div>
      </div>

      {/* Card */}
      <div className="rounded-2xl border bg-white p-5 space-y-5">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-1">
            <div className="text-xs text-slate-600">Tipo</div>
            <select
              className="w-full rounded-xl border px-3 py-2 text-sm bg-white"
              value={tipo}
              onChange={(e) => setTipo(e.target.value as ClienteTipo)}
            >
              <option value="PESSOA">Pessoa</option>
              <option value="EMPRESA">Empresa</option>
            </select>
          </label>

          <Input
            label={tipo === "EMPRESA" ? "Nome da empresa" : "Nome completo"}
            value={nome}
            onChange={setNome}
            placeholder={tipo === "EMPRESA" ? "Ex: TradeMiles LTDA" : "Ex: João Silva"}
          />

          <Input
            label={tipo === "EMPRESA" ? "CNPJ" : "CPF"}
            value={cpfCnpj}
            onChange={setCpfCnpj}
            placeholder="Opcional"
            optional
          />

          <Input
            label="Telefone"
            value={telefone}
            onChange={setTelefone}
            placeholder="Opcional"
            optional
          />

          <label className="space-y-1 md:col-span-2">
            <div className="flex items-center justify-between">
              <div className="text-xs text-slate-600">Indicação</div>
              <div className="text-[11px] text-slate-400">Opcional</div>
            </div>
            <select
              className="w-full rounded-xl border bg-white px-3 py-2 text-sm"
              value={affiliateId}
              onChange={(e) => setAffiliateId(e.target.value)}
            >
              <option value="">Sem indicação de afiliado</option>
              {affiliateOptions.map((affiliate) => (
                <option key={affiliate.id} value={affiliate.id}>
                  {affiliate.name} - {(affiliate.commissionBps / 100).toLocaleString("pt-BR")}%
                  {affiliate.isActive === false ? " (inativo)" : ""}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1 md:col-span-2">
            <div className="text-xs text-slate-600">Origem</div>
            <select
              className="w-full rounded-xl border px-3 py-2 text-sm bg-white"
              value={origem}
              onChange={(e) => setOrigem(e.target.value as ClienteOrigem)}
            >
              <option value="BALCAO_MILHAS">Balcão de milhas</option>
              <option value="PARTICULAR">Particular</option>
              <option value="SITE">Site</option>
              <option value="OUTROS">Outros</option>
            </select>
          </label>

          {origem === "OUTROS" ? (
            <div className="md:col-span-2">
              <Input
                label="Descreva a origem"
                value={origemDescricao}
                onChange={setOrigemDescricao}
                placeholder="Ex: Indicação / Instagram / Evento..."
              />
            </div>
          ) : null}
        </div>

        <div className="text-xs text-slate-500">
          Dica: você pode preencher CPF/CNPJ e telefone depois — mas o backend valida os dígitos (CPF 11 / CNPJ 14).
        </div>
      </div>
    </div>
  );
}
