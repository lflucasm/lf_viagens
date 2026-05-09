"use client";

import Link from "next/link";
import {
  usePathname,
  useRouter,
  useSearchParams,
  type ReadonlyURLSearchParams,
} from "next/navigation";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { getSession, signOut } from "@/lib/auth";

const STRICT_NOQUERY_ACTIVE_PATHS = new Set<string>([
  "/dashboard/cedentes/visualizar",
  "/dashboard/emissoes",
  "/dashboard/painel-emissoes",
  "/dashboard/clubes",
]);

const VISUALIZAR_PONTOS_PATH = "/dashboard/cedentes/visualizar";

type Accent =
  | "sky"
  | "emerald"
  | "amber"
  | "teal"
  | "rose"
  | "orange"
  | "lime"
  | "cyan"
  | "blue"
  | "slate";

const ACCENTS: Record<
  Accent,
  { accent: string; soft: string; text: string; border: string }
> = {
  sky: {
    accent: "#0ea5e9",
    soft: "rgba(14,165,233,0.12)",
    text: "#075985",
    border: "rgba(14,165,233,0.35)",
  },
  emerald: {
    accent: "#10b981",
    soft: "rgba(16,185,129,0.12)",
    text: "#065f46",
    border: "rgba(16,185,129,0.35)",
  },
  amber: {
    accent: "#f59e0b",
    soft: "rgba(245,158,11,0.14)",
    text: "#92400e",
    border: "rgba(245,158,11,0.35)",
  },
  teal: {
    accent: "#14b8a6",
    soft: "rgba(20,184,166,0.12)",
    text: "#0f766e",
    border: "rgba(20,184,166,0.35)",
  },
  rose: {
    accent: "#f43f5e",
    soft: "rgba(244,63,94,0.12)",
    text: "#9f1239",
    border: "rgba(244,63,94,0.35)",
  },
  orange: {
    accent: "#f97316",
    soft: "rgba(249,115,22,0.14)",
    text: "#9a3412",
    border: "rgba(249,115,22,0.35)",
  },
  lime: {
    accent: "#84cc16",
    soft: "rgba(132,204,22,0.14)",
    text: "#3f6212",
    border: "rgba(132,204,22,0.35)",
  },
  cyan: {
    accent: "#06b6d4",
    soft: "rgba(6,182,212,0.12)",
    text: "#0e7490",
    border: "rgba(6,182,212,0.35)",
  },
  blue: {
    accent: "#3b82f6",
    soft: "rgba(59,130,246,0.12)",
    text: "#1e40af",
    border: "rgba(59,130,246,0.35)",
  },
  slate: {
    accent: "#64748b",
    soft: "rgba(100,116,139,0.12)",
    text: "#334155",
    border: "rgba(100,116,139,0.35)",
  },
};

