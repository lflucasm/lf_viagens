import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";

export type StatCardTone = "sky" | "emerald" | "amber" | "rose" | "teal" | "slate";

const STAT_CARD_CONTAINER: Record<StatCardTone, string> = {
  sky: "border-sky-100/90 bg-gradient-to-br from-sky-50/80 to-white",
  emerald: "border-emerald-100/90 bg-gradient-to-br from-emerald-50/80 to-white",
  amber: "border-amber-100/90 bg-gradient-to-br from-amber-50/80 to-white",
  rose: "border-rose-100/90 bg-gradient-to-br from-rose-50/80 to-white",
  teal: "border-teal-100/90 bg-gradient-to-br from-teal-50/80 to-white",
  slate: "border-slate-200/80 bg-gradient-to-br from-slate-50/60 to-white",
};

const STAT_CARD_ACCENT: Record<StatCardTone, string> = {
  sky: "bg-sky-500",
  emerald: "bg-emerald-500",
  amber: "bg-amber-500",
  rose: "bg-rose-500",
  teal: "bg-teal-500",
  slate: "bg-slate-400",
};

export function StatCard({
  title,
  value,
  sub,
  tone = "slate",
  className,
}: {
  title: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: StatCardTone;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border p-5 shadow-sm shadow-slate-200/35",
        STAT_CARD_CONTAINER[tone],
        className
      )}
    >
      <div
        className={cn(
          "absolute left-0 top-0 h-full w-1 rounded-r",
          STAT_CARD_ACCENT[tone]
        )}
        aria-hidden
      />
      <div className="relative pl-3">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          {title}
        </div>
        <div className="mt-2 text-xl font-bold tabular-nums tracking-tight text-slate-900">
          {value}
        </div>
        {sub != null && sub !== "" ? (
          <div className="mt-2 text-xs leading-snug text-slate-600">{sub}</div>
        ) : null}
      </div>
    </div>
  );
}

export type SummaryCardTone = StatCardTone;

const SUMMARY_CARD_CLASS: Record<SummaryCardTone, string> = {
  slate: "border-slate-200 bg-white",
  sky: "border-sky-100 bg-sky-50/70",
  emerald: "border-emerald-100 bg-emerald-50/70",
  amber: "border-amber-100 bg-amber-50/70",
  rose: "border-rose-100 bg-rose-50/70",
  teal: "border-teal-100 bg-teal-50/70",
};

export function SummaryCard({
  title,
  value,
  sub,
  tone = "slate",
  valueClassName,
  className,
}: {
  title: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: SummaryCardTone;
  /** Use text-xl when the value is long or non-numeric */
  valueClassName?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border p-4 shadow-sm",
        SUMMARY_CARD_CLASS[tone],
        className
      )}
    >
      <div className="text-xs text-slate-500">{title}</div>
      <div
        className={cn(
          "mt-1 text-2xl font-semibold tabular-nums text-slate-900",
          valueClassName
        )}
      >
        {value}
      </div>
      {sub != null && sub !== "" ? (
        <div className="mt-1 text-xs text-slate-600">{sub}</div>
      ) : null}
    </div>
  );
}

export type ShortcutCardTone = "sky" | "emerald" | "indigo" | "amber";

const SHORTCUT_GRADIENT_RING: Record<ShortcutCardTone, string> = {
  sky: "from-sky-500/15 to-white ring-sky-200/80 hover:ring-sky-300",
  emerald: "from-emerald-500/15 to-white ring-emerald-200/80 hover:ring-emerald-300",
  indigo: "from-indigo-500/15 to-white ring-indigo-200/80 hover:ring-indigo-300",
  amber: "from-amber-500/15 to-white ring-amber-200/80 hover:ring-amber-300",
};

const SHORTCUT_ICON_BG: Record<ShortcutCardTone, string> = {
  sky: "bg-sky-600",
  emerald: "bg-emerald-600",
  indigo: "bg-indigo-600",
  amber: "bg-amber-600",
};

export function ShortcutCard({
  href,
  title,
  description,
  icon,
  tone = "sky",
  className,
}: {
  href: string;
  title: string;
  description: string;
  icon: ReactNode;
  tone?: ShortcutCardTone;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "group relative flex flex-col rounded-2xl border border-slate-200/90 bg-gradient-to-br p-5 shadow-sm ring-1 transition hover:shadow-md",
        SHORTCUT_GRADIENT_RING[tone],
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div
          className={cn(
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white shadow-sm",
            SHORTCUT_ICON_BG[tone]
          )}
        >
          {icon}
        </div>
        <ChevronRight
          className="h-4 w-4 shrink-0 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-slate-600"
          aria-hidden
        />
      </div>
      <div className="mt-4 text-base font-semibold tracking-tight text-slate-900">
        {title}
      </div>
      <p className="mt-1 text-xs leading-relaxed text-slate-600">{description}</p>
    </Link>
  );
}
