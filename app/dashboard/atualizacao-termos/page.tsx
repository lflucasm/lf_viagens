// app/dashboard/atualizacao-termos/page.tsx
import AtualizacaoTermosClient from "./ui/AtualizacaoTermosClient";
import { TERMO_VERSAO, TERMO_WHATSAPP } from "@/lib/termos";

export default function Page() {
  return <AtualizacaoTermosClient termoVersao={TERMO_VERSAO} termoTexto={TERMO_WHATSAPP} />;
}