function accentStyle(accent?: Accent): CSSProperties {
  const a = ACCENTS[accent || "slate"];
  return {
    "--accent": a.accent,
    "--accent-soft": a.soft,
    "--accent-text": a.text,
    "--accent-border": a.border,
  } as CSSProperties;
}

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const search = useSearchParams();
  const session = getSession();

  /* =========================
   * ROTAS
   * ========================= */

  const isPontosVisualizarRoute = pathname.startsWith(VISUALIZAR_PONTOS_PATH);

  // ✅ Cadastro NÃO deve “pegar” Visualizar cedentes
  const isCadastroRoute =
    (pathname.startsWith("/dashboard/cedentes") && !isPontosVisualizarRoute) ||
    pathname.startsWith("/dashboard/afiliados") ||
    pathname.startsWith("/dashboard/clientes") ||
    pathname.startsWith("/dashboard/funcionarios") ||
    pathname.startsWith("/dashboard/bloqueios");

  const isComprasRoute = pathname.startsWith("/dashboard/compras");
  const isVendasRoute = pathname.startsWith("/dashboard/vendas");
  const isCheckLocalizadorRoute = pathname.startsWith(
    "/dashboard/check-localizador"
  );

  const isClubesRoute = pathname.startsWith("/dashboard/clubes");

  // ✅ Gestão de pontos engloba Visualizar, Compras, Vendas e Clubes
  const isGestaoPontosRoute =
    isPontosVisualizarRoute ||
    isComprasRoute ||
    isVendasRoute ||
    isClubesRoute ||
    isCheckLocalizadorRoute;

  // ✅ Lucros/Comissões
  const isLucrosRoute =
    pathname.startsWith("/dashboard/lucros") ||
    pathname.startsWith("/dashboard/comissoes");

  // ✅ RESUMO (link mantém /dashboard/resumo)
  const isResumoRoute = pathname.startsWith("/dashboard/resumo");

  // ✅ ANÁLISE & ESTRATÉGIA
  const isEstrategiaCompraRoute = pathname.startsWith(
    "/dashboard/estrategia-compra"
  );

  const isContasSelecionadasRoute = pathname.startsWith(
    "/dashboard/contas-selecionadas"
  );
  const isContasSelecionadasLatamRoute = pathname.startsWith(
    "/dashboard/contas-selecionadas/latam"
  );
  const isContasSelecionadasSmilesRoute = pathname.startsWith(
    "/dashboard/contas-selecionadas/smiles"
  );

  // ✅ NOVO: Livelo em Contas selecionadas
  const isContasSelecionadasLiveloRoute = pathname.startsWith(
    "/dashboard/contas-selecionadas/livelo"
  );

  // ✅ NOVO: Análise de dados
  const isAnaliseDadosRoute = pathname.startsWith("/dashboard/analise-dados");

  const isAnaliseRoute =
    isEstrategiaCompraRoute || isContasSelecionadasRoute || isAnaliseDadosRoute;

  // ✅ FINANCEIRO
  const isDividasRoute = pathname.startsWith("/dashboard/dividas");

  // ✅ NOVO: Dívidas a receber (ROTA SEPARADA, não mistura com /recebimentos)
  const isDividasAReceberRoute = pathname.startsWith(
    "/dashboard/dividas-a-receber"
  );

  const isImpostosRoute = pathname.startsWith("/dashboard/impostos");

  // ✅ NOVO: Caixa imediato
  const isCaixaImediatoRoute = pathname.startsWith("/dashboard/caixa-imediato");

  // ✅ NOVO: Prejuízo
  const isPrejuizoRoute = pathname.startsWith("/dashboard/prejuizo");

  const isFinanceiroRoute =
    isDividasRoute ||
    isDividasAReceberRoute ||
    isImpostosRoute ||
    isResumoRoute ||
    isCaixaImediatoRoute ||
    isPrejuizoRoute;

  // ✅ NOVO: Dados contábeis
  const isDadosContabeisRoute = pathname.startsWith("/dashboard/dados-contabeis");
  const isDadosContabeisVendasRoute = pathname.startsWith(
    "/dashboard/dados-contabeis/vendas"
  );
  const isDadosContabeisComprasRoute = pathname.startsWith(
    "/dashboard/dados-contabeis/compras"
  );

  // ✅ IMPORTAÇÕES (fora do Gestor de emissões)
  const isImportacoesRoute = pathname.startsWith("/dashboard/importacoes");
  const isImportacoesEmissoesLatamRoute = pathname.startsWith(
    "/dashboard/emissoes/import-latam"
  );
  const isImportacoesEmissoesSubRoute = isImportacoesEmissoesLatamRoute;

  // ✅ Painel de Emissões (novo)
  const isPainelEmissoesRoute = pathname.startsWith(
    "/dashboard/painel-emissoes"
  );

  // ✅ GESTOR DE EMISSÕES (exclui importação)
  const isEmissoesBaseRoute =
    pathname === "/dashboard/emissoes" ||
    pathname.startsWith("/dashboard/emissoes/");
  const isEmissoesRoute =
    isEmissoesBaseRoute && !isImportacoesEmissoesLatamRoute;

  const isGestorEmissoesRoute = isEmissoesRoute || isPainelEmissoesRoute;

  // ✅ Rotas de comissões (subitens)
  const isComissoesCedentesRoute = pathname.startsWith(
    "/dashboard/comissoes/cedentes"
  );
  const isComissoesFuncionariosRoute = pathname.startsWith(
    "/dashboard/comissoes/funcionarios"
  );
  const isComissoesSubRoute =
    isComissoesCedentesRoute || isComissoesFuncionariosRoute;

  // ✅ Rotas / queries do submenu "Emissões por cedente"
  const isEmissoesBasePath = pathname === "/dashboard/emissoes";
  const programaEmissoes = (search?.get("programa") || "").toLowerCase();
  const isEmissoesUltimas = isEmissoesBasePath && programaEmissoes === "";
  const isEmissoesLatam = isEmissoesBasePath && programaEmissoes === "latam";
  const isEmissoesSmiles = isEmissoesBasePath && programaEmissoes === "smiles";

  // ✅ Rotas / queries do submenu "Painel de Emissões"
  const isPainelBasePath = pathname === "/dashboard/painel-emissoes";
  const programaPainel = (search?.get("programa") || "").toLowerCase();
  const isPainelLatam =
    isPainelBasePath && (programaPainel === "" || programaPainel === "latam");

  // ✅ NOVO: Protocolos
  const isProtocolosRoute = pathname.startsWith("/dashboard/protocolos");

  // ✅ NOVO: Grupo VIP WhatsApp
  const isGrupoVipWhatsappRoute = pathname.startsWith("/dashboard/grupo-vip-whatsapp");

  // ✅ NOVO: OUTROS
  const isAutomacaoRoute = pathname.startsWith("/dashboard/automacao");
  const isWalletRoute = pathname.startsWith("/dashboard/wallet");

  // ✅ NOVO: Agenda
  const isAgendaRoute = pathname.startsWith("/dashboard/agenda");

  // ✅ NOVO: Anotações
  const isAnotacoesRoute = pathname.startsWith("/dashboard/anotacoes");

  // ✅ NOVO: Atualização dos termos (em OUTROS)
  const isAtualizacaoTermosRoute = pathname.startsWith(
    "/dashboard/atualizacao-termos"
  );

  // ✅ NOVO: Horário biometria (em OUTROS)
  const isHorarioBiometriaRoute = pathname.startsWith(
    "/dashboard/horario-biometria"
  );

  // ✅ NOVO: Emissões no balcão
  const isEmissoesBalcaoRoute = pathname.startsWith(
    "/dashboard/emissoes-balcao"
  );

  const isOutrosRoute =
    isAutomacaoRoute ||
    isWalletRoute ||
    isAgendaRoute ||
    isAnotacoesRoute ||
    isAtualizacaoTermosRoute ||
    isHorarioBiometriaRoute;

  /* =========================
   * ACCORDIONS
   * ========================= */
  const [openCadastro, setOpenCadastro] = useState(isCadastroRoute);

  const [openCedentes, setOpenCedentes] = useState(
    (pathname.startsWith("/dashboard/cedentes") && !isPontosVisualizarRoute) ||
      pathname.startsWith("/dashboard/bloqueios")
  );

  const [openFuncionarios, setOpenFuncionarios] = useState(
    pathname.startsWith("/dashboard/funcionarios")
  );
  const [openClientes, setOpenClientes] = useState(
    pathname.startsWith("/dashboard/clientes")
  );
  const [openAfiliados, setOpenAfiliados] = useState(
    pathname.startsWith("/dashboard/afiliados")
  );

  const [openGestaoPontos, setOpenGestaoPontos] = useState(isGestaoPontosRoute);
  const [openPontosVisualizar, setOpenPontosVisualizar] = useState(
    isPontosVisualizarRoute
  );

  const [openClubes, setOpenClubes] = useState(isClubesRoute);

  const [openCompras, setOpenCompras] = useState(isComprasRoute);
  const [openVendas, setOpenVendas] = useState(isVendasRoute);
  const [openCheckLocalizador, setOpenCheckLocalizador] = useState(
    isCheckLocalizadorRoute
  );

  const [openLucros, setOpenLucros] = useState(isLucrosRoute);

  const [openAnalise, setOpenAnalise] = useState(isAnaliseRoute);

  // ✅ novo: submenus de Contas selecionadas
  const [openContasSelecionadas, setOpenContasSelecionadas] = useState(
    isContasSelecionadasRoute
  );
  const [openContasSelecionadasLatam, setOpenContasSelecionadasLatam] =
    useState(isContasSelecionadasLatamRoute);

  // ✅ Smiles como sub-accordion (igual Latam)
  const [openContasSelecionadasSmiles, setOpenContasSelecionadasSmiles] =
    useState(isContasSelecionadasSmilesRoute);

  // ✅ NOVO: Livelo como sub-accordion (igual Latam/Smiles)
  const [openContasSelecionadasLivelo, setOpenContasSelecionadasLivelo] =
    useState(isContasSelecionadasLiveloRoute);

  const [openFinanceiro, setOpenFinanceiro] = useState(isFinanceiroRoute);

  // ✅ NOVO: dados contábeis
  const [openDadosContabeis, setOpenDadosContabeis] = useState(
    isDadosContabeisRoute
  );

  const [openGestorEmissoes, setOpenGestorEmissoes] = useState(
    isGestorEmissoesRoute
  );

  const [openImportacoes, setOpenImportacoes] = useState(
    isImportacoesRoute || isImportacoesEmissoesLatamRoute
  );
  const [openImportacoesEmissoes, setOpenImportacoesEmissoes] = useState(
    isImportacoesEmissoesSubRoute
  );

  const [openComissoes, setOpenComissoes] = useState(isComissoesSubRoute);

  const [openEmissoesPorCedente, setOpenEmissoesPorCedente] = useState(
    isEmissoesRoute
  );

  const [openPainelEmissoes, setOpenPainelEmissoes] = useState(
    isPainelEmissoesRoute
  );

  // ✅ NOVO: Protocolos
  const [openProtocolos, setOpenProtocolos] = useState(isProtocolosRoute);

  // ✅ NOVO: OUTROS
  const [openOutros, setOpenOutros] = useState(isOutrosRoute);
  const [openEmissoesBalcao, setOpenEmissoesBalcao] = useState(
    isEmissoesBalcaoRoute
  );
  const [openGrupoVip, setOpenGrupoVip] = useState(isGrupoVipWhatsappRoute);

  useEffect(() => setOpenCadastro(isCadastroRoute), [isCadastroRoute]);

  useEffect(() => {
    setOpenCedentes(
      (pathname.startsWith("/dashboard/cedentes") && !isPontosVisualizarRoute) ||
        pathname.startsWith("/dashboard/bloqueios")
    );
  }, [pathname, isPontosVisualizarRoute]);

  useEffect(() => {
    setOpenFuncionarios(pathname.startsWith("/dashboard/funcionarios"));
  }, [pathname]);

  useEffect(() => {
    setOpenClientes(pathname.startsWith("/dashboard/clientes"));
  }, [pathname]);

  useEffect(() => {
    setOpenAfiliados(pathname.startsWith("/dashboard/afiliados"));
  }, [pathname]);

  useEffect(
    () => setOpenGestaoPontos(isGestaoPontosRoute),
    [isGestaoPontosRoute]
  );
  useEffect(
    () => setOpenPontosVisualizar(isPontosVisualizarRoute),
    [isPontosVisualizarRoute]
  );

  useEffect(() => setOpenClubes(isClubesRoute), [isClubesRoute]);

  useEffect(() => setOpenCompras(isComprasRoute), [isComprasRoute]);
  useEffect(() => setOpenVendas(isVendasRoute), [isVendasRoute]);
  useEffect(
    () => setOpenCheckLocalizador(isCheckLocalizadorRoute),
    [isCheckLocalizadorRoute]
  );

  useEffect(() => setOpenLucros(isLucrosRoute), [isLucrosRoute]);

  useEffect(() => setOpenAnalise(isAnaliseRoute), [isAnaliseRoute]);

  // ✅ mantém aberto quando entrar em /contas-selecionadas/*
  useEffect(() => {
    setOpenContasSelecionadas(isContasSelecionadasRoute);
  }, [isContasSelecionadasRoute]);

  // ✅ mantém aberto quando entrar em /contas-selecionadas/latam/*
  useEffect(() => {
    setOpenContasSelecionadasLatam(isContasSelecionadasLatamRoute);
  }, [isContasSelecionadasLatamRoute]);

  // ✅ mantém aberto quando entrar em /contas-selecionadas/smiles/*
  useEffect(() => {
    setOpenContasSelecionadasSmiles(isContasSelecionadasSmilesRoute);
  }, [isContasSelecionadasSmilesRoute]);

  // ✅ NOVO: mantém aberto quando entrar em /contas-selecionadas/livelo/*
  useEffect(() => {
    setOpenContasSelecionadasLivelo(isContasSelecionadasLiveloRoute);
  }, [isContasSelecionadasLiveloRoute]);

  useEffect(() => setOpenFinanceiro(isFinanceiroRoute), [isFinanceiroRoute]);

  // ✅ NOVO: mantém aberto quando entrar em /dados-contabeis/*
  useEffect(() => {
    setOpenDadosContabeis(isDadosContabeisRoute);
  }, [isDadosContabeisRoute]);

  useEffect(
    () => setOpenGestorEmissoes(isGestorEmissoesRoute),
    [isGestorEmissoesRoute]
  );

  useEffect(() => {
    setOpenImportacoes(isImportacoesRoute || isImportacoesEmissoesLatamRoute);
  }, [isImportacoesRoute, isImportacoesEmissoesLatamRoute]);

  useEffect(() => {
    setOpenImportacoesEmissoes(isImportacoesEmissoesSubRoute);
  }, [isImportacoesEmissoesSubRoute]);

  useEffect(() => setOpenComissoes(isComissoesSubRoute), [isComissoesSubRoute]);

  useEffect(() => {
    setOpenEmissoesPorCedente(isEmissoesRoute);
  }, [isEmissoesRoute]);

  useEffect(() => {
    setOpenPainelEmissoes(isPainelEmissoesRoute);
  }, [isPainelEmissoesRoute]);

  // ✅ mantém aberto quando entrar em /protocolos/*
  useEffect(() => {
    setOpenProtocolos(isProtocolosRoute);
  }, [isProtocolosRoute]);

  // ✅ mantém aberto quando entrar em /automacao/* ou /wallet/* ou /agenda/* ou /atualizacao-termos/*
  useEffect(() => {
    setOpenOutros(isOutrosRoute);
  }, [isOutrosRoute]);

  useEffect(() => {
    setOpenEmissoesBalcao(isEmissoesBalcaoRoute);
  }, [isEmissoesBalcaoRoute]);

  useEffect(() => {
    setOpenGrupoVip(isGrupoVipWhatsappRoute);
  }, [isGrupoVipWhatsappRoute]);

  /* =========================
   * FILTRO (VISUALIZAR PONTOS)
   * ========================= */

  // ✅ só marca ativo quando estiver na tela de visualizar
  const programa = isPontosVisualizarRoute
    ? (search?.get("programa") || "").toLowerCase()
    : "";

  // ✅ navega SEMPRE pra página de visualizar
  function goVisualizarPrograma(value: string | undefined) {
    const qs = new URLSearchParams(
      isPontosVisualizarRoute ? search?.toString() || "" : ""
    );

    if (!value) qs.delete("programa");
    else qs.set("programa", value);

    const q = qs.toString();
    router.push(q ? `${VISUALIZAR_PONTOS_PATH}?${q}` : VISUALIZAR_PONTOS_PATH);
  }

  /* =========================
   * LOGOUT
   * ========================= */
  function doLogout() {
    signOut();
    router.replace("/login");
  }

  /* =========================
   * UI
   * ========================= */
  return (
    <aside className="flex h-screen w-64 shrink-0 flex-col overflow-hidden border-r border-slate-200/90 bg-white shadow-[4px_0_32px_-12px_rgba(15,23,42,0.1)]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-100 bg-gradient-to-b from-white to-slate-50/90 p-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-xs font-bold text-white shadow-sm">
            LF
          </div>
          <div className="min-w-0 leading-tight">
            <div className="truncate text-sm font-semibold tracking-tight text-slate-900">LF Viagens</div>
            <div className="truncate text-[10px] font-medium uppercase tracking-wider text-slate-500">
              TradeMiles
            </div>
          </div>
        </div>
      </div>

      {/* Usuário */}
      {session && (
        <div className="mx-2 mt-2 rounded-xl border border-slate-200/80 bg-slate-50/90 px-3 py-2.5 text-xs text-slate-600">
          <div className="font-medium text-slate-900">{session.name}</div>
          <div>
            <span className="text-slate-500">Login:</span> {session.login}
          </div>
          <div>
            <span className="text-slate-500">Time:</span> {session.team}
          </div>
          <div className="capitalize">
            <span className="text-slate-500">Perfil:</span> {session.role}
          </div>
        </div>
      )}

      <nav className="flex-1 overflow-y-auto space-y-2 px-2 py-4">
        {/* ================= CADASTRO ================= */}
        <Accordion
          title="Cadastro"
          open={openCadastro}
          onToggle={() => setOpenCadastro((v) => !v)}
          active={isCadastroRoute}
          accent="sky"
        >
          <SubAccordion
            title="Cedentes"
            open={openCedentes}
            onToggle={() => setOpenCedentes((v) => !v)}
          >
            <NavLink href="/dashboard/cedentes/importar">
              Importar cedentes
            </NavLink>

            <NavLink href="/dashboard/cedentes/novo">Cadastrar cedente</NavLink>

            <NavLink href="/dashboard/cedentes/pendentes">
              Cedentes pendentes
            </NavLink>

            {/* ✅ NOVO */}
            <NavLink href="/dashboard/cedentes/revisao">
              Revisão de cedentes
            </NavLink>

            {/* ✅ NOVO */}
            <NavLink href="/dashboard/cedentes/whatsapp">Whatsapp</NavLink>

            <NavLink href="/dashboard/cedentes/mensagem-pronta">
              Mensagem pronta
            </NavLink>

            {/* ✅ NOVO */}
            <NavLink href="/dashboard/cedentes/historico-cadastro">
              Histórico de cadastro
            </NavLink>

            <NavLink href="/dashboard/cedentes/score">
              Score cedentes
            </NavLink>

            <NavLink href="/dashboard/cedentes/exclusao-definitiva">
              Exclusão definitiva
            </NavLink>

            <NavLink href="/dashboard/bloqueios">Contas bloqueadas</NavLink>
          </SubAccordion>

          <SubAccordion
            title="Funcionários"
            open={openFuncionarios}
            onToggle={() => setOpenFuncionarios((v) => !v)}
          >
            <NavLink href="/dashboard/funcionarios/novo">
              Cadastrar funcionário
            </NavLink>

            <NavLink href="/dashboard/funcionarios" exact>
              Visualizar funcionários
            </NavLink>

            <NavLink href="/dashboard/funcionarios/rateio">
              Rateio do lucro
            </NavLink>
          </SubAccordion>

          <SubAccordion
            title="Clientes"
            open={openClientes}
            onToggle={() => setOpenClientes((v) => !v)}
          >
            <NavLink href="/dashboard/clientes/novo">Cadastrar cliente</NavLink>

            <NavLink href="/dashboard/clientes" exact>
              Visualizar clientes
            </NavLink>
          </SubAccordion>

          <SubAccordion
            title="Afiliados"
            open={openAfiliados}
            onToggle={() => setOpenAfiliados((v) => !v)}
          >
            <NavLink href="/dashboard/afiliados" exact>
              Gerenciar afiliados
            </NavLink>
          </SubAccordion>
        </Accordion>

        {/* ================= GESTÃO DE PONTOS ================= */}
        <Accordion
          title="Gestão de pontos"
          open={openGestaoPontos}
          onToggle={() => setOpenGestaoPontos((v) => !v)}
          active={isGestaoPontosRoute}
          accent="emerald"
        >
          <SubAccordion
            title="Visualizar pontos"
            open={openPontosVisualizar}
            onToggle={() => setOpenPontosVisualizar((v) => !v)}
          >
            {/* ✅ APENAS OS RETÂNGULOS */}
            <div className="pl-2 pr-2 pb-1">
              <div className="flex flex-wrap gap-1">
                <button
                  type="button"
                  onClick={() => goVisualizarPrograma(undefined)}
                  className={cn(
                    "px-3 py-1 text-xs rounded-full border",
                    programa === "" ? "bg-black text-white" : "hover:bg-slate-100"
                  )}
                >
                  Todos
                </button>

                <button
                  type="button"
                  onClick={() => goVisualizarPrograma("latam")}
                  className={cn(
                    "px-3 py-1 text-xs rounded-full border",
                    programa === "latam"
                      ? "bg-black text-white"
                      : "hover:bg-slate-100"
                  )}
                >
                  Latam
                </button>

                <button
                  type="button"
                  onClick={() => goVisualizarPrograma("smiles")}
                  className={cn(
                    "px-3 py-1 text-xs rounded-full border",
                    programa === "smiles"
                      ? "bg-black text-white"
                      : "hover:bg-slate-100"
                  )}
                >
                  Smiles
                </button>

                <button
                  type="button"
                  onClick={() => goVisualizarPrograma("livelo")}
                  className={cn(
                    "px-3 py-1 text-xs rounded-full border",
                    programa === "livelo"
                      ? "bg-black text-white"
                      : "hover:bg-slate-100"
                  )}
                >
                  Livelo
                </button>

                <button
                  type="button"
                  onClick={() => goVisualizarPrograma("esfera")}
                  className={cn(
                    "px-3 py-1 text-xs rounded-full border",
                    programa === "esfera"
                      ? "bg-black text-white"
                      : "hover:bg-slate-100"
                  )}
                >
                  Esfera
                </button>
              </div>
            </div>
          </SubAccordion>

          <SubAccordion
            title="Clube"
            open={openClubes}
            onToggle={() => setOpenClubes((v) => !v)}
          >
            <NavLink href="/dashboard/clubes/cadastrar" exact>
              Cadastrar clube
            </NavLink>

            <NavLink href="/dashboard/clubes" exact>
              Lista
            </NavLink>
          </SubAccordion>

          <SubAccordion
            title="Compras"
            open={openCompras}
            onToggle={() => setOpenCompras((v) => !v)}
          >
            <NavLink href="/dashboard/compras/nova">Efetuar compra</NavLink>
            <NavLink href="/dashboard/compras" exact>
              Visualizar compras
            </NavLink>
          </SubAccordion>

          <SubAccordion
            title="Vendas"
            open={openVendas}
            onToggle={() => setOpenVendas((v) => !v)}
          >
            <NavLink href="/dashboard/vendas/nova">Efetuar venda</NavLink>

            <NavLink href="/dashboard/vendas" exact>
              Painel de vendas
            </NavLink>

            <NavLink href="/dashboard/vendas/compras-a-finalizar">
              Compras a finalizar
            </NavLink>
            <NavLink href="/dashboard/vendas/compras-finalizadas">
              Compras finalizadas
            </NavLink>
          </SubAccordion>

          <SubAccordion
            title="Check Localizador"
            open={openCheckLocalizador}
            onToggle={() => setOpenCheckLocalizador((v) => !v)}
          >
            <NavLink href="/dashboard/check-localizador/latam">Latam</NavLink>
            <NavLink href="/dashboard/check-localizador/smiles">Smiles</NavLink>
          </SubAccordion>
        </Accordion>

        {/* ================= LUCROS ================= */}
        <Accordion
          title="Lucros & Comissões"
          open={openLucros}
          onToggle={() => setOpenLucros((v) => !v)}
          active={isLucrosRoute}
          accent="amber"
        >
          <NavLink href="/dashboard/lucros">Lucros</NavLink>

          <SubAccordion
            title="Comissões"
            open={openComissoes}
            onToggle={() => setOpenComissoes((v) => !v)}
            variant="nav"
            active={pathname.startsWith("/dashboard/comissoes")}
          >
            <NavLink href="/dashboard/comissoes/cedentes">Cedentes</NavLink>
            <NavLink href="/dashboard/comissoes/funcionarios">
              Funcionários
            </NavLink>
          </SubAccordion>
        </Accordion>

        {/* ================= ANÁLISE ================= */}
        <Accordion
          title="Análise & Estratégia"
          open={openAnalise}
          onToggle={() => setOpenAnalise((v) => !v)}
          active={isAnaliseRoute}
          accent="teal"
        >
          <NavLink href="/dashboard/analise-dados">Análise de dados</NavLink>

          <NavLink href="/dashboard/estrategia-compra">
            Estratégia de compra
          </NavLink>

          <SubAccordion
            title="Contas selecionadas"
            href="/dashboard/contas-selecionadas"
            open={openContasSelecionadas}
            onToggle={() => setOpenContasSelecionadas((v) => !v)}
            variant="nav"
            active={isContasSelecionadasRoute}
          >
            <SubAccordion
              title="Latam"
              href="/dashboard/contas-selecionadas/latam"
              open={openContasSelecionadasLatam}
              onToggle={() => setOpenContasSelecionadasLatam((v) => !v)}
              variant="nav"
              active={isContasSelecionadasLatamRoute}
            >
              <NavLink href="/dashboard/contas-selecionadas/latam/lista-promo">
                Lista promo
              </NavLink>
              <NavLink href="/dashboard/contas-selecionadas/latam/turbo">
                Turbo Latam
              </NavLink>
            </SubAccordion>

            {/* ✅ Smiles agora é SubAccordion, igual Latam */}
            <SubAccordion
              title="Smiles"
              href="/dashboard/contas-selecionadas/smiles"
              open={openContasSelecionadasSmiles}
              onToggle={() => setOpenContasSelecionadasSmiles((v) => !v)}
              variant="nav"
              active={isContasSelecionadasSmilesRoute}
            >
              <NavLink href="/dashboard/contas-selecionadas/smiles/renovacao-clube">
                Renovação Clube
              </NavLink>
            </SubAccordion>

            {/* ✅ NOVO: Livelo */}
            <SubAccordion
              title="Livelo"
              href="/dashboard/contas-selecionadas/livelo"
              open={openContasSelecionadasLivelo}
              onToggle={() => setOpenContasSelecionadasLivelo((v) => !v)}
              variant="nav"
              active={isContasSelecionadasLiveloRoute}
            >
              <NavLink href="/dashboard/contas-selecionadas/livelo/aniversario">
                Aniversário
              </NavLink>
              <NavLink href="/dashboard/contas-selecionadas/livelo/bonus-clube">
                Bônus clube Livelo
              </NavLink>
            </SubAccordion>
          </SubAccordion>
        </Accordion>

        {/* ================= PROTOCOLOS ================= */}
        <Accordion
          title="Protocolos"
          open={openProtocolos}
          onToggle={() => setOpenProtocolos((v) => !v)}
          active={isProtocolosRoute}
          accent="rose"
        >
          <NavLink href="/dashboard/protocolos/latam">Latam</NavLink>
          <NavLink href="/dashboard/protocolos/smiles">Smiles</NavLink>
          <NavLink href="/dashboard/protocolos/livelo">Livelo</NavLink>
          <NavLink href="/dashboard/protocolos/esfera">Esfera</NavLink>
        </Accordion>

        {/* ================= FINANCEIRO ================= */}
        <Accordion
          title="Financeiro"
          open={openFinanceiro}
          onToggle={() => setOpenFinanceiro((v) => !v)}
          active={isFinanceiroRoute}
          accent="orange"
        >
          <NavLink href="/dashboard/resumo">Resumo</NavLink>

          {/* ✅ NOVO: Prejuízo */}
          <NavLink href="/dashboard/prejuizo">Prejuízo</NavLink>

          <NavLink href="/dashboard/dividas">Dívidas</NavLink>

          {/* ✅ rota separada */}
          <NavLink href="/dashboard/dividas-a-receber">
            Dívidas a receber
          </NavLink>

          <NavLink href="/dashboard/impostos">Impostos</NavLink>
        </Accordion>

        {/* ================= DADOS CONTÁBEIS ================= */}
        <Accordion
          title="Dados contábeis"
          open={openDadosContabeis}
          onToggle={() => setOpenDadosContabeis((v) => !v)}
          active={isDadosContabeisRoute}
          accent="lime"
        >
          <NavLink href="/dashboard/dados-contabeis/vendas">Vendas</NavLink>
          <NavLink href="/dashboard/dados-contabeis/compras">Compras</NavLink>
        </Accordion>

        {/* ================= IMPORTAÇÕES (FORA DO GESTOR) ================= */}
        <Accordion
          title="Importações"
          open={openImportacoes}
          onToggle={() => setOpenImportacoes((v) => !v)}
          active={isImportacoesRoute || isImportacoesEmissoesLatamRoute}
          accent="cyan"
        >
          <SubAccordion
            title="Emissões"
            open={openImportacoesEmissoes}
            onToggle={() => setOpenImportacoesEmissoes((v) => !v)}
            variant="nav"
            active={isImportacoesEmissoesLatamRoute}
          >
            <NavLink
              href="/dashboard/emissoes/import-latam"
              className="font-semibold"
            >
              Latam
            </NavLink>
          </SubAccordion>
        </Accordion>

        {/* ================= GESTOR DE EMISSÕES ================= */}
        <Accordion
          title="Gestor de emissões"
          open={openGestorEmissoes}
          onToggle={() => setOpenGestorEmissoes((v) => !v)}
          active={isGestorEmissoesRoute}
          accent="blue"
        >
          <SubAccordion
            title="Emissões por cedente"
            open={openEmissoesPorCedente}
            onToggle={() => setOpenEmissoesPorCedente((v) => !v)}
            variant="nav"
            active={isEmissoesRoute}
          >
            <NavLink href="/dashboard/emissoes" className="font-semibold">
              Últimas emissões
            </NavLink>

            <NavLink
              href="/dashboard/emissoes?programa=latam"
              className="font-semibold"
            >
              Latam
            </NavLink>

            <NavLink
              href="/dashboard/emissoes?programa=smiles"
              className="font-semibold"
            >
              Smiles
            </NavLink>
          </SubAccordion>

          <SubAccordion
            title="Painel de Emissões"
            open={openPainelEmissoes}
            onToggle={() => setOpenPainelEmissoes((v) => !v)}
            variant="nav"
            active={isPainelEmissoesRoute}
          >
            <NavLink
              href="/dashboard/painel-emissoes?programa=latam"
              className={cn(
                "font-semibold",
                isPainelLatam && "bg-black text-white"
              )}
            >
              Latam
            </NavLink>
          </SubAccordion>
        </Accordion>

        {/* ================= OUTROS ================= */}
        <Accordion
          title="Emissões no balcão"
          open={openEmissoesBalcao}
          onToggle={() => setOpenEmissoesBalcao((v) => !v)}
          active={isEmissoesBalcaoRoute}
          accent="cyan"
        >
          <NavLink href="/dashboard/emissoes-balcao/compra-venda">
            Compra e Venda
          </NavLink>
        </Accordion>

        <Accordion
          title="Grupo VIP WHATSAPP"
          open={openGrupoVip}
          onToggle={() => setOpenGrupoVip((v) => !v)}
          active={isGrupoVipWhatsappRoute}
          accent="blue"
        >
          <NavLink href="/dashboard/grupo-vip-whatsapp" exact>
            Cadastros
          </NavLink>
          <NavLink href="/dashboard/grupo-vip-whatsapp/clientes" exact>
            Clientes
          </NavLink>
          <NavLink href="/dashboard/grupo-vip-whatsapp/rateio" exact>
            Rateio do lucro
          </NavLink>
        </Accordion>

        {/* ================= OUTROS ================= */}
        <Accordion
          title="Outros"
          open={openOutros}
          onToggle={() => setOpenOutros((v) => !v)}
          active={isOutrosRoute}
          accent="slate"
        >
          <NavLink href="/dashboard/automacao">Automação</NavLink>

          {/* ✅ NOVO: Agenda */}
          <NavLink href="/dashboard/agenda">Agenda</NavLink>

          <NavLink href="/dashboard/anotacoes">Anotações</NavLink>

          {/* ✅ NOVO: Atualização dos termos */}
          <NavLink href="/dashboard/atualizacao-termos">
            Atualização dos termos
          </NavLink>

          <NavLink href="/dashboard/horario-biometria">
            Horário biometria
          </NavLink>

          <NavLink href="/dashboard/wallet">Wallet</NavLink>
        </Accordion>
      </nav>

      <div className="border-t border-slate-200/90 bg-gradient-to-t from-slate-50/80 to-white p-2">
        <button
          type="button"
          onClick={doLogout}
          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
        >
          Sair
        </button>
      </div>
    </aside>
  );
}

