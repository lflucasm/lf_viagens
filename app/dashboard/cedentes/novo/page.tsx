"use client";

import { useMemo, useState } from "react";

type PixTipo = "CPF" | "CNPJ" | "EMAIL" | "TELEFONE" | "ALEATORIA" | "";

type FormState = {
  nomeCompleto: string;
  dataNascimento: string; // DD/MM/AAAA
  cpf: string;

  // ✅ obrigatório
  telefone: string;

  emailCriado: string;
  senhaEmail: string;

  senhaSmiles: string;
  senhaLatamPass: string;
  senhaLivelo: string;
  senhaEsfera: string;

  // ✅ PIX obrigatório (schema exige banco + pixTipo + chavePix)
  pixTipo: PixTipo;
  chavePix: string;
  banco: string;

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

// Brasil: normalmente 10 ou 11 dígitos com DDD
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

function makeIdentifier(nomeCompleto: string) {
  const cleaned = (nomeCompleto || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}+/gu, "")
    .toUpperCase()
    .replace(/[^\p{L}\p{N}\s']/gu, " ")
    .trim();

  const base = (cleaned.split(/\s+/)[0] || "CED").replace(/[^A-Z0-9]/g, "");
  const prefix = (base.slice(0, 3) || "CED").padEnd(3, "X");
  return `${prefix}-${Date.now().toString().slice(-6)}`;
}

export default function CedentesNovoPage() {
  const [mode, setMode] = useState<"manual" | "link" | null>(null);

  const [form, setForm] = useState<FormState>({
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

    pixTipo: "",
    chavePix: "",
    banco: "",

    pontosLatam: "",
    pontosSmiles: "",
    pontosLivelo: "",
    pontosEsfera: "",
  });

  const [saving, setSaving] = useState(false);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteUrl, setInviteUrl] = useState<string>("");

  const identificador = useMemo(() => {
    return form.nomeCompleto.trim() ? makeIdentifier(form.nomeCompleto) : "";
  }, [form.nomeCompleto]);

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function submitManual(e: React.FormEvent) {
    e.preventDefault();

    if (!form.nomeCompleto.trim()) return alert("Informe o nome completo.");
    if (normalizeCpf(form.cpf).length !== 11) return alert("CPF inválido (11 dígitos).");

    const tel = normalizeTelefone(form.telefone);
    if (!tel) return alert("Informe o telefone.");
    if (!(tel.length === 10 || tel.length === 11)) return alert("Telefone inválido (DDD + número).");

    const isoNascimento = form.dataNascimento.trim() ? brToIsoDate(form.dataNascimento) : null;
    if (form.dataNascimento.trim() && !isoNascimento) {
      return alert("Data de nascimento inválida. Use DD/MM/AAAA.");
    }

    // ✅ PIX obrigatório (schema + regra)
    if (!form.banco.trim()) return alert("Informe o banco (pagamento apenas ao titular).");
    if (!form.pixTipo) return alert("Informe o tipo da chave PIX.");
    if (!form.chavePix.trim()) return alert("Informe a chave PIX do titular.");

    try {
      setSaving(true);

      const payload = {
        identificador: makeIdentifier(form.nomeCompleto),
        nomeCompleto: form.nomeCompleto.trim(),
        cpf: normalizeCpf(form.cpf),
        telefone: tel,
        dataNascimento: isoNascimento,
        emailCriado: form.emailCriado.trim() || null,

        banco: form.banco.trim(),
        pixTipo: form.pixTipo,
        chavePix: form.chavePix.trim(),

        // sem criptografia (como você pediu)
        senhaEmailEnc: form.senhaEmail || null,
        senhaSmilesEnc: form.senhaSmiles || null,
        senhaLatamPassEnc: form.senhaLatamPass || null,
        senhaLiveloEnc: form.senhaLivelo || null,
        senhaEsferaEnc: form.senhaEsfera || null,

        pontosLatam: Number(form.pontosLatam || 0),
        pontosSmiles: Number(form.pontosSmiles || 0),
        pontosLivelo: Number(form.pontosLivelo || 0),
        pontosEsfera: Number(form.pontosEsfera || 0),
      };

      const res = await fetch("/api/cedentes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json().catch(() => null);
      if (!json?.ok) throw new Error(json?.error || "Falha ao cadastrar.");

      alert("Cedente cadastrado ✅");

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

        pixTipo: "",
        chavePix: "",
        banco: "",

        pontosLatam: "",
        pontosSmiles: "",
        pontosLivelo: "",
        pontosEsfera: "",
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao cadastrar.";
      alert(msg);
    } finally {
      setSaving(false);
    }
  }

  // ✅ puxa o link do FUNCIONÁRIO LOGADO
  // Se não existir, backend deve devolver mensagem pedindo criar na aba Funcionários
  async function generateInvite() {
    if (form.cpf && normalizeCpf(form.cpf).length !== 11) return alert("CPF inválido (11 dígitos).");

    try {
      setInviteLoading(true);
      setInviteUrl("");

      const res = await fetch("/api/me/invite", { method: "GET", cache: "no-store" });
      const json = await res.json().catch(() => null);

      if (!json?.ok) {
        throw new Error(
          json?.error || "Falha ao buscar convite do funcionário logado. Crie o funcionário na aba Funcionários."
        );
      }

      const code = String(json.data?.inviteCode || "");
      if (!code) {
        throw new Error("Seu usuário não possui código de convite. Crie/atualize na aba Funcionários.");
      }

      const url = `${window.location.origin}/convite/${code}`;
      setInviteUrl(url);

      try {
        await navigator.clipboard.writeText(url);
      } catch {}
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao gerar convite.";
      alert(msg);
    } finally {
      setInviteLoading(false);
    }
  }

  return (
    <div className="max-w-3xl">
      <h1 className="mb-2 text-2xl font-bold">Cadastrar cedente</h1>
      <p className="mb-6 text-sm text-slate-600">
        Escolha: cadastro manual (feito por você) ou gerar um link para o cedente preencher (convite).
      </p>

      <div className="mb-6 flex gap-2">
        <button
          type="button"
          onClick={() => {
            setMode("manual");
            setInviteUrl("");
          }}
          className={`rounded-xl border px-4 py-2 text-sm ${
            mode === "manual" ? "bg-black text-white" : "hover:bg-slate-50"
          }`}
        >
          Cadastro manual
        </button>

        <button
          type="button"
          onClick={() => {
            setMode("link");
            setInviteUrl("");
          }}
          className={`rounded-xl border px-4 py-2 text-sm ${
            mode === "link" ? "bg-black text-white" : "hover:bg-slate-50"
          }`}
        >
          Gerar link (convite)
        </button>
      </div>

      {mode === null && (
        <div className="rounded-2xl border p-6 text-sm text-slate-600">Selecione uma opção acima para continuar.</div>
      )}

      {/* =======================
          CADASTRO MANUAL
      ======================= */}
      {mode === "manual" && (
        <form onSubmit={submitManual} className="space-y-6">
          <section className="rounded-2xl border p-4">
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

              <div>
                <label className="mb-1 block text-sm">Identificador (prévia)</label>
                <input className="w-full rounded-xl border px-3 py-2" value={identificador} readOnly />
              </div>
            </div>
          </section>

          <section className="rounded-2xl border p-4">
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
                  placeholder="(sem criptografia por enquanto)"
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
                <label className="mb-1 block text-sm">Chave PIX</label>
                <input
                  className="w-full rounded-xl border px-3 py-2"
                  value={form.chavePix}
                  onChange={(e) => setField("chavePix", e.target.value)}
                  placeholder="CPF / e-mail / telefone / aleatória"
                />
                <div className="text-[11px] text-slate-500 mt-1">
                  Pagamento <b>somente ao titular</b>.
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

          <section className="rounded-2xl border p-4">
            <h2 className="mb-3 font-semibold">Pontos</h2>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <FieldNumber label="Latam" value={form.pontosLatam} onChange={(v) => setField("pontosLatam", v)} />
              <FieldNumber label="Smiles" value={form.pontosSmiles} onChange={(v) => setField("pontosSmiles", v)} />
              <FieldNumber label="Livelo" value={form.pontosLivelo} onChange={(v) => setField("pontosLivelo", v)} />
              <FieldNumber label="Esfera" value={form.pontosEsfera} onChange={(v) => setField("pontosEsfera", v)} />
            </div>
          </section>

          <button
            type="submit"
            disabled={saving}
            className="rounded-xl bg-black px-4 py-2 text-white hover:bg-slate-900 disabled:opacity-60"
          >
            {saving ? "Salvando..." : "Cadastrar manualmente"}
          </button>
        </form>
      )}

      {/* =======================
          GERAR LINK (FUNCIONÁRIO LOGADO)
      ======================= */}
      {mode === "link" && (
        <div className="max-w-xl rounded-2xl border p-6 space-y-4">
          <h2 className="text-lg font-semibold">Gerar link de convite</h2>
          <p className="text-sm text-slate-600">
            Esse link é o <b>convite do funcionário logado</b>. Copie e envie para o cedente preencher.
          </p>

          <button
            type="button"
            onClick={generateInvite}
            disabled={inviteLoading}
            className="rounded-xl bg-black px-4 py-2 text-white hover:bg-slate-900 disabled:opacity-60"
          >
            {inviteLoading ? "Gerando..." : "Gerar link"}
          </button>

          {inviteUrl && (
            <div className="rounded-xl border bg-slate-50 p-3 text-sm">
              <div className="mb-1 font-medium">Link do convite:</div>

              <div className="flex items-center gap-2">
                <input className="flex-1 rounded-lg border px-2 py-1 text-xs" value={inviteUrl} readOnly />
                <button
                  type="button"
                  onClick={() => navigator.clipboard.writeText(inviteUrl)}
                  className="rounded-lg border px-2 py-1 text-xs hover:bg-slate-100"
                >
                  Copiar
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="mt-8 rounded-2xl border p-4 text-xs text-slate-600">
        <b>⚠️ Aviso importante:</b> por enquanto estamos salvando senhas em texto no banco (como você pediu). Isso é
        arriscado. Quando você quiser, dá para trocar para criptografia reversível sem mudar o fluxo.
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
