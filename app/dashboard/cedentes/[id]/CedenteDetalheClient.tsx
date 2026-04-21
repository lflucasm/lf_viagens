"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";

type Owner = { id: string; name: string; login: string };

type Cedente = {
  id: string;
  identificador: string;

  nomeCompleto: string;
  cpf: string;

  telefone: string | null;
  dataNascimento: string | null; // ISO ou YYYY-MM-DD ou null
  emailCriado: string | null;

  banco: string | null;
  pixTipo: string | null; // enum no backend
  chavePix: string | null;

  senhaEmail: string | null;
  senhaSmiles: string | null;
  senhaLatamPass: string | null;
  senhaLivelo: string | null;
  senhaEsfera: string | null;

  pontosLatam: number;
  pontosSmiles: number;
  pontosLivelo: number;
  pontosEsfera: number;

  owner?: Owner | null;

  status?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

function toISODateInput(v: string | null | undefined) {
  if (!v) return "";
  // pega YYYY-MM-DD de qualquer ISO
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  const d = new Date(v);
  if (isNaN(d.getTime())) return "";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/* =========================
   COMPONENTES FORA DO CLIENT
========================= */

function InputField({
  label,
  value,
  onChange,
  type = "text",
  disabled,
  editing,
}: {
  label: string;
  value: any;
  onChange: (v: any) => void;
  type?: string;
  disabled?: boolean;
  editing: boolean;
}) {
  return (
    <div>
      <label className="text-xs text-slate-500">{label}</label>
      <input
        type={type}
        value={value ?? ""}
        disabled={disabled ?? !editing}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded border px-3 py-2 text-sm disabled:bg-slate-50"
      />
    </div>
  );
}

function NumberInputField({
  label,
  value,
  onChange,
  disabled,
  editing,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
  editing: boolean;
}) {
  return (
    <div>
      <label className="text-xs text-slate-500">{label}</label>
      <input
        type="number"
        value={Number.isFinite(value) ? value : 0}
        disabled={disabled ?? !editing}
        onChange={(e) => onChange(Number(e.target.value || 0))}
        className="w-full rounded border px-3 py-2 text-sm disabled:bg-slate-50"
      />
    </div>
  );
}

function SecretField({
  label,
  value,
  onChange,
  editing,
}: {
  label: string;
  value: string | null;
  onChange: (v: string) => void;
  editing: boolean;
}) {
  const [show, setShow] = useState(false);

  return (
    <div className="rounded-xl border p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-semibold text-slate-600">{label}</div>
        <div className="flex gap-2">
          {value ? (
            <button
              type="button"
              className="rounded-lg border px-2 py-1 text-xs hover:bg-slate-50"
              onClick={() => setShow((s) => !s)}
            >
              {show ? "Ocultar" : "Mostrar"}
            </button>
          ) : null}

          {value ? (
            <button
              type="button"
              className="rounded-lg border px-2 py-1 text-xs hover:bg-slate-50"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(value);
                  alert("✅ Copiado!");
                } catch {
                  alert("Não consegui copiar.");
                }
              }}
            >
              Copiar
            </button>
          ) : null}
        </div>
      </div>

      <div className="mt-2">
        <input
          type={show ? "text" : "password"}
          value={value ?? ""}
          disabled={!editing}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded border px-3 py-2 text-sm disabled:bg-slate-50 font-mono"
          placeholder="—"
        />
      </div>
    </div>
  );
}

/* =========================
   CLIENT
========================= */

async function safeJson(res: Response) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

