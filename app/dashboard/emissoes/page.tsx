import EmissionsClient from "./EmissionsClient";

type SP = Record<string, string | string[] | undefined>;

function pick(sp: SP, key: string) {
  const v = sp[key];
  return Array.isArray(v) ? v[0] : v;
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<SP> | SP;
}) {
  const sp = await Promise.resolve(searchParams as any);

  const initialProgram = (pick(sp, "programa") ?? "latam").toString();
  const initialCedenteId = (pick(sp, "cedenteId") ?? "").toString();

  return (
    <div className="p-6">
      <EmissionsClient
        initialProgram={initialProgram}
        initialCedenteId={initialCedenteId}
      />
    </div>
  );
}
