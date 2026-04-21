// lib/whatsapp.ts
export function normalizeBRPhoneToE164(raw?: string | null): string | null {
  if (!raw) return null;
  let d = String(raw).replace(/\D/g, "");
  if (!d) return null;

  // remove prefixos comuns
  if (d.startsWith("00")) d = d.slice(2);
  while (d.startsWith("0")) d = d.slice(1);

  // já veio com DDI 55
  if (d.startsWith("55")) {
    // 55 + DDD(2) + numero(8/9) => total 12/13
    if (d.length === 12 || d.length === 13) return d;
    // caso venha 55 + algo estranho
    const rest = d.slice(2);
    if (rest.length === 10 || rest.length === 11) return `55${rest}`;
    return null;
  }

  // veio só com DDD+numero (10 ou 11)
  if (d.length === 10 || d.length === 11) return `55${d}`;

  // se não tiver DDD (8/9) não dá pra adivinhar
  return null;
}

export function buildWhatsAppLink(e164: string, text?: string) {
  const base = `https://wa.me/${e164}`;
  if (!text) return base;
  return `${base}?text=${encodeURIComponent(text)}`;
}
