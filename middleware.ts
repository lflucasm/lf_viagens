import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Nome `middleware` + ficheiro `middleware.ts`: convenção estável na Vercel.
 * (Next 16 introduziu `proxy.ts`; em alguns deploys edge ainda falha com 404 em todo o site.)
 */
function buildNext(url: URL) {
  const next = url.pathname + (url.search || "");
  return next || "/";
}

function sanitizeNext(nextParam?: string | null) {
  if (!nextParam) return null;
  try {
    if (nextParam.startsWith("/")) return nextParam;
  } catch {
    /* ignore */
  }
  return null;
}

export function middleware(req: NextRequest) {
  const url = req.nextUrl;
  const sessionCookie = req.cookies.get("tm.session")?.value;
  const isLogin = url.pathname === "/login" || url.pathname.startsWith("/login/");

  if (url.pathname.startsWith("/dashboard")) {
    if (!sessionCookie) {
      const loginUrl = new URL("/login", req.url);
      loginUrl.searchParams.set("next", buildNext(url));
      return NextResponse.redirect(loginUrl);
    }
    return NextResponse.next();
  }

  if (isLogin) {
    if (req.method !== "GET") return NextResponse.next();

    if (sessionCookie) {
      const wanted = sanitizeNext(url.searchParams.get("next"));
      const target = new URL(wanted || "/dashboard", req.url);
      return NextResponse.redirect(target);
    }
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/login", "/login/:path*"],
};
