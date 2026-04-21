// components/AuthGuard.tsx
"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let alive = true;

    async function run() {
      // evita rodar com pathname vazio/undefined (edge case raro)
      if (!pathname) {
        if (alive) setChecked(true);
        return;
      }

      const isDashboard = pathname.startsWith("/dashboard");
      const isLogin = pathname === "/login";
      const nextParam = search?.get("next") || "";

      try {
        const r = await fetch("/api/session", { cache: "no-store" });
        const json = (await r.json().catch(() => ({}))) as { hasSession?: boolean };
        const hasSession = Boolean(json?.hasSession);

        if (!alive) return;

        if (isDashboard && !hasSession) {
          router.replace(`/login?next=${encodeURIComponent(pathname)}`);
          return;
        }

        if (isLogin && hasSession) {
          // se tiver next válido, respeita; senão vai pro dashboard
          if (nextParam && nextParam.startsWith("/dashboard")) {
            router.replace(nextParam);
          } else {
            router.replace("/dashboard");
          }
          return;
        }
      } catch {
        // Falhou a API: assume sem sessão (mais seguro)
        if (!alive) return;

        if (isDashboard) {
          router.replace(`/login?next=${encodeURIComponent(pathname)}`);
          return;
        }
      } finally {
        if (alive) setChecked(true);
      }
    }

    run();

    return () => {
      alive = false;
    };
  }, [pathname, router, search]);

  if (!checked) {
    return (
      <div className="min-h-screen grid place-items-center text-slate-600">
        Carregando…
      </div>
    );
  }

  return <>{children}</>;
}