/* =========================
 * COMPONENTES AUXILIARES
 * ========================= */

function paramsEqual(
  current: ReadonlyURLSearchParams | null,
  hrefQuery: string
) {
  const a = new URLSearchParams(current?.toString() || "");
  const b = new URLSearchParams(hrefQuery || "");

  const aEntries = Array.from(a.entries()).sort();
  const bEntries = Array.from(b.entries()).sort();
  if (aEntries.length !== bEntries.length) return false;

  for (let i = 0; i < aEntries.length; i++) {
    if (aEntries[i][0] !== bEntries[i][0]) return false;
    if (aEntries[i][1] !== bEntries[i][1]) return false;
  }
  return true;
}

function NavLink({
  href,
  children,
  className,
  exact = false,
}: {
  href: string;
  children: ReactNode;
  className?: string;
  exact?: boolean;
}) {
  const pathname = usePathname();
  const search = useSearchParams();

  const [hrefPath, hrefQuery = ""] = href.split("?");
  const hasQuery = href.includes("?");
  const currentQuery = search?.toString() || "";

  const active = hasQuery
    ? pathname === hrefPath && paramsEqual(search, hrefQuery)
    : exact
    ? pathname === hrefPath
    : !(
        STRICT_NOQUERY_ACTIVE_PATHS.has(hrefPath) &&
        pathname === hrefPath &&
        currentQuery
      ) && (pathname === href || pathname.startsWith(href + "/"));

  return (
    <Link
      href={href}
      className={cn(
        "relative block rounded-xl px-3 py-2 pl-5 text-sm transition-colors",
        active
          ? "bg-[var(--accent-soft)] text-[var(--accent-text)]"
          : "text-slate-700 hover:bg-slate-100",
        "before:content-[''] before:absolute before:left-2 before:top-2 before:bottom-2 before:w-1 before:rounded-full",
        active ? "before:bg-[var(--accent)]" : "before:bg-transparent",
        className
      )}
    >
      {children}
    </Link>
  );
}

