"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
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
    <main
      className="relative min-h-screen grid place-items-center p-6 bg-slate-950 bg-cover bg-center bg-no-repeat"
      style={{ backgroundImage: "url('/brand/login-bg.png')" }}
    >
      <div className="pointer-events-none absolute inset-0 bg-slate-950/35" aria-hidden />
      {/* Wrapper pra permitir card + links fora */}
      <div className="relative z-10 w-[min(420px,92vw)] space-y-6">
        <div className="flex justify-center">
          <Image
            src="/brand/lf-viagens-logo.png"
            alt="LF Viagens"
            width={320}
            height={96}
            priority
            className="h-16 w-auto max-w-[min(320px,88vw)] object-contain drop-shadow-[0_2px_12px_rgba(0,0,0,0.45)]"
          />
        </div>
        <form
          onSubmit={onSubmit}
          className="space-y-4 rounded-2xl border border-slate-200/90 p-6 shadow-sm shadow-slate-200/40 bg-white"
        >
          {/* Header */}
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-slate-900">TradeMiles</h1>
            <p className="text-xs text-slate-500">Acesse seu painel</p>
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
          <footer className="pt-3 text-center text-[11px] text-slate-500 space-y-0.5">
            <p>LF Viagens · TradeMiles — uma empresa do grupo Vias Aéreas LTDA</p>
            <p>CNPJ: 63.817.773/0001-85</p>
          </footer>
        </form>

        {/* ✅ Links fora do card */}
        <div className="flex flex-wrap items-center justify-center gap-8 text-sm text-slate-200">
          <a
            href="https://instagram.com/viasaereastrip"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 hover:text-white"
            aria-label="Instagram @viasaereastrip"
          >
            <Instagram size={18} />
            <span className="font-medium">@viasaereastrip</span>
          </a>

          <a
            href="https://wa.me/5553999760707"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 hover:text-white"
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
