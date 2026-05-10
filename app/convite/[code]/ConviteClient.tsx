"use client";

import { useEffect, useMemo, useState } from "react";
import {
  DEFAULT_INDICACAO_TERM_BODY,
  DEFAULT_INDICACAO_TERM_VERSION,
} from "@/lib/cedente-indicacao-defaults";

type PixTipo = "CPF" | "CNPJ" | "EMAIL" | "TELEFONE" | "ALEATORIA" | "";

type FormState = {
  nomeCompleto: string;
  dataNascimento: string; // DD/MM/AAAA
  cpf: string;

  // ✅ ADICIONADO
  telefone: string;

  emailCriado: string;
  senhaEmail: string;

  senhaSmiles: string;
  senhaLatamPass: string;
  senhaLivelo: string;
  senhaEsfera: string;

  chavePix: string;
  banco: string;
  pixTipo: PixTipo;

  pontosLatam: number | "";
  pontosSmiles: number | "";
  pontosLivelo: number | "";
  pontosEsfera: number | "";
};

function onlyDigits(v: string) {
  return (v || "").replace(/\D+/g, "");
}
function normalizeCpf(v: string) {
  return onlyDigits(v).slice(0, 11);
}

// ✅ ADICIONADO (Brasil: normalmente 10 ou 11 dígitos com DDD)
function normalizeTelefone(v: string) {
  return onlyDigits(v).slice(0, 11);
}

