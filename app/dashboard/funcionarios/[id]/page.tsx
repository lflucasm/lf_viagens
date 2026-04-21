// app/dashboard/funcionarios/[id]/page.tsx
import FuncionarioEditClient from "./FuncionarioEditClient";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <FuncionarioEditClient id={id} />;
}
