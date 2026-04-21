import EditarClienteClient from "./editar-cliente-client";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EditarClienteClient id={id} />;
}