function Accordion({
  title,
  open,
  onToggle,
  active,
  accent,
  children,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  active?: boolean;
  accent?: Accent;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1" style={accentStyle(accent)}>
      <button
        onClick={onToggle}
        className={cn(
          "group flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm font-semibold transition-colors",
          active
            ? "bg-[var(--accent-soft)] text-[var(--accent-text)] ring-1 ring-[var(--accent-border)]"
            : "text-slate-800 hover:bg-slate-100"
        )}
      >
        <span className="inline-flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-[var(--accent)]" />
          <span>{title}</span>
        </span>
        <span className="text-xs text-slate-500 group-hover:text-slate-700">
          {open ? "▾" : "▸"}
        </span>
      </button>
      {open && <div className="pl-2 space-y-1">{children}</div>}
    </div>
  );
}

function SubAccordion({
  title,
  href,
  open,
  onToggle,
  children,
  variant = "default",
  active,
}: {
  title: string;
  href?: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
  variant?: "default" | "nav";
  active?: boolean;
}) {
  const isNav = variant === "nav";

  const rowClass = cn(
    isNav
      ? cn(
          "flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm transition-colors",
          active
            ? "bg-[var(--accent-soft)] text-[var(--accent-text)] ring-1 ring-[var(--accent-border)]"
            : "text-slate-700 hover:bg-slate-100"
        )
      : "flex w-full items-center justify-between rounded-xl px-3 py-2 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-100"
  );

  if (href) {
    return (
      <>
        <div className={rowClass}>
          <Link href={href} className="flex-1 text-left">
            {title}
          </Link>

          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onToggle();
            }}
            className={cn(
              "ml-2 rounded px-2 py-1",
              isNav && active ? "hover:bg-black/5" : "hover:bg-slate-200"
            )}
            aria-label={open ? `Fechar ${title}` : `Abrir ${title}`}
          >
            {open ? (isNav ? "▾" : "−") : isNav ? "▸" : "+"}
          </button>
        </div>

        {open && <div className="pl-4 space-y-1">{children}</div>}
      </>
    );
  }

  return (
    <>
      <button onClick={onToggle} className={rowClass}>
        <span>{title}</span>
        <span>{open ? (isNav ? "▾" : "−") : isNav ? "▸" : "+"}</span>
      </button>

      {open && <div className="pl-4 space-y-1">{children}</div>}
    </>
  );
}
