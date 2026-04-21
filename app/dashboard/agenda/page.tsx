"use client";

import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/cn";

type ViewMode = "MES" | "SEMANA" | "DIA";

type Member = {
  id: string;
  name: string;
  login: string;
  colorHex: string; // "#RRGGBB"
};

type AgendaEvent = {
  id: string;
  type: "SHIFT" | "ABSENCE";
  dateBR: string;     // "DD/MM/AAAA"
  dateISO: string;    // "YYYY-MM-DD"
  startMin: number;
  endMin: number;
  startHHMM: string;
  endHHMM: string;
  note: string;
  user: { id: string; name: string; login: string };
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
}
function brMonthFromDate(d: Date) {
  const mm = pad2(d.getMonth() + 1);
  const yyyy = d.getFullYear();
  return `${mm}/${yyyy}`;
}
function ymFromBrMonth(mmYYYY: string) {
  const [mm, yyyy] = mmYYYY.split("/");
  return `${yyyy}-${mm}`;
}
function daysInYM(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  // último dia do mês
  return new Date(Date.UTC(y, m, 0, 12, 0, 0)).getUTCDate();
}
function isoFromYMD(y: number, m: number, d: number) {
  return `${y}-${pad2(m)}-${pad2(d)}`;
}
function brFromISO(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}
function isoFromBR(br: string) {
  const [d, m, y] = br.split("/");
  return `${y}-${m}-${d}`;
}
function weekdaySunIndexUTC(iso: string) {
  // 0 = Sunday ... 6 = Saturday
  const dt = new Date(`${iso}T12:00:00.000Z`);
  return dt.getUTCDay();
}
function hexToRgba(hex: string, a: number) {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}
function maskBRDate(v: string) {
  const digits = (v || "").replace(/\D/g, "").slice(0, 8);
  const d = digits.slice(0, 2);
  const m = digits.slice(2, 4);
  const y = digits.slice(4, 8);
  const parts = [d, m, y].filter(Boolean);
  return parts.join("/").slice(0, 10);
}

