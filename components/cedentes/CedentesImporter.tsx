"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";

/* =======================
   Tipos
======================= */
type Funcionario = {
  id: string;
  name: string;
  login: string;
  employeeId?: string | null;
};

type PixTipo = "CPF" | "CNPJ" | "EMAIL" | "TELEFONE" | "ALEATORIA";

type ImportedCedente = {
  nomeCompleto: string;
  cpf: string;

  telefone?: string;
  dataNascimento?: string;
  emailCriado?: string;

  senhaEmail?: string;
  senhaSmiles?: string;
  senhaLatamPass?: string;
  senhaLivelo?: string;
  senhaEsfera?: string;

  banco?: string;
  pixTipo?: PixTipo;
  chavePix?: string;

  pontosLatam: number;
  pontosSmiles: number;
  pontosLivelo: number;
  pontosEsfera: number;

  responsavelRef?: string;
  ownerId?: string | null;
  ownerName?: string | null;
};

type ColumnMap = {
  nomeCompleto?: string;
  cpf?: string;

  telefone?: string;
  dataNascimento?: string;
  emailCriado?: string;

  responsavel?: string;

  banco?: string;
  pixTipo?: string;
  chavePix?: string;

  senhaEmail?: string;
  senhaLatamPass?: string;
  senhaSmiles?: string;
  senhaLivelo?: string;
  senhaEsfera?: string;

  pontosLatam?: string;
  pontosSmiles?: string;
  pontosLivelo?: string;
  pontosEsfera?: string;
};

type FieldDef = { key: keyof ColumnMap; label: string; required?: boolean };

type ExtraSheetCfg = {
  id: string;
  sheetName: string;
  columnMap: ColumnMap;
  rawPreviewKeys: string[];
  nameMatchThreshold?: number; // ✅ 0..1 (default 0.90)
};

type ExtraPack = {
  ex: ExtraSheetCfg;

  // match exato
  idx: Map<string, Record<string, any>>; // cpf -> row
  dup: Map<string, number>; // cpf -> nº ocorrências extras (além do 1º)

  // match aproximado (nome)
  idxName: Map<string, Record<string, any>[]>; // nameKey -> rows

  totalRows: number;
  uniqueCpfs: number;
  dupTotal: number;

  matchedCpf: number;
  matchedName: number;
  unmatched: number;
};

