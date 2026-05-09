import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://tradmiles-final.vercel.app"),
  title: {
    default: "LF Viagens · TradeMiles",
    template: "%s · LF Viagens · TradeMiles",
  },
  description: "Painel de gestão de milhas, compras e emissões.",
  icons: [{ rel: "icon", url: "/favicon.ico" }],
  openGraph: {
    type: "website",
    url: "https://tradmiles-final.vercel.app",
    title: "LF Viagens · TradeMiles",
    description: "Painel de gestão de milhas, compras e emissões.",
    siteName: "LF Viagens · TradeMiles",
  },
  themeColor: "#000000",
  robots: { index: true, follow: true },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body
        className={`${geistSans.variable} ${geistMono.variable} min-h-screen bg-slate-50 font-sans text-slate-900 antialiased`}
      >
        <div className="flex min-h-screen flex-col">
          <main className="flex-1">{children}</main>

          <footer className="border-t border-slate-200/80 bg-white/90 py-3 text-center text-xs text-slate-500">
            Desenvolvido por <strong className="text-slate-700">Dr. Jephesson Santos</strong>
          </footer>
        </div>
      </body>
    </html>
  );
}
