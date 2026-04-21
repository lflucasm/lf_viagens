// components/LogoutButton.tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LogoutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const doLogout = async () => {
    setLoading(true);
    try {
      await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "logout" }),
      });
      router.replace("/login");
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={doLogout}
      disabled={loading}
      className="rounded-xl border px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-50"
      title="Sair"
    >
      {loading ? "Saindo..." : "Sair"}
    </button>
  );
}
