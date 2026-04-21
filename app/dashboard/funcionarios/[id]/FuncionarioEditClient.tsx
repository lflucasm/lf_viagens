"use client";

import { useEffect, useMemo, useState } from "react";

type FuncItem = {
  id: string;
  name: string;
  employeeId: string | null;
  login: string;
  cpf: string | null;
  team: string;
  role: string;
  inviteCode: string | null;
  createdAt: string;
  _count?: { cedentes: number };
};

function onlyDigits(v: string) {
  return (v || "").replace(/\D+/g, "").slice(0, 11);
}

function slugifyId(v: string) {
  return (v || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9. _-]/g, "")
    .replace(/\s+/g, ".")
    .replace(/-+/g, "-");
}

function baseUrl() {
  const env = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/+$/, "");
  if (env) return env;
  if (typeof window !== "undefined") return window.location.origin;
  return "";
}

export default function FuncionarioEditClient({ id }: { id: string }) {
  const [item, setItem] = useState<FuncItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const appBase = useMemo(() => baseUrl(), []);

  // campos editáveis
  const [name, setName] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [cpf, setCpf] = useState("");
  const [login, setLogin] = useState("");

  // troca de senha
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPassword2, setNewPassword2] = useState("");

  async function load() {
    setLoading(true);
    setMsg("");
    try {
      const res = await fetch(`/api/funcionarios/${id}`, { cache: "no-store" });
      const json = await res.json();
      if (!json?.ok) throw new Error(json?.error || "Falha ao carregar.");

      const u: FuncItem = json.data;
      setItem(u);

      setName(u.name || "");
      setEmployeeId(u.employeeId || "");
      setCpf(u.cpf || "");
      setLogin(u.login || "");
    } catch (e: any) {
      setMsg(e?.message || "Erro");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const inviteUrl = item?.inviteCode ? `${appBase}/convite/${item.inviteCode}` : "";

  async function salvarDados(e: React.FormEvent) {
    e.preventDefault();
    if (!item) return;

    try {
      setSaving(true);
      setMsg("");

      const payload = {
        name: name.trim(),
        employeeId: slugifyId(employeeId),
        cpf: onlyDigits(cpf),
        login: login.trim().toLowerCase(),
      };

      if (!payload.name) throw new Error("Nome obrigatório.");
      if (!payload.employeeId) throw new Error("ID obrigatório (ex: eduarda.freitas).");
      if (!payload.login) throw new Error("Login obrigatório.");

      const res = await fetch(`/api/funcionarios/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (!json?.ok) throw new Error(json?.error || "Erro ao salvar.");

      setItem((prev) => (prev ? { ...prev, ...json.data } : prev));
      setMsg("✅ Dados salvos com sucesso.");
    } catch (e: any) {
      setMsg(e?.message || "Erro");
    } finally {
      setSaving(false);
    }
  }

  async function trocarSenha() {
    if (!item) return;
    setMsg("");

    try {
      if (!oldPassword || !newPassword || !newPassword2) {
        throw new Error("Preencha senha antiga e a nova duas vezes.");
      }
      if (newPassword.trim().length < 6) throw new Error("Nova senha deve ter pelo menos 6 caracteres.");
      if (newPassword !== newPassword2) throw new Error("As novas senhas não conferem.");

      const res = await fetch(`/api/funcionarios/${item.id}/password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ oldPassword, newPassword, newPassword2 }),
      });

      const json = await res.json();
      if (!json?.ok) throw new Error(json?.error || "Erro ao trocar senha.");

      setOldPassword("");
      setNewPassword("");
      setNewPassword2("");
      setMsg("✅ Senha alterada com sucesso.");
    } catch (e: any) {
      setMsg(e?.message || "Erro");
    }
  }

  async function gerarOuRegenerarLink() {
    if (!item) return;
    setMsg("");
    try {
      const res = await fetch(`/api/funcionarios/${item.id}/invite`, {
        method: "POST",
        cache: "no-store",
      });
      const json = await res.json();
      if (!json?.ok) throw new Error(json?.error || "Falha ao gerar convite.");

      const code = String(json.code || "");
      setItem({ ...item, inviteCode: code });
      setMsg("✅ Link gerado/regenerado com sucesso.");
    } catch (e: any) {
      setMsg(e?.message || "Erro");
    }
  }

  return (
    <div className="p-6 max-w-2xl">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Editar funcionário</h1>
          <p className="text-sm text-slate-600">Edite dados, senha e gere o link de indicação.</p>
        </div>
        <a href="/dashboard/funcionarios" className="rounded-xl border px-3 py-2 text-sm hover:bg-slate-50">
          Voltar
        </a>
      </div>

      {loading && <p className="text-sm text-slate-600">Carregando...</p>}
      {!loading && msg && <p className="text-sm">{msg}</p>}

      {!loading && item && (
        <form onSubmit={salvarDados} className="space-y-4 rounded-2xl border p-4">
          <div className="text-xs text-slate-500">
            Cedentes vinculados: <span className="font-semibold">{item._count?.cedentes ?? 0}</span>
          </div>

          <div>
            <label className="block text-sm mb-1">Nome completo</label>
            <input className="w-full rounded-xl border px-3 py-2" value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div>
            <label className="block text-sm mb-1">ID do funcionário (primeiro.ultimo)</label>
            <input
              className="w-full rounded-xl border px-3 py-2"
              value={employeeId}
              onChange={(e) => setEmployeeId(slugifyId(e.target.value))}
              placeholder="ex: eduarda.freitas"
            />
          </div>

          <div>
            <label className="block text-sm mb-1">CPF</label>
            <input className="w-full rounded-xl border px-3 py-2" value={cpf} onChange={(e) => setCpf(onlyDigits(e.target.value))} />
          </div>

          <div>
            <label className="block text-sm mb-1">Login</label>
            <input className="w-full rounded-xl border px-3 py-2" value={login} onChange={(e) => setLogin(e.target.value)} />
          </div>

          <div>
            <label className="block text-sm mb-1">Time</label>
            <input className="w-full rounded-xl border px-3 py-2 bg-slate-50" value={item.team} readOnly />
          </div>

          <button type="submit" disabled={saving} className="rounded-xl bg-black px-4 py-2 text-white disabled:opacity-60">
            {saving ? "Salvando..." : "Salvar dados"}
          </button>

          {/* Link de indicação */}
          <div className="rounded-2xl border p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">Link de indicação</div>
                <div className="text-xs text-slate-500">Clique para gerar ou regenerar.</div>
              </div>

              <button type="button" onClick={gerarOuRegenerarLink} className="rounded-xl bg-black px-4 py-2 text-white">
                {item.inviteCode ? "Regenerar link" : "Gerar link"}
              </button>
            </div>

            <div className="flex gap-2">
              <input className="w-full rounded-xl border px-3 py-2 text-xs" value={inviteUrl || "—"} readOnly />
              <button
                type="button"
                className="rounded-xl border px-3 py-2 text-xs hover:bg-slate-50 disabled:opacity-60"
                disabled={!inviteUrl}
                onClick={() => {
                  if (!inviteUrl) return;
                  navigator.clipboard.writeText(inviteUrl);
                  alert("Link copiado!");
                }}
              >
                Copiar
              </button>
            </div>
          </div>

          {/* Troca de senha */}
          <div className="rounded-2xl border p-4 space-y-3">
            <div className="text-sm font-semibold">Trocar senha</div>

            <div>
              <label className="block text-sm mb-1">Senha antiga</label>
              <input type="password" className="w-full rounded-xl border px-3 py-2" value={oldPassword} onChange={(e) => setOldPassword(e.target.value)} />
            </div>

            <div>
              <label className="block text-sm mb-1">Nova senha</label>
              <input type="password" className="w-full rounded-xl border px-3 py-2" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
            </div>

            <div>
              <label className="block text-sm mb-1">Repetir nova senha</label>
              <input type="password" className="w-full rounded-xl border px-3 py-2" value={newPassword2} onChange={(e) => setNewPassword2(e.target.value)} />
            </div>

            <button type="button" onClick={trocarSenha} className="rounded-xl border px-4 py-2">
              Alterar senha
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