function normalizeDateBR(v: string) {
  const cleaned = (v || "").replace(/[^\d/]/g, "");
  const digits = cleaned.replace(/\//g, "");
  const d = digits.slice(0, 2);
  const m = digits.slice(2, 4);
  const y = digits.slice(4, 8);
  let out = d;
  if (digits.length > 2) out += "/" + m;
  if (digits.length > 4) out += "/" + y;
  return out.slice(0, 10);
}
function brToIsoDate(br: string): string | null {
  const v = (br || "").trim();
  if (!v) return null;
  const parts = v.split("/");
  if (parts.length !== 3) return null;
  const [dd, mm, yyyy] = parts;
  if (dd.length !== 2 || mm.length !== 2 || yyyy.length !== 4) return null;

  const d = Number(dd);
  const m = Number(mm);
  const y = Number(yyyy);
  if (!Number.isFinite(d) || !Number.isFinite(m) || !Number.isFinite(y)) return null;
  if (y < 1900 || y > 2100) return null;
  if (m < 1 || m > 12) return null;
  if (d < 1 || d > 31) return null;

  return `${yyyy}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function formatFieldValue(v: unknown) {
  if (v === null || v === undefined || v === "") return "—";
  return String(v);
}

function formatCedenteStatus(status: DuplicateCedente["status"]) {
  if (status === "APPROVED") return "Aprovado";
  if (status === "REJECTED") return "Rejeitado";
  return "Pendente";
}

type InviteResp = {
  ok: boolean;
  error?: string;
  data?: {
    inviteId: string;
    code: string;
    uses: number;
    lastUsedAt: string | null;
    responsavel: {
      id: string;
      name: string;
      login: string;
      employeeId: string | null;
      team: string;
      role: string;
    };
  };
};

type Responsavel = NonNullable<InviteResp["data"]>["responsavel"];

type DuplicateCedente = {
  id: string;
  identificador: string;
  nomeCompleto: string;
  cpf: string;
  telefone: string | null;
  emailCriado: string | null;
  banco: string;
  pixTipo: Exclude<PixTipo, "">;
  chavePix: string;
  pontosLatam: number;
  pontosSmiles: number;
  pontosLivelo: number;
  pontosEsfera: number;
  status: "PENDING" | "APPROVED" | "REJECTED";
  owner: { id: string; name: string; login: string };
  createdAt: string;
  updatedAt: string;
};

type CedenteSignupResp = {
  ok: boolean;
  error?: string;
  data?: { id: string; identificador: string; updatedExisting?: boolean };
  duplicate?: DuplicateCedente | null;
  updateAllowed?: boolean;
};

type PublicIndicacaoForm = {
  id: string;
  title: string;
  slug: string;
  termVersion: string;
  termBody: string;
  sortOrder: number;
};

const LOCAL_FALLBACK_FORM: PublicIndicacaoForm = {
  id: "local-fallback",
  title: "Termo",
  slug: "local-fallback",
  termVersion: DEFAULT_INDICACAO_TERM_VERSION,
  termBody: DEFAULT_INDICACAO_TERM_BODY,
  sortOrder: 0,
};

export default function ConviteClient({ code }: { code: string }) {
  const [form, setForm] = useState<FormState>({
    nomeCompleto: "",
    dataNascimento: "",
    cpf: "",

    // ✅ ADICIONADO
    telefone: "",

    emailCriado: "",
    senhaEmail: "",
    senhaSmiles: "",
    senhaLatamPass: "",
    senhaLivelo: "",
    senhaEsfera: "",
    chavePix: "",
    banco: "",
    pixTipo: "",
    pontosLatam: "",
    pontosSmiles: "",
    pontosLivelo: "",
    pontosEsfera: "",
  });

  const [loadingInvite, setLoadingInvite] = useState(true);
  const [inviteError, setInviteError] = useState("");
  const [responsavel, setResponsavel] = useState<Responsavel | null>(null);

  const [publicLoading, setPublicLoading] = useState(true);
  const [indicacaoForms, setIndicacaoForms] = useState<PublicIndicacaoForm[]>([]);
  const [selectedFormId, setSelectedFormId] = useState<string | null>(null);

  const selectedForm = useMemo(
    () => indicacaoForms.find((f) => f.id === selectedFormId) ?? null,
    [indicacaoForms, selectedFormId]
  );

  const [termoAceito, setTermoAceito] = useState(false);
  const [saving, setSaving] = useState(false);
  const [duplicateInfo, setDuplicateInfo] = useState<{
    existing: DuplicateCedente;
    updateAllowed: boolean;
    error: string;
  } | null>(null);

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function resetForm() {
    setForm({
      nomeCompleto: "",
      dataNascimento: "",
      cpf: "",
      telefone: "",
      emailCriado: "",
      senhaEmail: "",
      senhaSmiles: "",
      senhaLatamPass: "",
      senhaLivelo: "",
      senhaEsfera: "",
      chavePix: "",
      banco: "",
      pixTipo: "",
      pontosLatam: "",
      pontosSmiles: "",
      pontosLivelo: "",
      pontosEsfera: "",
    });
    setTermoAceito(false);
  }

  function buildPayload(overrides?: {
    overwriteExisting?: boolean;
    existingCedenteId?: string;
  }) {
    return {
      nomeCompleto: form.nomeCompleto.trim(),
      cpf: normalizeCpf(form.cpf),
      dataNascimento: form.dataNascimento.trim() ? brToIsoDate(form.dataNascimento) : null,
      telefone: normalizeTelefone(form.telefone),
      emailCriado: form.emailCriado.trim() || null,
      banco: form.banco.trim(),
      pixTipo: form.pixTipo,
      chavePix: form.chavePix.trim(),
      senhaEmailEnc: form.senhaEmail || null,
      senhaSmilesEnc: form.senhaSmiles || null,
      senhaLatamPassEnc: form.senhaLatamPass || null,
      senhaLiveloEnc: form.senhaLivelo || null,
      senhaEsferaEnc: form.senhaEsfera || null,
      pontosLatam: Number(form.pontosLatam || 0),
      pontosSmiles: Number(form.pontosSmiles || 0),
      pontosLivelo: Number(form.pontosLivelo || 0),
      pontosEsfera: Number(form.pontosEsfera || 0),
      termoAceito: true,
      termoVersao: selectedForm?.termVersion ?? DEFAULT_INDICACAO_TERM_VERSION,
      titularConfirmado: true,
      overwriteExisting: Boolean(overrides?.overwriteExisting),
      existingCedenteId: overrides?.existingCedenteId || null,
    };
  }

  async function submitCadastro(overrides?: {
    overwriteExisting?: boolean;
    existingCedenteId?: string;
  }) {
    const res = await fetch(`/api/convites/${encodeURIComponent(code)}/cedentes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildPayload(overrides)),
    });

    const json: CedenteSignupResp = await res.json().catch(() => ({
      ok: false,
      error: "Falha ao cadastrar.",
    }));

    if (!json?.ok) {
      if (json?.duplicate) {
        setDuplicateInfo({
          existing: json.duplicate,
          updateAllowed: Boolean(json.updateAllowed),
          error:
            json.error ||
            "Encontramos um cadastro com este CPF. Revise os dados e, se fizer sentido, atualize o cadastro existente.",
        });
      }
      const err = new Error(json?.error || "Falha ao cadastrar.") as Error & { isDuplicate?: boolean };
      err.isDuplicate = Boolean(json?.duplicate);
      throw err;
    }

    return json;
  }

  async function handleDuplicateUpdate() {
    if (!duplicateInfo?.updateAllowed) return;
    try {
      setSaving(true);
      const json = await submitCadastro({
        overwriteExisting: true,
        existingCedenteId: duplicateInfo.existing.id,
      });

      alert(json.data?.updatedExisting ? "Cadastro existente atualizado ✅" : "Cadastro enviado ✅");
      setDuplicateInfo(null);
      resetForm();
    } catch (e: unknown) {
      if (e && typeof e === "object" && "isDuplicate" in e && (e as { isDuplicate?: boolean }).isDuplicate) return;
      alert(e instanceof Error ? e.message : "Erro ao atualizar cadastro.");
    } finally {
      setSaving(false);
    }
  }

  async function loadPublicSettings() {
    setPublicLoading(true);
    try {
      const res = await fetch("/api/app-settings/public", { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      const forms = json?.data?.indicacaoForms as PublicIndicacaoForm[] | undefined;
      if (json?.ok && Array.isArray(forms) && forms.length > 0) {
        setIndicacaoForms(forms);
        setSelectedFormId(forms[0].id);
      } else {
        setIndicacaoForms([LOCAL_FALLBACK_FORM]);
        setSelectedFormId(LOCAL_FALLBACK_FORM.id);
      }
    } catch {
      setIndicacaoForms([LOCAL_FALLBACK_FORM]);
      setSelectedFormId(LOCAL_FALLBACK_FORM.id);
    } finally {
      setPublicLoading(false);
    }
  }

  async function loadInvite() {
    setLoadingInvite(true);
    setInviteError("");
    try {
      const res = await fetch(`/api/convites/${encodeURIComponent(code)}`, { cache: "no-store" });
      const json: InviteResp = await res.json();

      if (!json?.ok) throw new Error(json?.error || "Convite inválido.");
      if (!json.data?.responsavel) throw new Error("Convite inválido.");
      setResponsavel(json.data.responsavel);
    } catch (e: unknown) {
      setInviteError(e instanceof Error ? e.message : "Erro ao carregar convite.");
      setResponsavel(null);
    } finally {
      setLoadingInvite(false);
    }
  }

  useEffect(() => {
    loadInvite();
    loadPublicSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setDuplicateInfo(null);

    if (!responsavel) return alert("Convite inválido.");
    if (!form.nomeCompleto.trim()) return alert("Informe o nome completo.");
    if (normalizeCpf(form.cpf).length !== 11) return alert("CPF inválido (11 dígitos).");

    // ✅ ADICIONADO (telefone obrigatório)
    const tel = normalizeTelefone(form.telefone);
    if (!tel) return alert("Informe o telefone.");
    if (!(tel.length === 10 || tel.length === 11)) return alert("Telefone inválido (DDD + número).");

    if (!form.banco.trim()) return alert("Informe o banco (pagamento apenas ao titular).");
    if (!form.pixTipo) return alert("Informe o tipo da chave PIX.");
    if (!form.chavePix.trim()) return alert("Informe a chave PIX do titular.");
    if (!termoAceito) return alert("Você precisa ler e aceitar o termo para continuar.");

    const isoNascimento = form.dataNascimento.trim() ? brToIsoDate(form.dataNascimento) : null;
    if (form.dataNascimento.trim() && !isoNascimento) {
      return alert("Data de nascimento inválida. Use DD/MM/AAAA.");
    }

    try {
      setSaving(true);
      const json = await submitCadastro();
      alert(json.data?.updatedExisting ? "Cadastro existente atualizado ✅" : "Cadastro enviado ✅");
      resetForm();
    } catch (e: unknown) {
      if (e && typeof e === "object" && "isDuplicate" in e && (e as { isDuplicate?: boolean }).isDuplicate) return;
      alert(e instanceof Error ? e.message : "Erro ao enviar.");
    } finally {
      setSaving(false);
    }
  }

  if (loadingInvite || publicLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="text-sm text-slate-600">Carregando convite...</div>
      </div>
    );
  }

  if (inviteError || !responsavel) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="w-full max-w-2xl">
          <h1 className="text-2xl font-bold mb-2">Convite inválido</h1>
          <p className="text-sm text-red-600">{inviteError || "Esse link não é válido ou está inativo."}</p>
          <button className="mt-4 rounded-xl border px-4 py-2 text-sm hover:bg-slate-50" onClick={loadInvite}>
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  const responsavelLabel = responsavel.employeeId
    ? `${responsavel.employeeId} • ${responsavel.name}`
    : responsavel.name;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex justify-center p-4 pb-24 md:p-6 [&_input]:bg-white [&_input]:text-slate-900 [&_input::placeholder]:text-slate-400 [&_select]:bg-white [&_select]:text-slate-900">
      <div className="w-full max-w-3xl">
        <h1 className="mb-2 text-2xl font-bold text-center text-slate-900">Cadastro de cedente</h1>

        <div className="mb-6 rounded-2xl border bg-white p-4">
          <div className="text-sm font-semibold">Responsável</div>
          <div className="text-sm text-slate-600">{responsavelLabel}</div>
          <div className="text-xs text-slate-500 mt-1">(No caso: quem forneceu o link de indicação)</div>
        </div>

        {/* ✅ TERMO + ACEITE */}
        <div className="mb-6 rounded-2xl border bg-white p-4 space-y-3">
          <div className="text-sm font-semibold">Termo de ciência e autorização</div>
          {indicacaoForms.length > 1 ? (
            <div className="flex flex-wrap gap-2">
              {indicacaoForms.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  className={
                    f.id === selectedFormId
                      ? "rounded-full border border-sky-600 bg-sky-50 px-3 py-1 text-xs font-medium text-sky-900"
                      : "rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-700 hover:bg-slate-50"
                  }
                  onClick={() => {
                    setSelectedFormId(f.id);
                    setTermoAceito(false);
                  }}
                >
                  {f.title}
                </button>
              ))}
            </div>
          ) : null}
          <div className="text-xs text-slate-500">
            Versão: {selectedForm?.termVersion ?? DEFAULT_INDICACAO_TERM_VERSION}
          </div>

          <div className="rounded-xl border bg-slate-50 p-3 text-xs whitespace-pre-wrap leading-relaxed max-h-[320px] overflow-auto">
            {selectedForm?.termBody ?? DEFAULT_INDICACAO_TERM_BODY}
          </div>

          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={termoAceito}
              onChange={(e) => setTermoAceito(e.target.checked)}
            />
            <span>
              Li e estou ciente do termo acima, e <b>autorizo expressamente</b> a utilização da minha conta conforme descrito.
            </span>
          </label>
        </div>

        <form onSubmit={onSubmit} className="space-y-6">
          <section className="rounded-2xl border bg-white p-4">
            <h2 className="mb-3 font-semibold">Dados</h2>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm">Nome completo</label>
                <input
                  className="w-full rounded-xl border px-3 py-2"
                  value={form.nomeCompleto}
                  onChange={(e) => setField("nomeCompleto", e.target.value)}
                  placeholder="Ex.: Maria Silva"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm">Data de nascimento (DD/MM/AAAA)</label>
                <input
                  className="w-full rounded-xl border px-3 py-2"
                  value={form.dataNascimento}
                  onChange={(e) => setField("dataNascimento", normalizeDateBR(e.target.value))}
                  placeholder="DD/MM/AAAA"
                  inputMode="numeric"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm">CPF</label>
                <input
                  className="w-full rounded-xl border px-3 py-2"
                  value={form.cpf}
                  onChange={(e) => setField("cpf", normalizeCpf(e.target.value))}
                  placeholder="Somente números"
                />
              </div>

              {/* ✅ ADICIONADO */}
              <div>
                <label className="mb-1 block text-sm">Telefone</label>
                <input
                  className="w-full rounded-xl border px-3 py-2"
                  value={form.telefone}
                  onChange={(e) => setField("telefone", normalizeTelefone(e.target.value))}
                  placeholder="DDD + número (somente números)"
                  inputMode="numeric"
                />
              </div>
            </div>
          </section>

          <section className="rounded-2xl border bg-white p-4">
            <h2 className="mb-3 font-semibold">Acessos e dados bancários</h2>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm">E-mail criado</label>
                <input
                  className="w-full rounded-xl border px-3 py-2"
                  value={form.emailCriado}
                  onChange={(e) => setField("emailCriado", e.target.value)}
                />
              </div>

              <div>
                <label className="mb-1 block text-sm">Senha do e-mail</label>
                <input
                  className="w-full rounded-xl border px-3 py-2"
                  value={form.senhaEmail}
                  onChange={(e) => setField("senhaEmail", e.target.value)}
                />
              </div>

              <div>
                <label className="mb-1 block text-sm">Senha Smiles</label>
                <input
                  className="w-full rounded-xl border px-3 py-2"
                  value={form.senhaSmiles}
                  onChange={(e) => setField("senhaSmiles", e.target.value)}
                />
              </div>

              <div>
                <label className="mb-1 block text-sm">Senha Latam Pass</label>
                <input
                  className="w-full rounded-xl border px-3 py-2"
                  value={form.senhaLatamPass}
                  onChange={(e) => setField("senhaLatamPass", e.target.value)}
                />
              </div>

              <div>
                <label className="mb-1 block text-sm">Senha Livelo</label>
                <input
                  className="w-full rounded-xl border px-3 py-2"
                  value={form.senhaLivelo}
                  onChange={(e) => setField("senhaLivelo", e.target.value)}
                />
              </div>

              <div>
                <label className="mb-1 block text-sm">Senha Esfera</label>
                <input
                  className="w-full rounded-xl border px-3 py-2"
                  value={form.senhaEsfera}
                  onChange={(e) => setField("senhaEsfera", e.target.value)}
                />
              </div>

              <div>
                <label className="mb-1 block text-sm">Tipo de chave PIX</label>
                <select
                  className="w-full rounded-xl border px-3 py-2 bg-white"
                  value={form.pixTipo}
                  onChange={(e) => setField("pixTipo", e.target.value as PixTipo)}
                >
                  <option value="">Selecione</option>
                  <option value="CPF">CPF</option>
                  <option value="CNPJ">CNPJ</option>
                  <option value="EMAIL">E-mail</option>
                  <option value="TELEFONE">Telefone</option>
                  <option value="ALEATORIA">Aleatória</option>
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm">Chave PIX (do titular)</label>
                <input
                  className="w-full rounded-xl border px-3 py-2"
                  value={form.chavePix}
                  onChange={(e) => setField("chavePix", e.target.value)}
                  placeholder="CPF / e-mail / telefone / aleatória"
                />
                <div className="text-[11px] text-slate-500 mt-1">
                  Pagamento <b>somente ao titular</b>. Não será realizado pagamento em conta de terceiros.
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm">Banco</label>
                <input
                  className="w-full rounded-xl border px-3 py-2"
                  value={form.banco}
                  onChange={(e) => setField("banco", e.target.value)}
                  placeholder="Ex.: Nubank, Inter..."
                />
              </div>
            </div>
          </section>

          <section className="rounded-2xl border bg-white p-4">
            <h2 className="mb-3 font-semibold">Pontos</h2>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <FieldNumber label="Latam" value={form.pontosLatam} onChange={(v) => setField("pontosLatam", v)} />
              <FieldNumber label="Smiles" value={form.pontosSmiles} onChange={(v) => setField("pontosSmiles", v)} />
              <FieldNumber label="Livelo" value={form.pontosLivelo} onChange={(v) => setField("pontosLivelo", v)} />
              <FieldNumber label="Esfera" value={form.pontosEsfera} onChange={(v) => setField("pontosEsfera", v)} />
            </div>
          </section>

          {duplicateInfo ? (
            <section className="rounded-2xl border border-amber-300 bg-amber-50 p-4 space-y-4">
              <div>
                <h2 className="font-semibold text-amber-900">Duplicidade encontrada</h2>
                <p className="text-sm text-amber-800">{duplicateInfo.error}</p>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="rounded-xl border border-amber-200 bg-white p-3">
                  <div className="mb-2 text-sm font-semibold">Cadastro atual</div>
                  <div className="space-y-1 text-sm text-slate-700">
                    <div><b>Nome:</b> {duplicateInfo.existing.nomeCompleto}</div>
                    <div><b>ID:</b> {duplicateInfo.existing.identificador}</div>
                    <div><b>Status:</b> {formatCedenteStatus(duplicateInfo.existing.status)}</div>
                    <div><b>Responsável:</b> @{duplicateInfo.existing.owner.login}</div>
                    <div><b>Telefone:</b> {formatFieldValue(duplicateInfo.existing.telefone)}</div>
                    <div><b>E-mail:</b> {formatFieldValue(duplicateInfo.existing.emailCriado)}</div>
                    <div><b>Banco:</b> {formatFieldValue(duplicateInfo.existing.banco)}</div>
                    <div><b>PIX:</b> {duplicateInfo.existing.pixTipo} • {formatFieldValue(duplicateInfo.existing.chavePix)}</div>
                    <div><b>Latam:</b> {duplicateInfo.existing.pontosLatam}</div>
                    <div><b>Smiles:</b> {duplicateInfo.existing.pontosSmiles}</div>
                    <div><b>Livelo:</b> {duplicateInfo.existing.pontosLivelo}</div>
                    <div><b>Esfera:</b> {duplicateInfo.existing.pontosEsfera}</div>
                  </div>
                </div>

                <div className="rounded-xl border border-emerald-200 bg-white p-3">
                  <div className="mb-2 text-sm font-semibold">O que vai atualizar</div>
                  <div className="space-y-1 text-sm text-slate-700">
                    <FieldDiff label="Nome" current={duplicateInfo.existing.nomeCompleto} next={form.nomeCompleto.trim()} />
                    <FieldDiff label="Telefone" current={duplicateInfo.existing.telefone} next={normalizeTelefone(form.telefone)} />
                    <FieldDiff label="E-mail" current={duplicateInfo.existing.emailCriado} next={form.emailCriado.trim() || null} />
                    <FieldDiff label="Banco" current={duplicateInfo.existing.banco} next={form.banco.trim()} />
                    <FieldDiff label="PIX" current={`${duplicateInfo.existing.pixTipo} • ${duplicateInfo.existing.chavePix}`} next={`${form.pixTipo || "—"} • ${form.chavePix.trim() || "—"}`} />
                    <FieldDiff label="Latam" current={duplicateInfo.existing.pontosLatam} next={Number(form.pontosLatam || 0)} />
                    <FieldDiff label="Smiles" current={duplicateInfo.existing.pontosSmiles} next={Number(form.pontosSmiles || 0)} />
                    <FieldDiff label="Livelo" current={duplicateInfo.existing.pontosLivelo} next={Number(form.pontosLivelo || 0)} />
                    <FieldDiff label="Esfera" current={duplicateInfo.existing.pontosEsfera} next={Number(form.pontosEsfera || 0)} />
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                {duplicateInfo.updateAllowed ? (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={handleDuplicateUpdate}
                    className="rounded-xl bg-amber-600 px-4 py-2 text-sm text-white hover:bg-amber-700 disabled:opacity-60"
                  >
                    {saving ? "Atualizando..." : "Atualizar cadastro existente"}
                  </button>
                ) : (
                  <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
                    Este CPF já está em um cadastro ativo. Revise o cadastro atual antes de prosseguir.
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => setDuplicateInfo(null)}
                  className="rounded-xl border px-4 py-2 text-sm hover:bg-white"
                >
                  Fechar aviso
                </button>
              </div>
            </section>
          ) : null}

          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-xl bg-black px-4 py-2 text-white hover:bg-slate-900 disabled:opacity-60"
          >
            {saving ? "Enviando..." : "Enviar cadastro"}
          </button>

          <div className="rounded-2xl border bg-white p-4 text-xs text-slate-600">
            <b>⚠️ Aviso:</b> por enquanto senhas estão sendo salvas em texto (como solicitado).
          </div>
        </form>
      </div>
    </div>
  );
}

function FieldNumber({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | "";
  onChange: (v: number | "") => void;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm">{label}</label>
      <input
        type="number"
        min={0}
        className="w-full rounded-xl border px-3 py-2"
        value={value}
        onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
      />
    </div>
  );
}

function FieldDiff({
  label,
  current,
  next,
}: {
  label: string;
  current: unknown;
  next: unknown;
}) {
  const currentLabel = formatFieldValue(current);
  const nextLabel = formatFieldValue(next);
  const changed = currentLabel !== nextLabel;

  return (
    <div className={changed ? "rounded-lg bg-emerald-50 px-2 py-1" : "rounded-lg px-2 py-1"}>
      <b>{label}:</b> {currentLabel} {" → "} {nextLabel}
      {changed ? <span className="ml-2 text-xs font-medium text-emerald-700">vai mudar</span> : null}
    </div>
  );
}