export default function AgendaPage() {
  const [view, setView] = useState<ViewMode>("MES");
  const [mesBR, setMesBR] = useState(() => brMonthFromDate(new Date()));
  const ym = useMemo(() => ymFromBrMonth(mesBR), [mesBR]);

  const [loading, setLoading] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const [events, setEvents] = useState<AgendaEvent[]>([]);

  const [selectedISO, setSelectedISO] = useState<string>(() => {
    const now = new Date();
    return isoFromYMD(now.getFullYear(), now.getMonth() + 1, now.getDate());
  });

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`/api/agenda?mes=${encodeURIComponent(mesBR)}`, { cache: "no-store" });
      const json = await res.json();
      if (!json?.ok) throw new Error(json?.error || "Erro ao carregar agenda.");

      setMembers(json.data.members || []);
      setEvents(json.data.events || []);
    } catch (e: any) {
      alert(e?.message || "Erro ao carregar.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mesBR]);

  function prevMonth() {
    const [mm, yyyy] = mesBR.split("/").map(Number);
    const dt = new Date(yyyy, mm - 2, 1);
    setMesBR(brMonthFromDate(dt));
  }
  function nextMonth() {
    const [mm, yyyy] = mesBR.split("/").map(Number);
    const dt = new Date(yyyy, mm, 1);
    setMesBR(brMonthFromDate(dt));
  }

  const eventsByISO = useMemo(() => {
    const map = new Map<string, AgendaEvent[]>();
    for (const e of events) {
      const arr = map.get(e.dateISO) || [];
      arr.push(e);
      map.set(e.dateISO, arr);
    }
    for (const [k, arr] of map) {
      arr.sort((a, b) => a.startMin - b.startMin);
      map.set(k, arr);
    }
    return map;
  }, [events]);

  const memberColor = useMemo(() => {
    const m = new Map<string, string>();
    for (const u of members) m.set(u.id, u.colorHex);
    return m;
  }, [members]);

  // ===== Modal cadastro =====
  const [modalOpen, setModalOpen] = useState(false);
  const [formType, setFormType] = useState<"SHIFT" | "ABSENCE">("SHIFT");
  const [formDateBR, setFormDateBR] = useState(() => brFromISO(selectedISO));
  const [formAllDay, setFormAllDay] = useState(false);
  const [formStart, setFormStart] = useState("07:00");
  const [formEnd, setFormEnd] = useState("12:00");
  const [formNote, setFormNote] = useState("");

  // para troca/editar/excluir
  const [activeEvent, setActiveEvent] = useState<AgendaEvent | null>(null);

  useEffect(() => {
    setFormDateBR(brFromISO(selectedISO));
  }, [selectedISO]);

  function openCreate(dateISO: string) {
    setSelectedISO(dateISO);
    setFormDateBR(brFromISO(dateISO));
    setFormType("SHIFT");
    setFormAllDay(false);
    setFormStart("07:00");
    setFormEnd("12:00");
    setFormNote("");
    setModalOpen(true);
  }

  async function createEvent() {
    try {
      const payload: any = {
        type: formType,
        date: formDateBR,
        note: formNote,
      };

      if (formType === "ABSENCE" && formAllDay) {
        payload.allDay = true;
      } else {
        payload.start = formStart;
        payload.end = formEnd;
      }

      const res = await fetch("/api/agenda", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (!json?.ok) throw new Error(json?.error || "Falha ao cadastrar.");

      setModalOpen(false);
      await load();
    } catch (e: any) {
      alert(e?.message || "Erro ao cadastrar.");
    }
  }

  async function deleteEvent(id: string) {
    if (!confirm("Excluir este item da agenda?")) return;
    try {
      const res = await fetch(`/api/agenda?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      const json = await res.json();
      if (!json?.ok) throw new Error(json?.error || "Falha ao excluir.");
      setActiveEvent(null);
      await load();
    } catch (e: any) {
      alert(e?.message || "Erro ao excluir.");
    }
  }

  async function swapEvent(id: string, toUserId: string) {
    try {
      const res = await fetch(`/api/agenda?id=${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ swapToUserId: toUserId }),
      });
      const json = await res.json();
      if (!json?.ok) throw new Error(json?.error || "Falha ao trocar.");
      setActiveEvent(null);
      await load();
    } catch (e: any) {
      alert(e?.message || "Erro ao trocar.");
    }
  }

  async function setColor(userId: string, colorHex: string) {
    try {
      const res = await fetch("/api/agenda/colors", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, colorHex }),
      });
      const json = await res.json();
      if (!json?.ok) throw new Error(json?.error || "Falha ao salvar cor.");
      await load();
    } catch (e: any) {
      alert(e?.message || "Erro ao salvar cor.");
    }
  }

  // ===== Views =====
  const monthDays = useMemo(() => {
    const total = daysInYM(ym);
    const [yStr, mStr] = ym.split("-");
    const y = Number(yStr);
    const m = Number(mStr);

    const firstISO = isoFromYMD(y, m, 1);
    const offset = weekdaySunIndexUTC(firstISO); // quantos vazios antes do dia 1 (domingo=0)
    const cells: Array<{ iso: string | null; day: number | null }> = [];

    for (let i = 0; i < offset; i++) cells.push({ iso: null, day: null });
    for (let d = 1; d <= total; d++) {
      const iso = isoFromYMD(y, m, d);
      cells.push({ iso, day: d });
    }
    // completa para 6 linhas (42 células) p/ ficar visual
    while (cells.length < 42) cells.push({ iso: null, day: null });
    return cells;
  }, [ym]);

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2">
          <button
            className="border rounded px-3 py-2 hover:bg-slate-50"
            onClick={prevMonth}
          >
            ◀
          </button>
          <div className="font-semibold text-lg">Agenda — {mesBR}</div>
          <button
            className="border rounded px-3 py-2 hover:bg-slate-50"
            onClick={nextMonth}
          >
            ▶
          </button>
          {loading && <span className="text-xs text-slate-500 ml-2">carregando…</span>}
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            className={cn("border rounded px-3 py-2", view === "MES" && "bg-black text-white")}
            onClick={() => setView("MES")}
          >
            Mês
          </button>
          <button
            className={cn("border rounded px-3 py-2", view === "SEMANA" && "bg-black text-white")}
            onClick={() => setView("SEMANA")}
          >
            Semana
          </button>
          <button
            className={cn("border rounded px-3 py-2", view === "DIA" && "bg-black text-white")}
            onClick={() => setView("DIA")}
          >
            Dia
          </button>

          <button
            className="border rounded px-3 py-2 hover:bg-slate-50"
            onClick={() => openCreate(selectedISO)}
          >
            + Cadastrar
          </button>
        </div>
      </div>

      {/* Cores por funcionário */}
      <div className="border rounded-xl p-4">
        <div className="font-semibold mb-2">Cores dos funcionários</div>
        <div className="flex flex-wrap gap-3">
          {members.map((m) => (
            <div key={m.id} className="flex items-center gap-2 border rounded-lg px-3 py-2">
              <span
                className="inline-block w-3 h-3 rounded-full"
                style={{ backgroundColor: m.colorHex }}
              />
              <span className="text-sm">{m.name}</span>
              <input
                type="color"
                value={m.colorHex}
                onChange={(e) => setColor(m.id, e.target.value)}
                className="ml-1"
                title="Alterar cor"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Views */}
      {view === "MES" && (
        <div className="border rounded-xl p-4">
          <div className="grid grid-cols-7 gap-2 text-xs font-semibold text-slate-600 mb-2">
            <div>Dom</div><div>Seg</div><div>Ter</div><div>Qua</div><div>Qui</div><div>Sex</div><div>Sáb</div>
          </div>

          <div className="grid grid-cols-7 gap-2">
            {monthDays.map((c, idx) => {
              if (!c.iso) {
                return <div key={idx} className="h-28 border rounded-lg bg-slate-50" />;
              }

              const dayEvents = eventsByISO.get(c.iso) || [];
              const isSelected = selectedISO === c.iso;

              return (
                <div
                  key={c.iso}
                  className={cn(
                    "h-28 border rounded-lg p-2 overflow-hidden cursor-pointer hover:bg-slate-50",
                    isSelected && "ring-2 ring-black"
                  )}
                  onClick={() => setSelectedISO(c.iso!)}
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="text-xs font-semibold">{c.day}</div>
                    <button
                      className="text-[11px] border rounded px-2 py-0.5 hover:bg-white"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        openCreate(c.iso!);
                      }}
                    >
                      +
                    </button>
                  </div>

                  <div className="space-y-1">
                    {dayEvents.slice(0, 4).map((ev) => {
                      const color = memberColor.get(ev.user.id) || "#111827";
                      const bg = ev.type === "ABSENCE" ? "rgba(239,68,68,0.10)" : hexToRgba(color, 0.12);
                      const bd = ev.type === "ABSENCE" ? "#EF4444" : color;

                      const label =
                        ev.type === "ABSENCE"
                          ? `Ausência • ${ev.user.name}`
                          : `${ev.startHHMM}-${ev.endHHMM} • ${ev.user.name}`;

                      return (
                        <button
                          key={ev.id}
                          className="w-full text-left text-[11px] rounded px-2 py-1 border"
                          style={{ backgroundColor: bg, borderColor: bd }}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setActiveEvent(ev);
                          }}
                          title={ev.note ? `${label}\n\n${ev.note}` : label}
                        >
                          <div className="truncate">{label}</div>
                        </button>
                      );
                    })}

                    {dayEvents.length > 4 && (
                      <div className="text-[11px] text-slate-500">
                        +{dayEvents.length - 4}…
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {view !== "MES" && (
        <div className="border rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="font-semibold">
              {view === "SEMANA" ? "Visão semanal" : "Visão diária"} — {brFromISO(selectedISO)}
            </div>
            <button
              className="border rounded px-3 py-2 hover:bg-slate-50"
              onClick={() => openCreate(selectedISO)}
            >
              + Cadastrar
            </button>
          </div>

          {/* MVP: lista por dia (semana) ou lista do dia */}
          {view === "DIA" ? (
            <DayList
              iso={selectedISO}
              events={eventsByISO.get(selectedISO) || []}
              memberColor={memberColor}
              onPick={(ev) => setActiveEvent(ev)}
            />
          ) : (
            <WeekList
              selectedISO={selectedISO}
              eventsByISO={eventsByISO}
              memberColor={memberColor}
              onPick={(ev) => setActiveEvent(ev)}
              onJump={(iso) => setSelectedISO(iso)}
            />
          )}
        </div>
      )}

      {/* Modal cadastro */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl w-full max-w-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="font-semibold">Cadastrar</div>
              <button className="text-sm" onClick={() => setModalOpen(false)}>✕</button>
            </div>

            <div className="flex gap-2">
              <button
                className={cn("flex-1 border rounded px-3 py-2", formType === "SHIFT" && "bg-black text-white")}
                onClick={() => setFormType("SHIFT")}
              >
                Trabalho
              </button>
              <button
                className={cn("flex-1 border rounded px-3 py-2", formType === "ABSENCE" && "bg-black text-white")}
                onClick={() => setFormType("ABSENCE")}
              >
                Ausência
              </button>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Data (DD/MM/AAAA)</label>
              <input
                value={formDateBR}
                onChange={(e) => setFormDateBR(maskBRDate(e.target.value))}
                className="w-full border rounded px-3 py-2"
                placeholder="08/02/2026"
              />
            </div>

            {formType === "ABSENCE" && (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={formAllDay}
                  onChange={(e) => setFormAllDay(e.target.checked)}
                />
                Dia inteiro
              </label>
            )}

            {!(formType === "ABSENCE" && formAllDay) && (
              <>
                {formType === "SHIFT" && (
                  <div className="flex flex-wrap gap-2">
                    <button
                      className="border rounded px-3 py-2 text-sm hover:bg-slate-50"
                      onClick={() => { setFormStart("07:00"); setFormEnd("12:00"); }}
                      type="button"
                    >
                      Manhã (07–12)
                    </button>
                    <button
                      className="border rounded px-3 py-2 text-sm hover:bg-slate-50"
                      onClick={() => { setFormStart("12:00"); setFormEnd("17:00"); }}
                      type="button"
                    >
                      Tarde (12–17)
                    </button>
                    <button
                      className="border rounded px-3 py-2 text-sm hover:bg-slate-50"
                      onClick={() => { setFormStart("17:00"); setFormEnd("22:00"); }}
                      type="button"
                    >
                      Noite (17–22)
                    </button>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-sm font-medium">Início</label>
                    <input
                      value={formStart}
                      onChange={(e) => setFormStart(e.target.value)}
                      className="w-full border rounded px-3 py-2"
                      placeholder="07:00"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium">Fim</label>
                    <input
                      value={formEnd}
                      onChange={(e) => setFormEnd(e.target.value)}
                      className="w-full border rounded px-3 py-2"
                      placeholder="12:00"
                    />
                  </div>
                </div>

                <div className="text-xs text-slate-500">
                  Trabalho: blocos 5h (07–12 / 12–17 / 17–22) ou blocos 1h. Ausência: qualquer intervalo (ou dia inteiro).
                </div>
              </>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium">Observação (opcional)</label>
              <textarea
                value={formNote}
                onChange={(e) => setFormNote(e.target.value)}
                className="w-full border rounded px-3 py-2 min-h-[80px]"
                placeholder="Ex.: consulta médica às 15h…"
              />
            </div>

            <div className="flex gap-2 justify-end">
              <button className="border rounded px-4 py-2" onClick={() => setModalOpen(false)}>
                Cancelar
              </button>
              <button className="bg-black text-white rounded px-4 py-2" onClick={createEvent}>
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Drawer/Modal evento (ações) */}
      {activeEvent && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl w-full max-w-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="font-semibold">Detalhes</div>
              <button className="text-sm" onClick={() => setActiveEvent(null)}>✕</button>
            </div>

            <div className="text-sm space-y-1">
              <div><b>Data:</b> {activeEvent.dateBR}</div>
              <div><b>Tipo:</b> {activeEvent.type === "SHIFT" ? "Trabalho" : "Ausência"}</div>
              <div><b>Responsável:</b> {activeEvent.user.name}</div>
              <div>
                <b>Horário:</b>{" "}
                {activeEvent.type === "ABSENCE" && activeEvent.startMin === 0 && activeEvent.endMin === 1440
                  ? "Dia inteiro"
                  : `${activeEvent.startHHMM}–${activeEvent.endHHMM}`}
              </div>
              {activeEvent.note && <div><b>Obs.:</b> {activeEvent.note}</div>}
            </div>

            <div className="border-t pt-3 space-y-2">
              <div className="text-sm font-semibold">Trocar responsável</div>
              <div className="flex flex-wrap gap-2">
                {members
                  .filter((m) => m.id !== activeEvent.user.id)
                  .map((m) => (
                    <button
                      key={m.id}
                      className="border rounded px-3 py-2 text-sm hover:bg-slate-50"
                      onClick={() => swapEvent(activeEvent.id, m.id)}
                      title={`Trocar para ${m.name}`}
                    >
                      {m.name}
                    </button>
                  ))}
              </div>
            </div>

            <div className="flex gap-2 justify-end pt-2">
              <button
                className="border rounded px-4 py-2 hover:bg-slate-50"
                onClick={() => setActiveEvent(null)}
              >
                Fechar
              </button>
              <button
                className="bg-red-600 text-white rounded px-4 py-2"
                onClick={() => deleteEvent(activeEvent.id)}
              >
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DayList({
  iso,
  events,
  memberColor,
  onPick,
}: {
  iso: string;
  events: AgendaEvent[];
  memberColor: Map<string, string>;
  onPick: (ev: AgendaEvent) => void;
}) {
  return (
    <div className="space-y-2">
      {events.length === 0 && (
        <div className="text-sm text-slate-500">Sem registros para {brFromISO(iso)}.</div>
      )}

      {events.map((ev) => {
        const color = memberColor.get(ev.user.id) || "#111827";
        const bg = ev.type === "ABSENCE" ? "rgba(239,68,68,0.10)" : hexToRgba(color, 0.12);
        const bd = ev.type === "ABSENCE" ? "#EF4444" : color;

        return (
          <button
            key={ev.id}
            className="w-full text-left border rounded-xl p-3 hover:bg-slate-50"
            style={{ borderColor: bd, backgroundColor: bg }}
            onClick={() => onPick(ev)}
          >
            <div className="font-semibold text-sm">
              {ev.type === "ABSENCE" ? "Ausência" : "Trabalho"} • {ev.user.name}
            </div>
            <div className="text-sm text-slate-700">
              {ev.type === "ABSENCE" && ev.startMin === 0 && ev.endMin === 1440
                ? "Dia inteiro"
                : `${ev.startHHMM}–${ev.endHHMM}`}
            </div>
            {ev.note && <div className="text-xs text-slate-600 mt-1">{ev.note}</div>}
          </button>
        );
      })}
    </div>
  );
}

function WeekList({
  selectedISO,
  eventsByISO,
  memberColor,
  onPick,
  onJump,
}: {
  selectedISO: string;
  eventsByISO: Map<string, AgendaEvent[]>;
  memberColor: Map<string, string>;
  onPick: (ev: AgendaEvent) => void;
  onJump: (iso: string) => void;
}) {
  // domingo da semana do selectedISO
  const dt = new Date(`${selectedISO}T12:00:00.000Z`);
  const sunShift = dt.getUTCDay(); // 0..6 (dom..sab)
  dt.setUTCDate(dt.getUTCDate() - sunShift);

  const days = Array.from({ length: 7 }).map((_, i) => {
    const d = new Date(dt.getTime());
    d.setUTCDate(dt.getUTCDate() + i);
    const iso = d.toISOString().slice(0, 10);
    return iso;
  });

  return (
    <div className="grid md:grid-cols-2 gap-3">
      {days.map((iso) => {
        const list = eventsByISO.get(iso) || [];
        return (
          <div key={iso} className="border rounded-xl p-3">
            <button className="font-semibold hover:underline" onClick={() => onJump(iso)}>
              {brFromISO(iso)}
            </button>

            <div className="mt-2 space-y-2">
              {list.length === 0 && <div className="text-sm text-slate-500">Sem registros.</div>}
              {list.map((ev) => {
                const color = memberColor.get(ev.user.id) || "#111827";
                const bg = ev.type === "ABSENCE" ? "rgba(239,68,68,0.10)" : hexToRgba(color, 0.12);
                const bd = ev.type === "ABSENCE" ? "#EF4444" : color;

                const label =
                  ev.type === "ABSENCE"
                    ? `Ausência • ${ev.user.name}`
                    : `${ev.startHHMM}–${ev.endHHMM} • ${ev.user.name}`;

                return (
                  <button
                    key={ev.id}
                    className="w-full text-left border rounded-lg px-3 py-2 hover:bg-slate-50"
                    style={{ borderColor: bd, backgroundColor: bg }}
                    onClick={() => onPick(ev)}
                  >
                    <div className="text-sm font-semibold">{label}</div>
                    {ev.note && <div className="text-xs text-slate-600 mt-1">{ev.note}</div>}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
