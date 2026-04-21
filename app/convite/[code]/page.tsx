import ConviteClient from "./ConviteClient";

export const dynamic = "force-dynamic";

export default async function ConvitePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <ConviteClient code={code} />;
}
