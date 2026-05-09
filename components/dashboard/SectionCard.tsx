import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Painel de secção alinhado ao resto do dashboard (borda suave, sombra leve). */
export function SectionCard({
  title,
  children,
  className,
  headerClassName,
  bodyClassName,
  noPadding,
}: {
  title?: ReactNode;
  children: ReactNode;
  className?: string;
  headerClassName?: string;
  bodyClassName?: string;
  /** Se true, não aplica padding no corpo (útil para tabelas full-bleed). */
  noPadding?: boolean;
}) {
  return (
    <section
      className={cn(
        "overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm shadow-slate-200/35",
        className
      )}
    >
      {title != null && title !== "" ? (
        <div
          className={cn(
            "border-b border-slate-100 bg-gradient-to-r from-slate-50/80 to-white px-5 py-3.5",
            headerClassName
          )}
        >
          {typeof title === "string" ? (
            <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
          ) : (
            title
          )}
        </div>
      ) : null}
      <div className={cn(!noPadding && "p-5", bodyClassName)}>{children}</div>
    </section>
  );
}
