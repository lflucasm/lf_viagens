"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Instagram, MessageCircle } from "lucide-react";

export default function LoginClient() {
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const params = useSearchParams();
  const router = useRouter();

  const next = useMemo(() => {
    const raw = params.get("next");
    return raw && raw.startsWith("/dashboard") ? raw : "/dashboard";
  }, [params]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);

    try {
      const r = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "login", login, password }),
      });

      const json = await r.json().catch(() => ({}));
      if (!r.ok || !json?.ok) {
        setErr(json?.error || "Login ou senha inválidos");
        return;
      }

      router.replace(next);
    } catch {
      setErr("Erro de rede. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen grid place-items-center p-6">
      {/* Wrapper pra permitir card + links fora */}
      <div className="w-[min(420px,92vw)]">
        <form
          onSubmit={onSubmit}
          className="space-y-4 rounded-2xl border p-6 shadow-sm bg-white"
        >
          {/* Header */}
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md border border-cyan-300/70 bg-slate-950 text-xs font-bold text-cyan-200 shadow-[0_0_12px_rgba(34,211,238,0.55)]">
              LF
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight text-cyan-300 [text-shadow:0_0_8px_rgba(34,211,238,0.65)]">
                LF Vianges - Trademiles
              </h1>
              <p className="text-xs text-neutral-500">Acesse seu painel</p>
            </div>
          </div>

          {/* Campos */}
          <div className="space-y-3 pt-2">
            <input
              className="w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-black/10"
              placeholder="Login"
              value={login}
              onChange={(e) => setLogin(e.target.value)}
              autoComplete="username"
            />

            <div className="w-full rounded-xl border px-3 py-2 text-sm flex items-center gap-2 focus-within:ring-1 focus-within:ring-black/10">
              <input
                className="outline-none flex-1"
                placeholder="Senha"
                type={showPwd ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowPwd((v) => !v)}
                className="text-xs text-neutral-500 hover:text-neutral-700"
              >
                {showPwd ? "Ocultar" : "Mostrar"}
              </button>
            </div>

            {err && <p className="text-xs text-red-600 text-center">{err}</p>}

            <button
              className="w-full rounded-xl bg-black px-4 py-2 text-white text-sm font-medium disabled:opacity-60"
              disabled={loading}
            >
              {loading ? "Entrando..." : "Entrar"}
            </button>
          </div>

          {/* Rodapé institucional */}
          <footer className="pt-3 text-center text-[11px] text-neutral-500 space-y-0.5">
            <p>LF Vianges - Trademiles — uma empresa do grupo Vias Aéreas LTDA</p>
            <p>CNPJ: 63.817.773/0001-85</p>
          </footer>
        </form>

        {/* ✅ Links fora do card */}
        <div className="pt-4 flex items-center justify-center gap-8 text-sm text-neutral-700">
          <a
            href="https://instagram.com/viasaereastrip"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 hover:text-black"
            aria-label="Instagram @viasaereastrip"
          >
            <Instagram size={18} />
            <span className="font-medium">@viasaereastrip</span>
          </a>

          <a
            href="https://wa.me/5553999760707"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 hover:text-black"
            aria-label="WhatsApp (53) 99976-0707"
          >
            <MessageCircle size={18} />
            <span className="font-medium">WhatsApp</span>
          </a>
        </div>
      </div>
    </main>
  );
}
