// middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

function buildNext(url: URL) {
  // inclui path + search
  const next = url.pathname + (url.search || "");
  return next || "/";
}

function sanitizeNext(nextParam?: string | null) {
  // só permite paths locais para evitar open-redirect
  if (!nextParam) return null;
  try {
    // aceita apenas valores iniciando com '/'
    if (nextParam.startsWith("/")) return nextParam;
  } catch {}
  return null;
}

export function middleware(req: NextRequest) {
  const url = req.nextUrl;
  const sessionCookie = req.cookies.get("tm.session")?.value;
  const isLogin = url.pathname === "/login" || url.pathname.startsWith("/login/"); // se tiver subrotas

  // 1) Protege /dashboard/*
  if (url.pathname.startsWith("/dashboard")) {
    if (!sessionCookie) {
      const loginUrl = new URL("/login", req.url);
      loginUrl.searchParams.set("next", buildNext(url)); // mantém a página exata
      return NextResponse.redirect(loginUrl);
    }
    // logado -> segue
    return NextResponse.next();
  }

  // 2) Fluxo /login
  if (isLogin) {
    // não interfere com POST (ex.: submit do login)
    if (req.method !== "GET") return NextResponse.next();

    // se já logado, manda para o "next" pedido (ou /dashboard)
    if (sessionCookie) {
      const wanted = sanitizeNext(url.searchParams.get("next"));
      const target = new URL(wanted || "/dashboard", req.url);
      return NextResponse.redirect(target);
    }
    // não logado -> mantém na tela de login
    return NextResponse.next();
  }

  // 3) Demais rotas: segue normal
  return NextResponse.next();
}

export const config = {
  // só aplica em /dashboard/* e /login (inclui subrotas de login)
  matcher: ["/dashboard/:path*", "/login/:path*"],
};
