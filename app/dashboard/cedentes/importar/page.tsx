import CedentesImporter from "@/components/cedentes/CedentesImporter";

export const metadata = {
  title: "Importar cedentes • TradeMiles",
};

export default function ImportarCedentesPage() {
  return (
    <div className="p-6 max-w-7xl mx-auto">
      <CedentesImporter />
    </div>
  );
}
