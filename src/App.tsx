import React, { useEffect, useMemo, useState } from "react";
import { startLogin, exchangeCodeForToken } from "./auth/login";
import { makeApi, openChannelAndSubscribe } from "./genesys/realtime";

type QueueKpi = {
  waiting?: number;
  interacting?: number;
  alerting?: number;
  oldestWaitingMs?: number;
};

function parseQueueObservation(eventBody: any): QueueKpi {
  /**
   * Il payload degli eventi Genesys NON è sempre identico.
   * Qui facciamo un parsing “difensivo” per l’MVP.
   */
  const metrics =
    eventBody?.data?.[0]?.metrics ??
    eventBody?.metrics ??
    [];

  const out: QueueKpi = {};

  for (const m of metrics) {
    const name = m.metric ?? m.name;
    const value =
      m.stats?.count ??
      m.stats?.max ??
      m.value ??
      m.stats?.value;

    if (name === "oWaiting") out.waiting = Number(value);
    if (name === "oInteracting") out.interacting = Number(value);
    if (name === "oAlerting") out.alerting = Number(value);
    if (name === "oOldestWaiting") out.oldestWaitingMs = Number(value);
  }

  return out;
}

export default function App() {
  const [token, setToken] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("Not logged in");
  const [kpiByQueue, setKpiByQueue] = useState<Record<string, QueueKpi>>({});
  const [showAgents, setShowAgents] = useState(false);

  const queueIds = useMemo(() => {
    const raw = (import.meta as any).env.VITE_QUEUE_IDS as string;
    return (raw || "")
      .split(",")
      .map(q => q.trim())
      .filter(Boolean);
  }, []);

  /* === Gestione callback OAuth === */
  useEffect(() => {
    const url = new URL(window.location.href);
    const code = url.searchParams.get("code");

    if (!code) return;

    (async () => {
      try {
        setStatus("Exchanging OAuth code...");
        const tokenResponse = await exchangeCodeForToken(code);
        setToken(tokenResponse.access_token);
        setStatus("Logged in");

        // pulizia URL (toglie ?code=...)
        window.history.replaceState(
          {},
          document.title,
          window.location.pathname
        );
      } catch (err: any) {
        setStatus(`Auth error: ${err?.message ?? err}`);
      }
    })();
  }, []);

  /* === Connessione real-time === */
  useEffect(() => {
    if (!token || queueIds.length === 0) return;

    setStatus("Connecting to Genesys realtime...");
    const { notificationsApi } = makeApi(token);
    let ws: WebSocket | null = null;

    (async () => {
      try {
        const res = await openChannelAndSubscribe(
          notificationsApi,
          queueIds,
          (topic, body) => {
            // Queue observations
            const match = topic.match(
              /^v2\.analytics\.queues\.([^.]+)\.observations$/
            );

            if (match) {
              const queueId = match[1];
              const parsed = parseQueueObservation(body);

              setKpiByQueue(prev => ({
                ...prev,
                [queueId]: {
                  ...(prev[queueId] ?? {}),
                  ...parsed
                }
              }));
            }

            // membership agenti (per ora ignorata, usata quando showAgents=true)
          }
        );

        ws = res.ws;
        setStatus("Realtime connected");
      } catch (err: any) {
        setStatus(`Realtime error: ${err?.message ?? err}`);
      }
    })();

    return () => {
      try {
        ws?.close();
      } catch {}
    };
  }, [token, queueIds, showAgents]);

  return (
    <div>
      <h2>Genesys Queue Activity – Real Time</h2>

      <div className="card">
        <button onClick={startLogin} disabled={!!token}>
          Login
        </button>

        <label style={{ marginLeft: 16 }}>
          <input
            type="checkbox"
            checked={showAgents}
            onChange={(e) => setShowAgents(e.target.checked)}
          />
          {" "}Mostra agenti (WIP)
        </label>

        <p><small>{status}</small></p>
        <p>
          <small>
            Queues: {queueIds.join(", ") || "Nessuna"}
          </small>
        </p>
        <p>
    <small>
      Redirect URI: {(import.meta as any).env.VITE_GC_REDIRECT_URI}
    </small>
  </p>
      </div>

      {queueIds.map(queueId => {
        const kpi = kpiByQueue[queueId] ?? {};
        return (
          <div className="card" key={queueId}>
            <strong>Queue {queueId}</strong>

            <div className="row" style={{ marginTop: 8 }}>
              <div className="kpi">Waiting: <b>{kpi.waiting ?? "-"}</b></div>
              <div className="kpi">Interacting: <b>{kpi.interacting ?? "-"}</b></div>
              <div className="kpi">Alerting: <b>{kpi.alerting ?? "-"}</b></div>
              <div className="kpi">
                Oldest waiting (ms): <b>{kpi.oldestWaitingMs ?? "-"}</b>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
