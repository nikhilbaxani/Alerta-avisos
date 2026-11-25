// X07: parte de situación para el jefe de sala o el CECOP (MEMORIA §16.4).
import { describe, expect, it } from "vitest";
import { getScenario } from "@/data/scenarios";
import { ACTION_TOOLS } from "@/lib/actions";
import { runAgent } from "@/lib/agent";
import { PLACES } from "@/lib/map";
import { priorityBreakdown } from "@/lib/priority";
import { reportMarkdown, reportTime, situationReport } from "@/lib/report";
import { WAITING_ASSUMPTIONS } from "@/lib/waiting";

const dana = getScenario("dana-malaga");
const apagon = getScenario("apagon-malaga");

/** Cifras de MEMORIA §3 (pitch): no pueden aparecer en un parte calculado del estado. */
const MEMORIA_3 = ["19.821", "4.770", "10.000", "4.385", "3,7", "894.930", "197.351", "20.820", "12.872", "43.845", "362.822", "50 idiomas", "30 s"];

describe("parte de situación · DANA", async () => {
  const run = await runAgent(dana);
  const r = situationReport(run);
  const md = reportMarkdown(r);

  it("rotulado como simulación, en JSON y en Markdown", () => {
    expect(r.simulacion).toBe(true);
    expect(r.rotulo).toBe("SIMULACIÓN");
    expect(r.aviso).toMatch(/SIMULACIÓN/);
    expect(md).toMatch(/^# Parte de situación · SIMULACIÓN/);
    expect(md.match(/SIMULACIÓN/g)!.length).toBeGreaterThanOrEqual(3);
    expect(JSON.parse(JSON.stringify(r))).toEqual(r);
  });

  it("hora del escenario: el último hecho de la reproducción", () => {
    const last = Math.max(...run.steps.map((s) => s.t), ...run.actions.flatMap((a) => [a.proposedAt, a.approval?.at ?? 0, a.receipt?.at ?? 0]));
    expect(reportTime(run)).toBe(last);
    expect(r.hora).toEqual({ segundos: last, texto: "T+05:36" });
    expect(md).toContain("T+05:36");
  });

  it("llamadas → incidentes y líneas liberadas cuadran con el estado (como la consola: llamadas − incidentes)", () => {
    expect(r.llamadas).toBe(run.steps.length);
    expect(r.incidentes).toBe(run.incidents.length);
    expect(r.lineasLiberadas).toBe(run.steps.length - run.incidents.length);
    expect([r.llamadas, r.incidentes, r.lineasLiberadas]).toEqual([27, 7, 20]); // X13: 26 llamadas + la eCall EC1
    expect(r.decisionesZonaGris).toBe(2);
    expect(md).toContain("27 llamadas → 7 incidentes · 20 líneas liberadas");
  });

  it("incidentes por prioridad, con el motivo de priorityBreakdown en una línea", () => {
    expect(r.incidentesPorPrioridad).toHaveLength(run.incidents.length);
    const totals = r.incidentesPorPrioridad.map((i) => i.prioridad);
    expect([...totals].sort((a, b) => b - a)).toEqual(totals);
    for (const row of r.incidentesPorPrioridad) {
      const inc = run.incidents.find((i) => i.id === row.incidente)!;
      const b = priorityBreakdown(inc, r.hora.segundos);
      expect(row.prioridad).toBe(Math.round(b.total));
      expect(row.motivo).toBe(b.reasons.join(", "));
      expect(row.llamadas).toBe(inc.callIds.length);
      expect(PLACES.map((p) => p.name)).toContain(row.lugar);
      expect(md).toContain(`${row.incidente} · ${row.tipoTexto}`);
      expect(md).toContain(row.motivo);
    }
    // E1 (árabe, dolor torácico) aparece con su motivo; G lleva «información nueva» porque G4 llegó hace menos de 60 s.
    const e1 = r.incidentesPorPrioridad.find((i) => i.incidente === run.incidents.find((x) => x.callIds.includes("E1"))!.id)!;
    expect(e1.motivo).toMatch(/dolor torácico/);
    const g = r.incidentesPorPrioridad.find((i) => i.incidente === run.incidents.find((x) => x.callIds.includes("G1"))!.id)!;
    expect(g.motivo).toMatch(/información nueva/);
  });

  it("zonas: cada incidente en el lugar de referencia más cercano, de más a menos", () => {
    const counts = r.zonas.map((z) => z.incidentes.length);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(run.incidents.length);
    expect([...counts].sort((a, b) => b - a)).toEqual(counts);
    const camp = r.zonas.find((z) => z.lugar === "Campanillas")!;
    expect(camp.incidentes).toEqual([run.incidents.find((i) => i.callIds.includes("A1"))!.id, run.incidents.find((i) => i.callIds.includes("F1"))!.id]);
  });

  it("acciones por herramienta y estado: cuadran con el registro", () => {
    expect(r.acciones.porHerramienta.map((t) => t.herramienta)).toEqual([...ACTION_TOOLS]);
    for (const row of r.acciones.porHerramienta) {
      const mine = run.actions.filter((a) => a.tool === row.herramienta);
      expect(row.preparadas).toBe(mine.length);
      expect(row.pendientes).toBe(mine.filter((a) => a.status === "propuesta").length);
      expect(row.aprobadasSinEnviar).toBe(mine.filter((a) => a.status === "aprobada").length);
      expect(row.enviadas).toBe(mine.filter((a) => a.status === "enviada").length);
      expect(row.descartadas).toBe(mine.filter((a) => a.status === "descartada").length);
      expect(row.pendientes + row.aprobadasSinEnviar + row.enviadas + row.descartadas).toBe(row.preparadas);
      expect(row.automaticas).toBe(mine.filter((a) => a.approval?.by === "automatica").length);
      expect(row.aprobadasPorPersona).toBe(mine.filter((a) => a.approval !== null && a.approval.by !== "automatica").length);
    }
    expect(r.acciones.total.preparadas).toBe(run.actions.length);
    expect(r.acciones.total.pendientes).toBe(1);
    expect(r.acciones.aprobadasPorRol).toEqual({ operador: run.actions.filter((a) => a.approval?.by === "operador").length, coordinador: 0 });
  });

  it("las pendientes dicen qué decisión falta: el ES-Alert espera a un coordinador", () => {
    expect(r.acciones.pendientes).toHaveLength(1);
    const p = r.acciones.pendientes[0];
    expect(p).toMatchObject({ herramienta: "proponer_es_alert", falta: "coordinador", ambito: "zona", propuestaEn: 128 });
    expect(p.incidentes).toHaveLength(2);
    expect(md).toMatch(/ES-Alert.*Campanillas.*falta la aprobación de un \*\*coordinador\*\*/);
    expect(md).toMatch(/el operador no puede aprobarla/);
  });

  it("agente de espera con y sin agente, con sus supuestos", () => {
    const w = r.agenteDeEspera;
    expect(w.operadores).toBe(run.waiting.operators);
    expect(w.sinAgente.esperanSinQueNadieLesAtienda).toBe(run.waiting.sin.waitedAlone);
    expect(w.conAgente.esperanSinQueNadieLesAtienda).toBe(run.waiting.con.waitedAlone);
    expect(w.conAgente.atendidasPorElAsistente).toBe(run.waiting.con.attendedByAgent);
    expect(w.conAgente.escaladas).toBe(run.waiting.con.escalated);
    expect(w.conAgente.duplicadosResueltosSinOperador).toBe(run.waiting.con.resolvedWithoutOperator);
    expect(w.supuestos).toEqual([...WAITING_ASSUMPTIONS]);
    for (const s of WAITING_ASSUMPTIONS) expect(md).toContain(s);
    expect(md).toMatch(/Esperan sin que nadie les atienda \| 23 \| 0 \|/);
  });

  it("ninguna cifra de MEMORIA §3 ni nada de las transcripciones", () => {
    const text = `${md}\n${JSON.stringify(r)}`;
    for (const n of MEMORIA_3) expect(text).not.toContain(n);
    for (const c of dana.calls) {
      expect(text).not.toContain(c.transcript.slice(0, 40));
      expect(text).not.toContain(c.mock.summary_es.slice(0, 40));
      expect(text).not.toContain(c.mock.location_text);
    }
  });

  it("es determinista", async () => {
    expect(situationReport(await runAgent(dana))).toEqual(r);
  });
});

describe("parte de situación · con coordinador y apagón", () => {
  it("con --coordinador no queda nada pendiente y el ES-Alert cuenta como aprobado por el coordinador", async () => {
    const r = situationReport(await runAgent(dana, { coordinator: true }));
    expect(r.acciones.pendientes).toEqual([]);
    expect(r.acciones.aprobadasPorRol.coordinador).toBe(1);
    expect(reportMarkdown(r)).toMatch(/Ninguna/);
  });

  it("apagón: sin ES-Alert y con sus cifras", async () => {
    const run = await runAgent(apagon);
    const r = situationReport(run);
    expect(r.acciones.porHerramienta.find((t) => t.herramienta === "proponer_es_alert")!.preparadas).toBe(0);
    expect(r.lineasLiberadas).toBe(run.steps.length - run.incidents.length);
    expect(reportMarkdown(r)).toMatch(/SIMULACIÓN/);
  });
});