export default function CedenteDetalheClient() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const search = useSearchParams();

  const editParam = search.get("edit");

  const [data, setData] = useState<Cedente | null>(null);
  const [form, setForm] = useState<Cedente | null>(null);
  const [loading, setLoading] = useState(true);

  // ✅ inicializa com ?edit=1 e só atualiza se o param mudar
  const [editing, setEditing] = useState(editParam === "1");
  useEffect(() => {
    setEditing(editParam === "1");
  }, [editParam]);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`/api/cedentes/${id}`, { cache: "no-store" });
      const json = await safeJson(res);

      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || `Erro ao carregar (HTTP ${res.status}).`);
      }

      setData(json.data);
      setForm(json.data);
    } catch (e: any) {
      alert(e?.message || "Erro ao carregar.");
      setData(null);
      setForm(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (id) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  function patch<K extends keyof Cedente>(key: K, value: Cedente[K]) {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  async function salvar() {
    if (!form) return;

    try {
      const res = await fetch(`/api/cedentes/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const json = await safeJson(res);

      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || `Erro ao salvar (HTTP ${res.status}).`);
      }

      setEditing(false);
      await load();
      alert("✅ Cedente atualizado com sucesso.");
    } catch (e: any) {
      alert(e?.message || "Erro ao salvar.");
    }
  }

  const ownerLabel = useMemo(() => {
    if (!form?.owner) return "-";
    return `${form.owner.name} (@${form.owner.login})`;
  }, [form?.owner]);

  if (loading) return <div className="p-6 text-sm">Carregando…</div>;
  if (!form) return <div className="p-6 text-sm">Cedente não encontrado.</div>;

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{form.nomeCompleto}</h1>
          <p className="text-sm text-slate-600">
            {form.identificador} • CPF: {form.cpf}
          </p>
          <p className="text-xs text-slate-500">Responsável: {ownerLabel}</p>
        </div>

        <div className="flex gap-2">
          {!editing ? (
            <button
              onClick={() => setEditing(true)}
              className="rounded-xl border px-4 py-2 text-sm"
            >
              ✏️ Editar
            </button>
          ) : (
            <>
              <button
                onClick={() => {
                  setForm(data);
                  setEditing(false);
                }}
                className="rounded-xl border px-4 py-2 text-sm"
              >
                Cancelar
              </button>
              <button
                onClick={salvar}
                className="rounded-xl bg-black px-4 py-2 text-sm text-white"
              >
                💾 Salvar
              </button>
            </>
          )}

          <button
            onClick={() => router.back()}
            className="rounded-xl border px-4 py-2 text-sm"
          >
            Voltar
          </button>
        </div>
      </div>

      {/* DADOS PRINCIPAIS */}
      <section className="rounded-xl border p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
        <InputField
          label="Identificador"
          value={form.identificador}
          onChange={(v) => patch("identificador", v)}
          editing={editing}
          disabled={!editing}
        />

        <InputField
          label="CPF"
          value={form.cpf}
          onChange={() => {}}
          editing={editing}
          disabled={true}
        />

        <InputField
          label="Nome completo"
          value={form.nomeCompleto}
          onChange={(v) => patch("nomeCompleto", v)}
          editing={editing}
        />

        <InputField
          label="Telefone"
          value={form.telefone}
          onChange={(v) => patch("telefone", v)}
          editing={editing}
        />

        <InputField
          label="Email criado"
          value={form.emailCriado}
          onChange={(v) => patch("emailCriado", v)}
          editing={editing}
        />

        <InputField
          label="Data de nascimento"
          type="date"
          value={toISODateInput(form.dataNascimento)}
          onChange={(v) => patch("dataNascimento", v || null)}
          editing={editing}
        />
      </section>

      {/* BANCO / PIX */}
      <section className="rounded-xl border p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
        <InputField
          label="Banco"
          value={form.banco}
          onChange={(v) => patch("banco", v)}
          editing={editing}
        />

        <div>
          <label className="text-xs text-slate-500">Pix tipo</label>
          <select
            className="w-full rounded border px-3 py-2 text-sm disabled:bg-slate-50"
            disabled={!editing}
            value={(form.pixTipo ?? "CPF").toUpperCase()}
            onChange={(e) => patch("pixTipo", e.target.value)}
          >
            <option value="CPF">CPF</option>
            <option value="CNPJ">CNPJ</option>
            <option value="EMAIL">EMAIL</option>
            <option value="TELEFONE">TELEFONE</option>
            <option value="ALEATORIA">ALEATORIA</option>
          </select>
        </div>

        <InputField
          label="Chave Pix"
          value={form.chavePix}
          onChange={(v) => patch("chavePix", v)}
          editing={editing}
        />
      </section>

      {/* SENHAS */}
      <section className="rounded-xl border p-4 space-y-3">
        <div className="text-sm font-semibold">Senhas (interno)</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <SecretField
            label="Senha Email"
            value={form.senhaEmail}
            onChange={(v) => patch("senhaEmail", v)}
            editing={editing}
          />
          <SecretField
            label="Senha Smiles"
            value={form.senhaSmiles}
            onChange={(v) => patch("senhaSmiles", v)}
            editing={editing}
          />
          <SecretField
            label="Senha LATAM Pass"
            value={form.senhaLatamPass}
            onChange={(v) => patch("senhaLatamPass", v)}
            editing={editing}
          />
          <SecretField
            label="Senha Livelo"
            value={form.senhaLivelo}
            onChange={(v) => patch("senhaLivelo", v)}
            editing={editing}
          />
          <SecretField
            label="Senha Esfera"
            value={form.senhaEsfera}
            onChange={(v) => patch("senhaEsfera", v)}
            editing={editing}
          />
        </div>
      </section>

      {/* PONTOS */}
      <section className="rounded-xl border p-4 grid grid-cols-2 md:grid-cols-4 gap-3">
        <NumberInputField
          label="LATAM"
          value={form.pontosLatam}
          onChange={(v) => patch("pontosLatam", v)}
          editing={editing}
        />
        <NumberInputField
          label="Smiles"
          value={form.pontosSmiles}
          onChange={(v) => patch("pontosSmiles", v)}
          editing={editing}
        />
        <NumberInputField
          label="Livelo"
          value={form.pontosLivelo}
          onChange={(v) => patch("pontosLivelo", v)}
          editing={editing}
        />
        <NumberInputField
          label="Esfera"
          value={form.pontosEsfera}
          onChange={(v) => patch("pontosEsfera", v)}
          editing={editing}
        />
      </section>

      {/* INFO EXTRA */}
      <section className="rounded-xl border p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
        <InputField
          label="Status"
          value={(form as any).status ?? ""}
          onChange={() => {}}
          editing={editing}
          disabled
        />
        <InputField
          label="Criado em"
          value={(form as any).createdAt ?? ""}
          onChange={() => {}}
          editing={editing}
          disabled
        />
        <InputField
          label="Atualizado em"
          value={(form as any).updatedAt ?? ""}
          onChange={() => {}}
          editing={editing}
          disabled
        />
      </section>
    </div>
  );
}