/* =======================
   Utils
======================= */
function norm(v?: string) {
  return (v || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function asStr(v: any) {
  return String(v ?? "").trim();
}

function onlyDigits(v?: string) {
  return (v || "").replace(/\D+/g, "");
}

function firstName(v?: string) {
  return norm(v).split(" ")[0] || "";
}

/** ✅ CPF robusto (pega number e notação científica do Excel) */
function normalizeCpf11(v: any): string {
  if (v == null) return "";

  // number puro (XLSX costuma entregar assim)
  if (typeof v === "number" && Number.isFinite(v)) {
    const s = Math.trunc(v).toString();
    return s.length === 10 ? "0" + s : s;
  }

  let s = String(v).trim();
  if (!s) return "";

  // notação científica (ex: 1.2345678901E+10)
  if (/[eE]/.test(s)) {
    const n = Number(s);
    if (Number.isFinite(n)) {
      const fixed = Math.trunc(n).toString();
      return fixed.length === 10 ? "0" + fixed : fixed;
    }
  }

  let cpf = s.replace(/\D+/g, "");
  if (!cpf) return "";
  if (cpf.length === 10) cpf = "0" + cpf;
  return cpf;
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

/** ✅ Parse robusto de pontos */
function parsePontos(v: any): number {
  if (typeof v === "number" && Number.isFinite(v)) {
    const n = v;
    if (Number.isInteger(n)) return Math.max(0, n);

    const times1000 = n * 1000;
    if (n > 0 && n < 1000 && Math.abs(times1000 - Math.round(times1000)) < 1e-6) {
      return Math.max(0, Math.round(times1000));
    }
    return Math.max(0, Math.floor(n));
  }

  const s0 = asStr(v);
  if (!s0) return 0;

  let s = s0.replace(/\s/g, "").replace(/[R$\u00A0]/g, "");

  if (/^\d{1,3}(\.\d{3})+$/.test(s)) return Math.max(0, parseInt(s.replace(/\./g, ""), 10));
  if (/^\d{1,3}(,\d{3})+$/.test(s)) return Math.max(0, parseInt(s.replace(/,/g, ""), 10));

  const lastDot = s.lastIndexOf(".");
  const lastComma = s.lastIndexOf(",");

  if (lastDot >= 0 && lastComma >= 0) {
    const commaIsDecimal = lastComma > lastDot;
    if (commaIsDecimal) s = s.replace(/\./g, "").replace(/,/g, ".");
    else s = s.replace(/,/g, "");

    const n = Number(s.replace(/[^\d.]/g, ""));
    return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
  }

  if (lastDot >= 0) {
    if (/^\d{1,3}\.\d{3}$/.test(s)) return Math.max(0, parseInt(s.replace(".", ""), 10));
    const n = Number(s.replace(/[^\d.]/g, ""));
    if (Number.isFinite(n) && n > 0 && n < 1000) {
      const t = n * 1000;
      if (Math.abs(t - Math.round(t)) < 1e-6) return Math.max(0, Math.round(t));
    }
    return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
  }

  if (lastComma >= 0) {
    if (/^\d{1,3},\d{3}$/.test(s)) return Math.max(0, parseInt(s.replace(",", ""), 10));
    const n = Number(s.replace(/[^\d,]/g, "").replace(/,/g, "."));
    return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
  }

  const digits = s.replace(/\D+/g, "");
  return digits ? Math.max(0, parseInt(digits, 10)) : 0;
}

function normPixTipo(v: string): PixTipo | undefined {
  const x = norm(v).replace(/\s+/g, "");
  if (!x) return undefined;

  if (x === "cpf") return "CPF";
  if (x === "cnpj") return "CNPJ";
  if (x === "email" || x === "e-mail" || x === "mail") return "EMAIL";
  if (x === "telefone" || x === "celular" || x === "fone" || x === "phone") return "TELEFONE";
  if (x === "aleatoria" || x === "aleatorio" || x === "random") return "ALEATORIA";

  const upper = asStr(v).toUpperCase() as PixTipo;
  if (["CPF", "CNPJ", "EMAIL", "TELEFONE", "ALEATORIA"].includes(upper)) return upper;

  return undefined;
}

/* =======================
   Fuzzy match (Nome)
   ✅ Jaro-Winkler 0..1
======================= */
function jaroWinkler(a0: string, b0: string): number {
  const a = norm(a0);
  const b = norm(b0);
  if (!a || !b) return 0;
  if (a === b) return 1;

  const al = a.length;
  const bl = b.length;
  const matchDist = Math.floor(Math.max(al, bl) / 2) - 1;

  const aMatches = new Array(al).fill(false);
  const bMatches = new Array(bl).fill(false);

  let matches = 0;
  for (let i = 0; i < al; i++) {
    const start = Math.max(0, i - matchDist);
    const end = Math.min(i + matchDist + 1, bl);
    for (let j = start; j < end; j++) {
      if (bMatches[j]) continue;
      if (a[i] !== b[j]) continue;
      aMatches[i] = true;
      bMatches[j] = true;
      matches++;
      break;
    }
  }
  if (!matches) return 0;

  let t = 0;
  let k = 0;
  for (let i = 0; i < al; i++) {
    if (!aMatches[i]) continue;
    while (!bMatches[k]) k++;
    if (a[i] !== b[k]) t++;
    k++;
  }
  const transpositions = t / 2;

  const jaro =
    (matches / al + matches / bl + (matches - transpositions) / matches) / 3;

  // Winkler boost
  let prefix = 0;
  const maxPrefix = 4;
  for (let i = 0; i < Math.min(maxPrefix, al, bl); i++) {
    if (a[i] === b[i]) prefix++;
    else break;
  }

  const p = 0.1;
  return jaro + prefix * p * (1 - jaro);
}

function nameKey90(nome: string) {
  const parts = norm(nome).split(/\s+/).filter(Boolean);
  if (!parts.length) return "";
  if (parts.length === 1) return parts[0];
  return `${parts[0]}|${parts[parts.length - 1]}`; // first|last
}

/* =======================
   Guess map
======================= */
function guessColumnMap(keys: string[]): ColumnMap {
  const nkeys = keys.map((k) => ({ raw: k, n: norm(k).replace(/\s+/g, "") }));

  const find = (candidates: string[]) => {
    const cand = candidates.map((c) => norm(c).replace(/\s+/g, ""));
    const exact = nkeys.find((k) => cand.includes(k.n));
    if (exact) return exact.raw;

    const contains = (needle: string) => nkeys.find((k) => k.n.includes(needle))?.raw;
    for (const c of cand) {
      const got = contains(c);
      if (got) return got;
    }
    return undefined;
  };

  return {
    nomeCompleto: find(["nome", "nomecompleto", "cedente", "titular"]),
    cpf: find(["cpf", "documento", "cpfdocedente"]),

    telefone: find(["telefone", "celular", "whatsapp", "fone"]),
    dataNascimento: find(["datanascimento", "nascimento", "dtnasc"]),
    emailCriado: find(["email", "e-mail", "emailcriado"]),

    responsavel: find(["responsavel", "responsável", "owner", "dono", "funcionario", "funcionário", "pertence"]),

    banco: find(["banco"]),
    pixTipo: find(["pixtipo", "tipopix"]),
    chavePix: find(["chavepix", "pix", "chavepixcpf"]),

    senhaEmail: find(["senhaemail", "senhadoemail", "senha do email"]),
    senhaLatamPass: find(["senhalatam", "senhalatampass", "senha latam", "senha latam pass"]),
    senhaSmiles: find(["senhasmiles", "senha smiles"]),
    senhaLivelo: find(["senhalivelo", "senha livelo"]),
    senhaEsfera: find(["senhaesfera", "senha esfera"]),

    pontosLatam: find(["pontoslatam", "latam", "latampass", "pontos latam", "pontos latam pass"]),
    pontosSmiles: find(["pontossmiles", "smiles", "pontos smiles"]),
    pontosLivelo: find(["pontoslivelo", "livelo", "pontos livelo"]),
    pontosEsfera: find(["pontosesfera", "esfera", "pontos esfera"]),
  };
}

/* =======================
   Lê uma sheet em JSON
   ✅ raw:false reduz alguns bugs (datas/textos)
======================= */
function sheetToJson(workbook: XLSX.WorkBook, sheetName: string) {
  const ws = workbook.Sheets[sheetName];
  if (!ws) return { json: [] as Record<string, any>[], keys: [] as string[] };

  const json = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: "", raw: false });
  const keys = json[0] ? Object.keys(json[0]) : [];
  return { json, keys };
}

/* =======================
   Index por CPF + Nome (com duplicatas)
======================= */
function buildIndexByCpfAndName(json: Record<string, any>[], map: ColumnMap) {
  const idx = new Map<string, Record<string, any>>();
  const dup = new Map<string, number>(); // cpf -> extras além do primeiro

  const idxName = new Map<string, Record<string, any>[]>();

  const cpfCol = map.cpf;
  const nomeCol = map.nomeCompleto;

  for (const r of json) {
    // ---- CPF index ----
    if (cpfCol) {
      const cpf = normalizeCpf11(r?.[cpfCol]);
      if (cpf) {
        if (idx.has(cpf)) {
          dup.set(cpf, (dup.get(cpf) || 0) + 1);
        } else {
          idx.set(cpf, r);
        }
      }
    }

    // ---- Nome index (para fallback) ----
    if (nomeCol) {
      const nome = asStr(r?.[nomeCol]);
      const k = nameKey90(nome);
      if (k) {
        const arr = idxName.get(k) || [];
        arr.push(r);
        idxName.set(k, arr);
      }
    }
  }

  const dupTotal = Array.from(dup.values()).reduce((a, b) => a + b, 0);
  return { idx, dup, idxName, totalRows: json.length, uniqueCpfs: idx.size, dupTotal };
}

/* =======================
   Componente
======================= */
export default function CedentesImporter() {
  const inputRef = useRef<HTMLInputElement | null>(null);

  const [rows, setRows] = useState<ImportedCedente[]>([]);
  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([]);
  const [loading, setLoading] = useState(false);
  const [parsing, setParsing] = useState(false);

  const [fileName, setFileName] = useState<string>("");

  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [wb, setWb] = useState<XLSX.WorkBook | null>(null);

  // Base
  const [baseSheet, setBaseSheet] = useState<string>("");
  const [baseKeys, setBaseKeys] = useState<string[]>([]);
  const [baseMap, setBaseMap] = useState<ColumnMap>({});

  // Extras
  const [extras, setExtras] = useState<ExtraSheetCfg[]>([]);
  const [lastParseMsg, setLastParseMsg] = useState<string>("");

  const fieldDefsBase = useMemo<FieldDef[]>(
    () => [
      { key: "nomeCompleto", label: "Nome completo", required: true },
      { key: "cpf", label: "CPF", required: true },
      { key: "responsavel", label: "Responsável (ref no Excel)" },

      { key: "pontosLatam", label: "Pontos LATAM" },
      { key: "pontosSmiles", label: "Pontos Smiles" },
      { key: "pontosLivelo", label: "Pontos Livelo" },
      { key: "pontosEsfera", label: "Pontos Esfera" },
    ],
    []
  );

  const fieldDefsExtras = useMemo<FieldDef[]>(
    () => [
      { key: "cpf", label: "CPF (para cruzar)", required: true },

      { key: "nomeCompleto", label: "Nome (fallback 90%)" },

      { key: "telefone", label: "Telefone" },
      { key: "dataNascimento", label: "Data de nascimento" },
      { key: "emailCriado", label: "Email criado" },

      { key: "banco", label: "Banco" },
      { key: "pixTipo", label: "Tipo de Pix" },
      { key: "chavePix", label: "Chave Pix" },

      { key: "senhaEmail", label: "Senha do Email" },
      { key: "senhaLatamPass", label: "Senha LATAM Pass" },
      { key: "senhaSmiles", label: "Senha Smiles" },
      { key: "senhaLivelo", label: "Senha Livelo" },
      { key: "senhaEsfera", label: "Senha Esfera" },

      { key: "pontosLatam", label: "Pontos LATAM" },
      { key: "pontosSmiles", label: "Pontos Smiles" },
      { key: "pontosLivelo", label: "Pontos Livelo" },
      { key: "pontosEsfera", label: "Pontos Esfera" },
    ],
    []
  );

  /* =======================
     Carregar funcionários
  ======================= */
  useEffect(() => {
    fetch("/api/funcionarios", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (j?.ok && Array.isArray(j.data)) setFuncionarios(j.data);
      })
      .catch(() => setLastParseMsg("❌ Erro ao carregar funcionários."));
  }, []);

  function matchResponsavel(ref?: string): Funcionario | undefined {
    if (!ref) return undefined;
    const r = norm(ref);

    return (
      funcionarios.find((f) => norm(f.login) === r) ||
      funcionarios.find((f) => norm(f.employeeId || "") === r) ||
      funcionarios.find((f) => norm(f.name) === r) ||
      funcionarios.find((f) => firstName(f.name) === r)
    );
  }

  /* =======================
     Merge geral (base + extras)
======================= */
  function reprocessAll() {
    if (!wb || !baseSheet) return;

    setLastParseMsg("");
    setRows([]);

    const base = sheetToJson(wb, baseSheet);
    const baseJson = base.json;

    const baseCpfCol = baseMap.cpf;
    const baseNomeCol = baseMap.nomeCompleto;

    if (!baseCpfCol || !baseNomeCol) {
      setLastParseMsg("⚠️ Na aba base, selecione pelo menos Nome completo e CPF.");
      return;
    }

    const getB = (r: Record<string, any>, col?: string) => (col ? r?.[col] : "");

    // ---- stats base (duplicatas/unique) ----
    const baseSeen = new Set<string>();
    const baseDup = new Map<string, number>();
    let baseCpfEmpty = 0;

    for (const r of baseJson) {
      const cpf = normalizeCpf11(getB(r, baseCpfCol));
      if (!cpf) {
        baseCpfEmpty++;
        continue;
      }
      if (baseSeen.has(cpf)) baseDup.set(cpf, (baseDup.get(cpf) || 0) + 1);
      else baseSeen.add(cpf);
    }
    const baseDupTotal = Array.from(baseDup.values()).reduce((a, b) => a + b, 0);

    // ---- baseRows ----
    const baseRows: ImportedCedente[] = baseJson
      .map((r) => {
        const cpf = normalizeCpf11(getB(r, baseCpfCol));
        const nome = asStr(getB(r, baseNomeCol));
        if (!cpf || !nome) return null;

        const responsavelRef = asStr(getB(r, baseMap.responsavel));
        const matched = matchResponsavel(responsavelRef);

        const pLatam = parsePontos(getB(r, baseMap.pontosLatam));
        const pSmiles = parsePontos(getB(r, baseMap.pontosSmiles));
        const pLivelo = parsePontos(getB(r, baseMap.pontosLivelo));
        const pEsfera = parsePontos(getB(r, baseMap.pontosEsfera));

        return {
          nomeCompleto: nome,
          cpf,

          telefone: undefined,
          dataNascimento: undefined,
          emailCriado: undefined,

          senhaEmail: undefined,
          senhaSmiles: undefined,
          senhaLatamPass: undefined,
          senhaLivelo: undefined,
          senhaEsfera: undefined,

          banco: undefined,
          pixTipo: undefined,
          chavePix: undefined,

          pontosLatam: pLatam || 0,
          pontosSmiles: pSmiles || 0,
          pontosLivelo: pLivelo || 0,
          pontosEsfera: pEsfera || 0,

          responsavelRef: responsavelRef || undefined,
          ownerId: matched?.id ?? null,
          ownerName: matched?.name ?? null,
        } as ImportedCedente;
      })
      .filter(Boolean) as ImportedCedente[];

    if (!baseRows.length) {
      setLastParseMsg(
        "⚠️ Não consegui montar nenhuma linha a partir da aba base.\n" +
          "Confira se Nome e CPF estão mapeados corretamente."
      );
      return;
    }

    // ---- extras packs + stats ----
    const extraPacks: ExtraPack[] = extras.map((ex) => {
      const { json } = sheetToJson(wb, ex.sheetName);
      const built = buildIndexByCpfAndName(json, ex.columnMap);

      return {
        ex,
        idx: built.idx,
        dup: built.dup,
        idxName: built.idxName,
        totalRows: built.totalRows,
        uniqueCpfs: built.uniqueCpfs,
        dupTotal: built.dupTotal,
        matchedCpf: 0,
        matchedName: 0,
        unmatched: 0,
      };
    });

    // ---- merge ----
    const merged = baseRows.map((row) => {
      let out = { ...row };

      for (const pack of extraPacks) {
        const m = pack.ex.columnMap;
        const threshold = typeof pack.ex.nameMatchThreshold === "number" ? pack.ex.nameMatchThreshold : 0.9;

        // 1) tenta CPF (exato)
        let r = pack.idx.get(row.cpf);
        let matchedBy: "cpf" | "name" | null = r ? "cpf" : null;

        // 2) fallback por NOME (~90%) se não achou CPF
        if (!r) {
          const baseNome = out.nomeCompleto;
          const k = nameKey90(baseNome);
          const candidates = k ? pack.idxName.get(k) || [] : [];

          if (candidates.length && m.nomeCompleto) {
            let best: { row: Record<string, any>; score: number } | null = null;

            // limita para evitar custos altos em planilhas gigantes
            const limit = Math.min(candidates.length, 30);

            for (let i = 0; i < limit; i++) {
              const cand = candidates[i];
              const candNome = asStr(cand?.[m.nomeCompleto]);
              const score = jaroWinkler(baseNome, candNome);

              if (!best || score > best.score) best = { row: cand, score };
              if (best.score >= 0.97) break; // bem alto, pode parar cedo
            }

            if (best && best.score >= threshold) {
              r = best.row;
              matchedBy = "name";
            }
          }
        }

        // stats por pack
        if (!r) {
          pack.unmatched++;
          continue;
        } else {
          if (matchedBy === "cpf") pack.matchedCpf++;
          else if (matchedBy === "name") pack.matchedName++;
        }

        const getE = (col?: string) => (col ? r?.[col] : "");

        const fillIfEmpty = (key: keyof ImportedCedente, val?: string) => {
          const cur = (out as any)[key];
          if ((cur === undefined || cur === null || cur === "") && val) (out as any)[key] = val;
        };

        fillIfEmpty("telefone", asStr(getE(m.telefone)) || undefined);
        fillIfEmpty("dataNascimento", asStr(getE(m.dataNascimento)) || undefined);
        fillIfEmpty("emailCriado", asStr(getE(m.emailCriado)) || undefined);

        fillIfEmpty("banco", asStr(getE(m.banco)) || undefined);

        const pixTipoRaw = asStr(getE(m.pixTipo));
        if (!out.pixTipo) out.pixTipo = normPixTipo(pixTipoRaw);

        fillIfEmpty("chavePix", asStr(getE(m.chavePix)) || undefined);

        fillIfEmpty("senhaEmail", asStr(getE(m.senhaEmail)) || undefined);
        fillIfEmpty("senhaLatamPass", asStr(getE(m.senhaLatamPass)) || undefined);
        fillIfEmpty("senhaSmiles", asStr(getE(m.senhaSmiles)) || undefined);
        fillIfEmpty("senhaLivelo", asStr(getE(m.senhaLivelo)) || undefined);
        fillIfEmpty("senhaEsfera", asStr(getE(m.senhaEsfera)) || undefined);

        const pLatam = parsePontos(getE(m.pontosLatam));
        const pSmiles = parsePontos(getE(m.pontosSmiles));
        const pLivelo = parsePontos(getE(m.pontosLivelo));
        const pEsfera = parsePontos(getE(m.pontosEsfera));

        if (pLatam > 0) out.pontosLatam = pLatam;
        if (pSmiles > 0) out.pontosSmiles = pSmiles;
        if (pLivelo > 0) out.pontosLivelo = pLivelo;
        if (pEsfera > 0) out.pontosEsfera = pEsfera;
      }

      out.pontosLatam = out.pontosLatam || 0;
      out.pontosSmiles = out.pontosSmiles || 0;
      out.pontosLivelo = out.pontosLivelo || 0;
      out.pontosEsfera = out.pontosEsfera || 0;

      return out;
    });

    setRows(merged);

    // ---- mensagem detalhada ----
    const pend = merged.filter((r) => !r.ownerId).length;

    const extraLines =
      extraPacks.length === 0
        ? ""
        : "\n\n📌 Match por aba extra:\n" +
          extraPacks
            .map((p) => {
              const d = p.dupTotal ? ` | dup: ${p.dupTotal}` : "";
              const thr = typeof p.ex.nameMatchThreshold === "number" ? p.ex.nameMatchThreshold : 0.9;
              return `• ${p.ex.sheetName}: total ${p.totalRows}, únicos CPF ${p.uniqueCpfs}${d} | match CPF ${p.matchedCpf} | match Nome>=${thr} ${p.matchedName} | sem match ${p.unmatched}`;
            })
            .join("\n");

    const baseLine =
      `✅ ${merged.length} linhas prontas (Base: ${baseSheet} + ${extras.length} aba(s) extra).\n` +
      `Base: total ${baseJson.length}, CPFs válidos/únicos ${baseSeen.size}` +
      (baseDupTotal ? ` | dup: ${baseDupTotal}` : "") +
      (baseCpfEmpty ? ` | cpf vazio: ${baseCpfEmpty}` : "") +
      (pend ? `\n⚠️ ${pend} sem responsável (pode ajustar manualmente antes de importar).` : "");

    setLastParseMsg(baseLine + extraLines);
  }

  /* =======================
     Upload Excel
  ======================= */
  function handleFile(file: File) {
    setFileName(file.name);
    setRows([]);
    setLastParseMsg("");
    setSheetNames([]);
    setWb(null);

    setBaseSheet("");
    setBaseKeys([]);
    setBaseMap({});
    setExtras([]);

    setParsing(true);

    const reader = new FileReader();

    reader.onerror = () => {
      setParsing(false);
      setLastParseMsg("❌ Não consegui ler o arquivo (FileReader). Tente baixar o Excel e selecionar novamente.");
    };

    reader.onload = (e) => {
      try {
        const result = e.target?.result;
        if (!result) throw new Error("Arquivo vazio no FileReader");

        const data = new Uint8Array(result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });

        const names = workbook.SheetNames || [];
        if (!names.length) throw new Error("Nenhuma aba encontrada no Excel.");

        setWb(workbook);
        setSheetNames(names);

        const def = names[0];
        setBaseSheet(def);

        const { keys } = sheetToJson(workbook, def);
        setBaseKeys(keys);

        const guessed = guessColumnMap(keys);
        setBaseMap(guessed);

        setParsing(false);
        setTimeout(() => reprocessAll(), 0);
      } catch (err: any) {
        console.error("[XLSX READ ERROR]", err);
        setParsing(false);
        setLastParseMsg(
          "❌ Não consegui interpretar esse Excel.\n" +
            "Possíveis causas: arquivo protegido por senha, formato diferente, ou exportação incomum.\n" +
            `Detalhe: ${String(err?.message || err || "")}`
        );
      }
    };

    reader.readAsArrayBuffer(file);
  }

  function onChangeBaseSheet(sheet: string) {
    if (!wb) return;

    setBaseSheet(sheet);
    const { keys } = sheetToJson(wb, sheet);
    setBaseKeys(keys);

    const guessed = guessColumnMap(keys);
    setBaseMap(guessed);

    setRows([]);
    setLastParseMsg("");
    setTimeout(() => reprocessAll(), 0);
  }

  function findCpfCandidate(keys: string[]) {
    const k = keys.find((x) => norm(x).replace(/\s/g, "").includes("cpf"));
    return k;
  }

  function addExtraSheet() {
    if (!wb) return;
    const available = sheetNames.filter((s) => s !== baseSheet && !extras.some((e) => e.sheetName === s));
    if (!available.length) return;

    const s = available[0];
    const { keys } = sheetToJson(wb, s);
    const guessed = guessColumnMap(keys);

    const ex: ExtraSheetCfg = {
      id: uid(),
      sheetName: s,
      rawPreviewKeys: keys,
      nameMatchThreshold: 0.9, // ✅ default 90%
      columnMap: {
        ...guessed,
        cpf: guessed.cpf ?? findCpfCandidate(keys),
      },
    };

    setExtras((prev) => [...prev, ex]);
    setTimeout(() => reprocessAll(), 0);
  }

  function removeExtra(id: string) {
    setExtras((prev) => prev.filter((x) => x.id !== id));
    setTimeout(() => reprocessAll(), 0);
  }

  function changeExtraSheet(id: string, sheetName: string) {
    if (!wb) return;

    const { keys } = sheetToJson(wb, sheetName);
    const guessed = guessColumnMap(keys);

    setExtras((prev) =>
      prev.map((x) =>
        x.id === id
          ? {
              ...x,
              sheetName,
              rawPreviewKeys: keys,
              columnMap: {
                ...guessed,
                cpf: guessed.cpf ?? findCpfCandidate(keys),
              },
            }
          : x
      )
    );

    setTimeout(() => reprocessAll(), 0);
  }

  function setExtraMapField(id: string, key: keyof ColumnMap, value?: string) {
    setExtras((prev) =>
      prev.map((x) => (x.id === id ? { ...x, columnMap: { ...x.columnMap, [key]: value } } : x))
    );
  }

  function setBaseMapField(key: keyof ColumnMap, value?: string) {
    setBaseMap((prev) => ({ ...prev, [key]: value }));
  }

  /* =======================
     Pendências / validações
  ======================= */
  const pendentes = useMemo(() => rows.filter((r) => !r.ownerId).length, [rows]);
  const baseOk = useMemo(() => Boolean(baseMap.nomeCompleto && baseMap.cpf), [baseMap]);
  const extrasOk = useMemo(() => extras.every((e) => Boolean(e.columnMap.cpf)), [extras]);

  /* =======================
     Importar
  ======================= */
  async function importar() {
    if (!rows.length) return alert("Nada para importar.");
    if (!baseOk) return alert("Na aba base, selecione Nome e CPF.");
    if (!extrasOk) return alert("Em todas as abas extras, selecione a coluna CPF (para cruzar).");

    setLoading(true);
    try {
      const res = await fetch("/api/cedentes/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows }),
      });

      const json = await res.json();
      if (!json?.ok) throw new Error(json.error || "Erro ao importar");

      alert(`✅ Importados ${json.data.count} cedentes\nPulados: ${json.data.skipped}`);

      setRows([]);
      setFileName("");
      setSheetNames([]);
      setWb(null);

      setBaseSheet("");
      setBaseKeys([]);
      setBaseMap({});
      setExtras([]);

      setLastParseMsg("");

      if (inputRef.current) inputRef.current.value = "";
    } catch (e: any) {
      alert(e.message);
    } finally {
      setLoading(false);
    }
  }

  /* =======================
     UI
  ======================= */
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Importar Cedentes (Multi-abas)</h1>
        <p className="text-sm text-slate-600">
          Aba base traz Nome + CPF. Abas extras cruzam por CPF e, se falhar, tentam match por Nome (≈90%).
        </p>
      </div>

      {/* Upload */}
      <div className="space-y-2">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="inline-flex items-center gap-2 rounded-xl bg-black px-4 py-2 text-white hover:bg-gray-800"
        >
          <span>📄 Escolher arquivo Excel</span>
        </button>

        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
        />

        {fileName ? (
          <div className="text-sm text-slate-600">
            Arquivo selecionado: <b>{fileName}</b>
          </div>
        ) : null}

        {parsing ? <div className="text-sm text-slate-600">Lendo o Excel…</div> : null}

        {lastParseMsg ? <div className="whitespace-pre-line text-sm text-slate-700">{lastParseMsg}</div> : null}
      </div>

      {/* Base */}
      {sheetNames.length > 0 && (
        <div className="rounded-xl border bg-white p-4 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="font-semibold text-sm">Aba Base (Nome + CPF)</div>
              <div className="text-xs text-slate-600">Essa aba é a lista principal de cedentes.</div>
            </div>

            <button
              type="button"
              onClick={reprocessAll}
              className="rounded-lg border px-3 py-2 text-xs hover:bg-slate-50"
              disabled={!wb || !baseSheet}
            >
              🔄 Reprocessar tudo
            </button>
          </div>

          <div className="flex flex-col gap-2">
            <div className="text-xs font-medium">Escolha a aba base</div>
            <select
              className="w-full max-w-md rounded-xl border px-3 py-2 text-sm"
              value={baseSheet}
              onChange={(e) => onChangeBaseSheet(e.target.value)}
            >
              {sheetNames.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          {baseKeys.length > 0 && (
            <div className="grid gap-3 md:grid-cols-2">
              {fieldDefsBase.map((f) => {
                const value = (baseMap as any)[f.key] ?? "";
                return (
                  <div key={String(f.key)} className="flex items-center gap-3">
                    <div className="w-44 text-xs">
                      {f.label} {f.required ? <span className="text-red-600">*</span> : null}
                    </div>

                    <select
                      className="flex-1 rounded border px-2 py-1 text-xs"
                      value={value}
                      onChange={(e) => setBaseMapField(f.key, e.target.value || undefined)}
                    >
                      <option value="">— Não usar —</option>
                      {baseKeys.map((col) => (
                        <option key={col} value={col}>
                          {col}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>
          )}

          {!baseOk ? (
            <div className="text-xs text-red-700">
              ⚠️ Na aba base, selecione <b>Nome completo</b> e <b>CPF</b>.
            </div>
          ) : null}
        </div>
      )}

      {/* Extras */}
      {sheetNames.length > 0 && (
        <div className="rounded-xl border bg-white p-4 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="font-semibold text-sm">Abas Complementares (merge por CPF)</div>
              <div className="text-xs text-slate-600">
                Se CPF falhar, tenta por <b>Nome</b> (first+last) com similaridade ~90% (Jaro-Winkler).
              </div>
            </div>

            <button
              type="button"
              onClick={addExtraSheet}
              className="rounded-lg bg-black px-3 py-2 text-xs text-white hover:bg-gray-800"
              disabled={!wb}
            >
              ➕ Adicionar aba extra
            </button>
          </div>

          {extras.length === 0 ? (
            <div className="text-xs text-slate-600">Nenhuma aba extra adicionada.</div>
          ) : (
            <div className="space-y-4">
              {extras.map((ex) => {
                const available = sheetNames.filter(
                  (s) => s !== baseSheet && (!extras.some((e) => e.sheetName === s) || s === ex.sheetName)
                );

                const cpfOk = Boolean(ex.columnMap.cpf);

                return (
                  <div key={ex.id} className="rounded-xl border p-4 space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-semibold">Aba extra</div>
                      <button
                        type="button"
                        onClick={() => removeExtra(ex.id)}
                        className="rounded-lg border px-3 py-2 text-xs hover:bg-slate-50"
                      >
                        Remover
                      </button>
                    </div>

                    <div className="flex flex-col gap-2">
                      <div className="text-xs font-medium">Escolha a aba</div>
                      <select
                        className="w-full max-w-md rounded-xl border px-3 py-2 text-sm"
                        value={ex.sheetName}
                        onChange={(e) => changeExtraSheet(ex.id, e.target.value)}
                      >
                        {available.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* threshold */}
                    <div className="flex items-center gap-3">
                      <div className="w-44 text-xs">Match por Nome (&gt;=)</div>
                      <input
                        type="number"
                        step="0.01"
                        min="0.75"
                        max="0.99"
                        className="w-28 rounded border px-2 py-1 text-xs"
                        value={ex.nameMatchThreshold ?? 0.9}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          setExtras((prev) =>
                            prev.map((x) => (x.id === ex.id ? { ...x, nameMatchThreshold: v } : x))
                          );
                          setTimeout(() => reprocessAll(), 0);
                        }}
                      />
                      <div className="text-xs text-slate-500">ex: 0.90 (padrão)</div>
                    </div>

                    {ex.rawPreviewKeys.length > 0 && (
                      <div className="grid gap-3 md:grid-cols-2">
                        {fieldDefsExtras.map((f) => {
                          const value = (ex.columnMap as any)[f.key] ?? "";
                          return (
                            <div key={String(f.key)} className="flex items-center gap-3">
                              <div className="w-44 text-xs">
                                {f.label} {f.required ? <span className="text-red-600">*</span> : null}
                              </div>

                              <select
                                className="flex-1 rounded border px-2 py-1 text-xs"
                                value={value}
                                onChange={(e) => setExtraMapField(ex.id, f.key, e.target.value || undefined)}
                              >
                                <option value="">— Não usar —</option>
                                {ex.rawPreviewKeys.map((col) => (
                                  <option key={col} value={col}>
                                    {col}
                                  </option>
                                ))}
                              </select>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {!cpfOk ? (
                      <div className="text-xs text-red-700">
                        ⚠️ Selecione a coluna <b>CPF</b> nessa aba (para cruzar).
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Tabela preview */}
      {rows.length > 0 && (
        <>
          {pendentes > 0 && (
            <div className="rounded-xl border border-yellow-300 bg-yellow-50 p-3 text-sm">
              ⚠️ {pendentes} cedente(s) sem responsável. Pode importar assim e ajustar depois na edição.
            </div>
          )}

          <div className="max-h-96 overflow-auto rounded-xl border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-50">
                <tr>
                  <th className="px-3 py-2 text-left">Nome</th>
                  <th className="px-3 py-2">CPF</th>
                  <th className="px-3 py-2">Responsável</th>
                  <th className="px-3 py-2">LATAM</th>
                  <th className="px-3 py-2">Smiles</th>
                  <th className="px-3 py-2">Livelo</th>
                  <th className="px-3 py-2">Esfera</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className={`border-t ${!r.ownerId ? "bg-yellow-50" : ""}`}>
                    <td className="px-3 py-2">{r.nomeCompleto}</td>
                    <td className="px-3 py-2">{r.cpf}</td>
                    <td className="px-3 py-2">
                      {r.ownerId ? (
                        r.ownerName
                      ) : (
                        <select
                          className="rounded border px-2 py-1 text-xs"
                          value={r.ownerId ?? ""}
                          onChange={(e) => {
                            const id = e.target.value || null;
                            const f = funcionarios.find((x) => x.id === id);
                            setRows((prev) =>
                              prev.map((x, idx) => (idx === i ? { ...x, ownerId: id, ownerName: f?.name ?? null } : x))
                            );
                          }}
                        >
                          <option value="">Selecionar</option>
                          {funcionarios.map((f) => (
                            <option key={f.id} value={f.id}>
                              {f.name} ({f.login})
                            </option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td className="px-3 py-2">{r.pontosLatam ?? 0}</td>
                    <td className="px-3 py-2">{r.pontosSmiles ?? 0}</td>
                    <td className="px-3 py-2">{r.pontosLivelo ?? 0}</td>
                    <td className="px-3 py-2">{r.pontosEsfera ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button
            onClick={importar}
            disabled={loading || !baseOk || !extrasOk}
            className="rounded-xl bg-black px-5 py-2 text-white disabled:opacity-50"
          >
            {!baseOk
              ? "Selecione Nome e CPF (Base)"
              : !extrasOk
              ? "Selecione CPF em todas as abas extras"
              : loading
              ? "Importando..."
              : "Importar todos"}
          </button>
        </>
      )}
    </div>
  );
}
