import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const users = await prisma.user.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, login: true, team: true, role: true },
    take: 200,
  });

  return NextResponse.json({ ok: true, users });
}
