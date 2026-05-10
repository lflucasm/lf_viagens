import "server-only";
import { prisma } from "@/lib/prisma";
import {
  DEFAULT_BRANDING_CREATE,
  DEFAULT_INDICACAO_TERM_BODY,
  DEFAULT_INDICACAO_TERM_VERSION,
} from "@/lib/cedente-indicacao-defaults";

function onlyDigits(v: string) {
  return String(v || "").replace(/\D+/g, "");
}

/** Garante linha singleton em app_settings e ao menos um formulário de indicação. */
export async function ensureAppSettingsAndIndicacaoForms() {
  const row = await prisma.appSettings.findUnique({ where: { id: "default" } });
  if (!row) {
    await prisma.appSettings.create({
      data: {
        id: "default",
        ...DEFAULT_BRANDING_CREATE,
      },
    });
  }

  const n = await prisma.cedenteIndicacaoForm.count();
  if (n === 0) {
    await prisma.cedenteIndicacaoForm.create({
      data: {
        title: "Termo padrão",
        slug: "termo-padrao",
        termVersion: DEFAULT_INDICACAO_TERM_VERSION,
        termBody: DEFAULT_INDICACAO_TERM_BODY,
        sortOrder: 0,
        isActive: true,
      },
    });
  }
}

export type PublicIndicacaoForm = {
  id: string;
  title: string;
  slug: string;
  termVersion: string;
  termBody: string;
  sortOrder: number;
};

export async function getPublicAppSettingsPayload(): Promise<{
  companyDisplayName: string;
  companyLegalName: string;
  cnpj: string;
  instagramHandle: string;
  phoneDisplay: string;
  whatsappDigits: string;
  indicacaoForms: PublicIndicacaoForm[];
}> {
  await ensureAppSettingsAndIndicacaoForms();
  const settings = await prisma.appSettings.findUniqueOrThrow({ where: { id: "default" } });
  const indicacaoForms = await prisma.cedenteIndicacaoForm.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
    select: {
      id: true,
      title: true,
      slug: true,
      termVersion: true,
      termBody: true,
      sortOrder: true,
    },
  });

  return {
    companyDisplayName: settings.companyDisplayName,
    companyLegalName: settings.companyLegalName,
    cnpj: settings.cnpj,
    instagramHandle: String(settings.instagramHandle || "").replace(/^@/, ""),
    phoneDisplay: settings.phoneDisplay,
    whatsappDigits: onlyDigits(settings.whatsappDigits) || onlyDigits(settings.phoneDisplay),
    indicacaoForms,
  };
}

export async function isActiveIndicacaoTermVersion(termVersion: string): Promise<boolean> {
  await ensureAppSettingsAndIndicacaoForms();
  const v = String(termVersion || "").trim();
  if (!v) return false;
  const hit = await prisma.cedenteIndicacaoForm.findFirst({
    where: { termVersion: v, isActive: true },
    select: { id: true },
  });
  return Boolean(hit);
}
