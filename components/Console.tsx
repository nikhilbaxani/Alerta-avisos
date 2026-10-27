"use client";

import { useCallback, useEffect, useState } from "react";
import { useConsole } from "@/lib/useConsole";
import type { EngineStatus, Speed } from "@/lib/useConsole";
import CallQueue from "./CallQueue";
import DecisionBanner from "./DecisionBanner";
import IncidentDetail from "./IncidentDetail";
import MapView from "./MapView";
import PriorityList from "./PriorityList";
import TopBar from "./TopBar";

export default function Console() {
  const { s, dispatch, fxDone } = useConsole();
  const [status, setStatus] = useState<EngineStatus>({ mode: "simulated", label: "Modo simulado" });
  const [sttUp, setSttUp] = useState(false);

  useEffect(() => {
    fetch("/api/status")
      .then((r) => r.json())
      .then((d) => {
        setStatus({ mode: d.mode, label: d.label });
        setSttUp(!!d.stt?.up);
      })
      .catch(() => undefined);
  }, []);

  const select = useCallback((id: string) => dispatch({ type: "select", incidentId: id }), [dispatch]);
  const decide = useCallback((incidentId: string, same: boolean) => dispatch({ type: "decide", incidentId, same }), [dispatch]);
  const pending = s.engine.incidents.filter((i) => i.provisional).length;

  return (
    <div className="console">
      <TopBar
        s={s}
        status={status}
        pending={pending}
        onPlay={() => dispatch({ type: "play" })}
        onPause={() => dispatch({ type: "pause" })}
        onSpeed={(speed: Speed) => dispatch({ type: "speed", speed })}
        onReset={() => dispatch({ type: "reset" })}
      />
      <main className="main">
        <CallQueue s={s} sttUp={sttUp} onSelect={select} onLive={(call, result) => dispatch({ type: "live", call, result })} />
        <section className="center" aria-label="Mapa e incidentes">
          <div className="map-wrap"><MapView s={s} onSelect={select} onFxDone={fxDone} /></div>
          <div>
            <DecisionBanner s={s} onDecide={decide} />
            <div className="legend" aria-hidden="true">
              <span><i style={{ background: "rgba(198,31,43,.3)", borderColor: "var(--red)" }} />Riesgo vital</span>
              <span><i style={{ background: "rgba(21,34,46,.2)" }} />Incidente</span>
              <span><i style={{ background: "rgba(242,169,0,.4)", borderColor: "var(--amber)", borderStyle: "dashed" }} />Por decidir</span>
              <span>Los puntos son llamadas con su posición AML</span>
            </div>
          </div>
        </section>
        <section className="col" aria-label="Prioridad e incidente">
          <PriorityList s={s} onSelect={select} />
          <IncidentDetail
            s={s}
            localAI={status.mode === "local"}
            onSplit={(callId) => dispatch({ type: "split", callId })}
            onReply={(reply) => dispatch({ type: "reply", reply })}
          />
        </section>
      </main>
    </div>
  );
}
