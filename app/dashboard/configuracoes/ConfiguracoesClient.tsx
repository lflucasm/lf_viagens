"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { PageHeader } from "@/components/dashboard";

type SettingsRow = {
  id: string;
  companyDisplayName: string;
  companyLegalName: string;
  cnpj: string;
  instagramHandle: string;
  phoneDisplay: string;
  whatsappDigits: string;
};

type IndicacaoFormRow = {
  id: string;
  title: string;
  slug: string;
  termVersion: string;
  termBody: string;
  sortOrder: number;
  isActive: boolean;
};

export default function ConfiguracoesClient() {
  const [loading, setLoading] = useState(true);
  const [savingBrand, setSavingBrand] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [settings, setSettings] = useState<SettingsRow | null>(null);
  const [forms, setForms] = useState<IndicacaoFormRow[]>([]);

  const [brandDraft, setBrandDraft] = useState({
    companyDisplayName: "",
    companyLegalName: "",
    cnpj: "",
    instagramHandle: "",
    phoneDisplay: "",
    whatsappDigits: "",
  });

  const [newForm, setNewForm] = useState({
    title: "",
    slug: "",
    termVersion: "",
    termBody: "",
    isActive: true,
  });

  const [removingDemo, setRemovingDemo] = useState(false);
  const [removeDemoMsg, setRemoveDemoMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/app-settings", { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Erro ao carregar.");
      const s = json.data.settings as SettingsRow;
      const f = json.data.indicacaoForms as IndicacaoFormRow[];
      setSettings(s);
      setForms(f);
      setBrandDraft({
        companyDisplayName: s.companyDisplayName,
        companyLegalName: s.companyLegalName,
        cnpj: s.cnpj,
        instagramHandle: s.instagramHandle.replace(/^@/, ""),
        phoneDisplay: s.phoneDisplay,
        whatsappDigits: s.whatsappDigits,
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erro ao carregar.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function removerContasDemo() {
    const ok = window.confirm(
      "Remover do sistema os usuários com login eduarda, paola e lucas (somente o login curto “lucas”, não o lucas_fellype)? " +
        "Cedentes e vínculos passam para o lucas_fellype (ou para você, se ele não existir). " +
        "lucas_fellype e jephesson não são removidos."
    );
    if (!ok) return;
    setRemovingDemo(true);
    setRemoveDemoMsg(null);
    setErr(null);
    try {
      const res = await fetch("/api/admin/remove-demo-staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Falha na operação.");
      const d = json.data as { removed: string[]; skipped: string[]; errors: { login: string; error: string }[] };
      const parts: string[] = [];
      if (d.removed?.length) parts.push(`Removidos: ${d.removed.join(", ")}`);
      if (d.skipped?.length) parts.push(`Ignorados: ${d.skipped.join("; ")}`);
      if (d.errors?.length) parts.push(`Erros: ${d.errors.map((e) => `${e.login}: ${e.error}`).join(" | ")}`);
      setRemoveDemoMsg(parts.join("\n\n") || "Nada a fazer.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erro ao remover.");
    } finally {
      setRemovingDemo(false);
    }
  }

  async function saveBrand(e: React.FormEvent) {
    e.preventDefault();
    setSavingBrand(true);
    setErr(null);
    try {
      const res = await fetch("/api/app-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyDisplayName: brandDraft.companyDisplayName.trim(),
          companyLegalName: brandDraft.companyLegalName.trim(),
          cnpj: brandDraft.cnpj.trim(),
          instagramHandle: brandDraft.instagramHandle.trim().replace(/^@/, ""),
          phoneDisplay: brandDraft.phoneDisplay.trim(),
          whatsappDigits: brandDraft.whatsappDigits.replace(/\D+/g, ""),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Erro ao salvar.");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erro ao salvar.");
    } finally {
      setSavingBrand(false);
    }
  }

  async function saveForm(f: IndicacaoFormRow) {
    setErr(null);
    try {
      const res = await fetch(`/api/cedente-indicacao-forms/${encodeURIComponent(f.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: f.title,
          slug: f.slug,
          termVersion: f.termVersion,
          termBody: f.termBody,
          sortOrder: f.sortOrder,
          isActive: f.isActive,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Erro ao salvar formulário.");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erro ao salvar formulário.");
    }
  }

  async function deleteForm(id: string) {
    if (!confirm("Remover este formulário?")) return;
    setErr(null);
    try {
      const res = await fetch(`/api/cedente-indicacao-forms/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Erro ao remover.");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erro ao remover.");
    }
  }

  async function createForm(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    try {
      const res = await fetch("/api/cedente-indicacao-forms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newForm.title.trim(),
          slug: newForm.slug.trim() || undefined,
          termVersion: newForm.termVersion.trim(),
          termBody: newForm.termBody.trim(),
          isActive: newForm.isActive,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Erro ao criar.");
      setNewForm({ title: "", slug: "", termVersion: "", termBody: "", isActive: true });
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erro ao criar.");
    }
  }

  function updateFormLocal(id: string, patch: Partial<IndicacaoFormRow>) {
    setForms((prev) => prev.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  }

  if (loading && !settings) {
    return (
      <div className="flex items-center gap-2 text-slate-600">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        Carregando…
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-10 pb-16">
      <PageHeader
        title="Configurações"
        description="Marca, contato da empresa e textos da página pública de indicação de cedente."
        actions={
          <Link href="/dashboard" className="text-sm font-medium text-sky-700 hover:underline">
            Voltar ao painel
          </Link>
        }
      />

      {err ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {err}
        </div>
      ) : null}

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Empresa e contato</h2>
        <p className="mt-1 text-sm text-slate-600">
          Estes dados aparecem na página inicial do painel. Instagram e WhatsApp usam somente dígitos no link do
          WhatsApp.
        </p>
        <form onSubmit={saveBrand} className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="space-y-1 sm:col-span-2">
            <span className="text-xs font-medium text-slate-700">Nome fantasia / marca</span>
            <input
              className="w-full rounded-xl border px-3 py-2 text-sm"
              value={brandDraft.companyDisplayName}
              onChange={(e) => setBrandDraft((p) => ({ ...p, companyDisplayName: e.target.value }))}
              required
            />
          </label>
          <label className="space-y-1 sm:col-span-2">
            <span className="text-xs font-medium text-slate-700">Razão social</span>
            <input
              className="w-full rounded-xl border px-3 py-2 text-sm"
              value={brandDraft.companyLegalName}
              onChange={(e) => setBrandDraft((p) => ({ ...p, companyLegalName: e.target.value }))}
              required
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium text-slate-700">CNPJ</span>
            <input
              className="w-full rounded-xl border px-3 py-2 text-sm"
              value={brandDraft.cnpj}
              onChange={(e) => setBrandDraft((p) => ({ ...p, cnpj: e.target.value }))}
              required
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium text-slate-700">Instagram (sem @)</span>
            <input
              className="w-full rounded-xl border px-3 py-2 text-sm"
              value={brandDraft.instagramHandle}
              onChange={(e) =>
                setBrandDraft((p) => ({ ...p, instagramHandle: e.target.value.replace(/^@/, "") }))
              }
              placeholder="ex: minhaempresa"
              required
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium text-slate-700">Telefone (exibição)</span>
            <input
              className="w-full rounded-xl border px-3 py-2 text-sm"
              value={brandDraft.phoneDisplay}
              onChange={(e) => setBrandDraft((p) => ({ ...p, phoneDisplay: e.target.value }))}
              required
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium text-slate-700">WhatsApp (só números, ex.: 5553999760707)</span>
            <input
              className="w-full rounded-xl border px-3 py-2 text-sm"
              value={brandDraft.whatsappDigits}
              onChange={(e) => setBrandDraft((p) => ({ ...p, whatsappDigits: e.target.value.replace(/\D+/g, "") }))}
              inputMode="numeric"
              required
            />
          </label>
          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={savingBrand}
              className="rounded-xl bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {savingBrand ? "Salvando…" : "Salvar dados da empresa"}
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-2xl border border-amber-200/80 bg-amber-50/40 p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Equipe — limpeza rápida</h2>
        <p className="mt-1 text-sm text-slate-600">
          Se ainda aparecerem <strong>eduarda</strong>, <strong>paola</strong> ou <strong>lucas</strong> (login curto)
          na lista de funcionários, use o botão abaixo. Isso roda no servidor com o mesmo critério do script local
          (realoca cedentes etc.). Depois, ajuste o papel do <strong>jephesson</strong> para desenvolvedor na tela de
          edição do funcionário, se quiser que ele suma da folha.
        </p>
        <button
          type="button"
          disabled={removingDemo}
          onClick={removerContasDemo}
          className="mt-4 rounded-xl border border-amber-300 bg-white px-4 py-2 text-sm font-medium text-amber-950 hover:bg-amber-100 disabled:opacity-50"
        >
          {removingDemo ? "Removendo…" : "Remover contas eduarda, paola e lucas"}
        </button>
        {removeDemoMsg ? (
          <pre className="mt-4 max-h-48 overflow-auto whitespace-pre-wrap rounded-xl border border-amber-200 bg-white p-3 text-xs text-slate-800">
            {removeDemoMsg}
          </pre>
        ) : null}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Formulários de indicação de cedente</h2>
        <p className="mt-1 text-sm text-slate-600">
          Cada item abaixo aparece na página pública do link de convite. O titular escolhe qual termo aceitar quando
          houver mais de um ativo. A <strong>versão do termo</strong> deve ser única (é gravada no cadastro do
          cedente).
        </p>

        <div className="mt-6 space-y-8">
          {forms.map((f) => (
            <div key={f.id} className="rounded-xl border border-slate-100 bg-slate-50/50 p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1 sm:col-span-2">
                  <span className="text-xs font-medium text-slate-700">Título (aba na página pública)</span>
                  <input
                    className="w-full rounded-xl border bg-white px-3 py-2 text-sm"
                    value={f.title}
                    onChange={(e) => updateFormLocal(f.id, { title: e.target.value })}
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-medium text-slate-700">Slug (URL interna)</span>
                  <input
                    className="w-full rounded-xl border bg-white px-3 py-2 text-sm font-mono text-xs"
                    value={f.slug}
                    onChange={(e) => updateFormLocal(f.id, { slug: e.target.value.toLowerCase().trim() })}
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-medium text-slate-700">Versão do termo</span>
                  <input
                    className="w-full rounded-xl border bg-white px-3 py-2 text-sm font-mono text-xs"
                    value={f.termVersion}
                    onChange={(e) => updateFormLocal(f.id, { termVersion: e.target.value.trim() })}
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-medium text-slate-700">Ordem</span>
                  <input
                    type="number"
                    className="w-full rounded-xl border bg-white px-3 py-2 text-sm"
                    value={f.sortOrder}
                    onChange={(e) => updateFormLocal(f.id, { sortOrder: Number(e.target.value) || 0 })}
                  />
                </label>
                <label className="flex items-center gap-2 pt-6 text-sm">
                  <input
                    type="checkbox"
                    checked={f.isActive}
                    onChange={(e) => updateFormLocal(f.id, { isActive: e.target.checked })}
                  />
                  Ativo na página pública
                </label>
              </div>
              <label className="mt-3 block space-y-1">
                <span className="text-xs font-medium text-slate-700">Texto integral do termo</span>
                <textarea
                  className="min-h-[220px] w-full rounded-xl border bg-white px-3 py-2 text-xs leading-relaxed"
                  value={f.termBody}
                  onChange={(e) => updateFormLocal(f.id, { termBody: e.target.value })}
                />
              </label>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="rounded-xl bg-black px-3 py-1.5 text-sm font-medium text-white"
                  onClick={() => saveForm(f)}
                >
                  Salvar este formulário
                </button>
                <button
                  type="button"
                  className="rounded-xl border border-rose-200 bg-white px-3 py-1.5 text-sm text-rose-700"
                  onClick={() => deleteForm(f.id)}
                >
                  Excluir
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-10 border-t border-slate-100 pt-8">
          <h3 className="text-sm font-semibold text-slate-900">Novo formulário</h3>
          <form onSubmit={createForm} className="mt-3 grid gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1">
                <span className="text-xs text-slate-600">Título</span>
                <input
                  className="w-full rounded-xl border px-3 py-2 text-sm"
                  value={newForm.title}
                  onChange={(e) => setNewForm((p) => ({ ...p, title: e.target.value }))}
                  required
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-slate-600">Slug (opcional)</span>
                <input
                  className="w-full rounded-xl border px-3 py-2 text-sm font-mono text-xs"
                  value={newForm.slug}
                  onChange={(e) => setNewForm((p) => ({ ...p, slug: e.target.value }))}
                  placeholder="gerado automaticamente se vazio"
                />
              </label>
              <label className="space-y-1 sm:col-span-2">
                <span className="text-xs text-slate-600">Versão do termo (única)</span>
                <input
                  className="w-full rounded-xl border px-3 py-2 text-sm font-mono text-xs"
                  value={newForm.termVersion}
                  onChange={(e) => setNewForm((p) => ({ ...p, termVersion: e.target.value }))}
                  placeholder="ex: v3-2026-06"
                  required
                />
              </label>
            </div>
            <label className="space-y-1">
              <span className="text-xs text-slate-600">Texto do termo</span>
              <textarea
                className="min-h-[200px] w-full rounded-xl border px-3 py-2 text-xs"
                value={newForm.termBody}
                onChange={(e) => setNewForm((p) => ({ ...p, termBody: e.target.value }))}
                required
              />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={newForm.isActive}
                onChange={(e) => setNewForm((p) => ({ ...p, isActive: e.target.checked }))}
              />
              Ativo
            </label>
            <button type="submit" className="w-fit rounded-xl bg-sky-700 px-4 py-2 text-sm font-medium text-white">
              Criar formulário
            </button>
          </form>
        </div>
      </section>
    </div>
  );
}
