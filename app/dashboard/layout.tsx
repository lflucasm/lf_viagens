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
      <div className="min-h-screen w-full overflow-x-hidden bg-gradient-to-br from-slate-100 via-slate-50 to-white text-slate-900">
        <div className="flex w-full">
          <Sidebar />
          <main className="dashboard-surface flex min-h-screen min-w-0 flex-1">
            <div className="mx-auto w-full max-w-[1920px] px-4 py-7 sm:px-6 sm:py-8 lg:px-10 lg:py-9">
              {children}
            </div>
          </main>
        </div>
      </div>
    </AuthGuard>
  );
}
