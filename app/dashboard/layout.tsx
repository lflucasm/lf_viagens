// app/dashboard/layout.tsx
import Sidebar from "@/components/Sidebar";
import AuthGuard from "@/components/AuthGuard";

export const dynamic = "force-dynamic";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGuard>
      <div className="min-h-screen w-screen bg-white text-slate-900 overflow-x-hidden">
        <div className="flex w-full">
          <Sidebar />
          <main className="flex-1 min-w-0">
            <div className="w-full px-4 sm:px-6 lg:px-8 py-6">{children}</div>
          </main>
        </div>
      </div>
    </AuthGuard>
  );
}
