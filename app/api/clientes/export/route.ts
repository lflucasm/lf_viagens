// app/api/clientes/export/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function dateBR(value: string | Date) {
  try {
    return new Date(value).toLocaleDateString("pt-BR");
  } catch {
    return String(value);
  }
}

function origemLabel(
  o: "BALCAO_MILHAS" | "PARTICULAR" | "SITE" | "OUTROS",
  desc?: string | null
) {
  if (o === "BALCAO_MILHAS") return "Balcão de milhas";
  if (o === "PARTICULAR") return "Particular";
  if (o === "SITE") return "Site";
  return desc ? `Outros — ${desc}` : "Outros";
}

type ExcelCellLike = {
  border?: unknown;
  fill?: unknown;
};

type ExcelRowLike = {
  eachCell: (callback: (cell: ExcelCellLike) => void) => void;
};

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  return fallback;
}

export async function GET() {
  try {
    // ✅ dynamic import (evita resolver no build)
    const mod = await import("exceljs");
    const ExcelJS = mod.default ?? mod;

    const clientes = await prisma.cliente.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        identificador: true,
        nome: true,
        tipo: true,
        cpfCnpj: true,
        telefone: true,
        origem: true,
        origemDescricao: true,
        affiliate: {
          select: {
            name: true,
            commissionBps: true,
          },
        },
        createdAt: true,
      },
    });

    const wb = new ExcelJS.Workbook();
    wb.creator = "TradeMiles";
    wb.created = new Date();

    const ws = wb.addWorksheet("Clientes");

    ws.columns = [
      { header: "ID", key: "identificador", width: 14 },
      { header: "Nome", key: "nome", width: 36 },
      { header: "Tipo", key: "tipo", width: 12 },
      { header: "CPF/CNPJ", key: "cpfCnpj", width: 20 },
      { header: "Telefone", key: "telefone", width: 18 },
      { header: "Origem", key: "origem", width: 22 },
      { header: "Indicação", key: "affiliate", width: 28 },
      { header: "Comissão afiliado", key: "affiliateCommission", width: 18 },
      { header: "Criado em", key: "createdAt", width: 14 },
    ];

    // header style
    ws.getRow(1).font = { bold: true };
    ws.views = [{ state: "frozen", ySplit: 1 }];

    for (const c of clientes) {
      ws.addRow({
        identificador: c.identificador,
        nome: c.nome,
        tipo: c.tipo === "EMPRESA" ? "Empresa" : "Pessoa",
        cpfCnpj: c.cpfCnpj || "",
        telefone: c.telefone || "",
        origem: origemLabel(c.origem, c.origemDescricao),
        affiliate: c.affiliate?.name || "",
        affiliateCommission: c.affiliate
          ? `${(c.affiliate.commissionBps / 100).toLocaleString("pt-BR")}%`
          : "",
        createdAt: dateBR(c.createdAt),
      });
    }

    // bordas leves
    ws.eachRow((row: ExcelRowLike, rowNumber: number) => {
      row.eachCell((cell) => {
        cell.border = {
          top: { style: "thin", color: { argb: "FFE5E7EB" } },
          left: { style: "thin", color: { argb: "FFE5E7EB" } },
          bottom: { style: "thin", color: { argb: "FFE5E7EB" } },
          right: { style: "thin", color: { argb: "FFE5E7EB" } },
        };
        if (rowNumber === 1) {
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFF1F5F9" },
          };
        }
      });
    });

    const buf = await wb.xlsx.writeBuffer();

    const now = new Date();
    const y = String(now.getFullYear());
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    const filename = `clientes_${y}-${m}-${d}.xlsx`;

    return new NextResponse(Buffer.from(buf), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, error: errorMessage(e, "Falha ao exportar XLSX") },
      { status: 500 }
    );
  }
}
