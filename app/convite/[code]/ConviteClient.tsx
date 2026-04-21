"use client";

import { useEffect, useState } from "react";

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

const TERMO_VERSAO = "v2-2026-03";

/**
 * ✅ TERMO COMPLETO (texto integral)
 * - fica no client só pra exibir pro cedente
 * - a prova/registro fica no backend com termoVersao + ip + userAgent
 */
const TERMO_TEXTO = `TERMO DE CIÊNCIA E AUTORIZAÇÃO – VIAS AÉREAS

Este Termo tem por finalidade registrar a ciência expressa e autorização do TITULAR da conta para participação nas operações de compra e venda de milhas realizadas pela VIAS AÉREAS VIAGENS E TURISMO LTDA, inscrita no CNPJ sob nº 63.817.773/0001-85.

1. OBJETO E FUNCIONAMENTO DAS OPERAÇÕES
A Vias Aéreas atua na intermediação de passagens aéreas emitidas por meio dos programas de fidelidade Livelo, LATAM Pass e Smiles.
Para viabilizar operações com margem de lucro, podem ser necessárias as seguintes etapas:
• Adesão a clubes de pontos/milhas (Livelo, LATAM Pass e Smiles);
• Aquisição de pontos e milhas com recursos próprios da Vias Aéreas;
• Transferências internas de pontos;
• Emissão de passagens aéreas;
• Comercialização dessas passagens em balcões especializados de milhas.

2. DO INVESTIMENTO E AUSÊNCIA DE PREJUÍZO AO CEDENTE
Todo o capital investido nas operações é exclusivamente da Vias Aéreas. O TITULAR declara ciência de que:
• Não realiza qualquer pagamento, PIX, transferência ou investimento;
• Não assume risco financeiro;
• Não sofre prejuízo patrimonial;
• Não possui responsabilidade por atrasos, cancelamentos ou falhas operacionais.

3. DO PAGAMENTO AO TITULAR
Os valores pagos ao TITULAR correspondem à antecipação de lucro pela utilização da conta nos programas de fidelidade.
O pagamento:
• Será realizado exclusivamente ao TITULAR da conta;
• Será feito via PIX em conta bancária de mesma titularidade;
• Não será realizado pagamento em conta de terceiros.

4. DA AQUISIÇÃO DE PONTOS
O TITULAR declara ciência de que a aquisição de pontos e milhas realizada pela Vias Aéreas não gera qualquer dívida, obrigação financeira ou responsabilidade tributária ao TITULAR.

5. DAS VALIDAÇÕES DE IDENTIDADE E DOCUMENTAÇÃO
O TITULAR declara ciência de que as plataformas Livelo, LATAM Pass e Smiles poderão, a qualquer tempo, solicitar validações adicionais de identidade, conforme suas políticas internas, incluindo, sem se limitar a:
• Documento oficial de identificação com foto (RG ou CNH) emitido há menos de 10 (dez) anos;
• Comprovante de residência atualizado;
• Selfie para conferência facial;
• Biometria facial;
• Envio de códigos por SMS;
• Confirmações por ligação telefônica ou aplicativos oficiais.
O TITULAR compromete-se a fornecer tais validações sempre que solicitado, de forma tempestiva e verdadeira, ciente de que a negativa, omissão ou recusa poderá resultar em bloqueio ou suspensão da conta junto às plataformas.
No caso específico da LATAM, o TITULAR declara ciência de que a biometria facial poderá ser obrigatória para viabilizar a venda e emissão de passagens com os pontos da conta. Nessa hipótese, quando houver pagamento antecipado de R$ 80,00 (oitenta reais) ao TITULAR no momento da compra dos pontos, o TITULAR assume a obrigação de realizar as até 6 (seis) biometrias faciais necessárias para conclusão das operações vinculadas àquela venda.
O TITULAR declara ainda ciência de que a recusa, omissão, atraso injustificado ou não realização das biometrias faciais solicitadas pela LATAM autoriza o cancelamento imediato deste vínculo/termo, uma vez que tal conduta gera prejuízo operacional e financeiro direto à Vias Aéreas.

6. DA PROTEÇÃO E TRATAMENTO DE DADOS
Os dados pessoais fornecidos pelo TITULAR serão armazenados em ambiente seguro, em banco de dados protegido (OneDrive corporativo da Vias Aéreas).
O TITULAR poderá solicitar, a qualquer momento, a exclusão definitiva e irrevogável de seus dados. Ciente, contudo, de que:
• A exclusão inviabiliza novo ingresso;
• Não será permitida nova indicação;
• O vínculo operacional será encerrado permanentemente.

7. DA INDICAÇÃO DE NOVOS CEDENTES
Para unificação de novos cedentes, poderá ser pago o valor de R$ 20,00 (vinte reais) por indicação válida.
Caso o cedente indicado descumpra o presente termo e gere prejuízo à Vias Aéreas, o TITULAR que realizou a indicação ficará impossibilitado de realizar novas indicações.

8. DA RESCISÃO E DAS CONSEQUÊNCIAS DA NEGATIVA DE VALIDAÇÃO
Este termo poderá ser rescindido a qualquer momento por qualquer das partes.
Caso o TITULAR opte por não prosseguir com as operações, a Vias Aéreas poderá apenas consumir os pontos e milhas já adquiridos, a fim de evitar prejuízo financeiro.
A negativa injustificada, omissão ou recusa no fornecimento das validações descritas neste termo poderá resultar em:
• Bloqueio ou suspensão da conta do TITULAR;
• Cancelamento de operações em andamento;
• Prejuízo financeiro direto à Vias Aéreas.
No caso de pagamento antecipado vinculado à operação LATAM, a recusa em realizar as biometrias faciais exigidas para conclusão da venda implicará cancelamento imediato deste termo e encerramento da parceria operacional.
Nessas hipóteses, o TITULAR declara ciência de que seus dados poderão ser removidos do banco de dados e ficará impedido de futuras negociações.

9. DO IMPOSTO DE RENDA
Os valores eventualmente recebidos pelo TITULAR possuem caráter eventual, não configurando vínculo empregatício.
Cabe ao TITULAR avaliar eventual obrigação de declaração à Receita Federal.

10. DA VERACIDADE E CIÊNCIA EXPRESSA
Para fins de verificação pública e transparência, o TITULAR poderá consultar o perfil oficial da empresa no Instagram: @viasaereastrip.
Ao manifestar concordância, o TITULAR declara que:
• Leu integralmente este termo;
• Compreendeu seu funcionamento;
• Não sofreu indução, erro ou coação;
• Autoriza expressamente a utilização de sua conta conforme descrito.`;

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
      termoVersao: TERMO_VERSAO,
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
      const err: any = new Error(json?.error || "Falha ao cadastrar.");
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
    } catch (e: any) {
      if (e?.isDuplicate) return;
      alert(e?.message || "Erro ao atualizar cadastro.");
    } finally {
      setSaving(false);
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
    } catch (e: any) {
      setInviteError(e?.message || "Erro ao carregar convite.");
      setResponsavel(null);
    } finally {
      setLoadingInvite(false);
    }
  }

  useEffect(() => {
    loadInvite();
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
    } catch (e: any) {
      if (e?.isDuplicate) return;
      alert(e?.message || "Erro ao enviar.");
    } finally {
      setSaving(false);
    }
  }

  if (loadingInvite) {
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
          <div className="text-xs text-slate-500">Versão: {TERMO_VERSAO}</div>

          <div className="rounded-xl border bg-slate-50 p-3 text-xs whitespace-pre-wrap leading-relaxed max-h-[320px] overflow-auto">
            {TERMO_TEXTO}
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
