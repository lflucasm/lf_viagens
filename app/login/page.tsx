import { Suspense } from "react";
import LoginClient from "./LoginClient";

export const dynamic = "force-dynamic"; // evita prerender estático

export const metadata = {
  title: "Login",
};

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm">Carregando…</div>}>
      <LoginClient />
    </Suspense>
  );
}
