import { useEffect, useMemo, useState } from "react";
import DashboardLayout from "../layout/DashboardLayout";
import { API_BASE, safeJson } from "../lib/api";

type Incident = {
  id: number;
  lineName: string;
  machineNumber: string;
  reportedByOperatorNumber: string;
  assignedToTechnicianNumber: string | null;
  openedAt: string;
  resolvedAt: string | null;
  quickObservations?: string[];
  logs?: any[];
  durations?: {
    totalDownMs: number | null;
    timeToStartMs: number | null;
    repairMs: number | null;
    waitingMs: number;
  };
};

function msToHuman(ms: number | null) {
  if (ms == null) return "—";
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d}d ${h % 24}h ${m % 60}m`;
  if (h > 0) return `${h}h ${m % 60}m`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}

function toCsv(rows: any[]) {
  const esc = (v: any) => `"${String(v ?? "").replaceAll(`"`, `""`)}"`;
  const headers = [
    "id","lineName","machineNumber","operator","technician","openedAt","resolvedAt",
    "totalDown","timeToStart","repair","waiting","observations"
  ];
  const lines = [headers.join(",")];

  for (const r of rows) {
    lines.push(
      headers.map((h) => {
        if (h === "operator") return esc(r.reportedByOperatorNumber);
        if (h === "technician") return esc(r.assignedToTechnicianNumber);
        if (h === "totalDown") return esc(msToHuman(r.durations?.totalDownMs ?? null));
        if (h === "timeToStart") return esc(msToHuman(r.durations?.timeToStartMs ?? null));
        if (h === "repair") return esc(msToHuman(r.durations?.repairMs ?? null));
        if (h === "waiting") return esc(msToHuman(r.durations?.waitingMs ?? 0));
        if (h === "observations") return esc((r.quickObservations ?? []).join("; "));
        return esc((r as any)[h]);
      }).join(",")
    );
  }
  return lines.join("\n");
}

export default function Historico() {
  const [items, setItems] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(false);

  const techToken = localStorage.getItem("techToken") ?? "";
  const adminToken = localStorage.getItem("adminToken") ?? "";

  const isAdmin = !!adminToken;
  const headerName = isAdmin ? "x-admin-token" : "x-tech-token";
  const token = isAdmin ? adminToken : techToken;

  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [line, setLine] = useState("");
  const [machine, setMachine] = useState("");
  const [tech, setTech] = useState("");

  async function load() {
    if (!token) { alert("Sem sessão. Faz login na Mecânica ou Admin."); return; }
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (from) qs.set("from", from);
      if (to) qs.set("to", to);
      if (line) qs.set("line", line);
      if (machine) qs.set("machine", machine);
      if (tech) qs.set("tech", tech);

      const res = await fetch(`${API_BASE}/history?${qs.toString()}`, { headers: { [headerName]: token } as any });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data?.error ?? "Erro");
      setItems(data.history ?? []);
    } catch (e: any) {
      alert(e?.message ?? "Erro");
    } finally { setLoading(false); }
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const sorted = useMemo(() => {
    return [...items].sort((a, b) => {
      const ra = a.resolvedAt ? new Date(a.resolvedAt).getTime() : 0;
      const rb = b.resolvedAt ? new Date(b.resolvedAt).getTime() : 0;
      return rb - ra;
    });
  }, [items]);

  function exportCsv() {
    const csv = toCsv(sorted);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `historico-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <DashboardLayout
      title="Histórico"
      right={
        <>
          <button className="btn" onClick={load} disabled={loading}>{loading ? "A carregar…" : "Aplicar filtros"}</button>
          <button className="btn btn-primary" onClick={exportCsv} disabled={!sorted.length}>Export CSV</button>
        </>
      }
    >
      <div className="card card-pad">
        <div className="h2">Filtros</div>

        <div className="grid grid-3" style={{ marginTop: 12 }}>
          <div>
            <div className="p" style={{ marginBottom: 6 }}>De</div>
            <input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <div className="p" style={{ marginBottom: 6 }}>Até</div>
            <input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div>
            <div className="p" style={{ marginBottom: 6 }}>Linha</div>
            <input className="input" value={line} onChange={(e) => setLine(e.target.value)} placeholder="Ex: Linha 1" />
          </div>
          <div>
            <div className="p" style={{ marginBottom: 6 }}>Máquina</div>
            <input className="input" value={machine} onChange={(e) => setMachine(e.target.value)} placeholder="Ex: 02" />
          </div>
          <div>
            <div className="p" style={{ marginBottom: 6 }}>Técnico</div>
            <input className="input" value={tech} onChange={(e) => setTech(e.target.value)} placeholder="Ex: 819" />
          </div>
          <div style={{ display: "flex", alignItems: "end", gap: 10 }}>
            <button className="btn" onClick={() => { setFrom(""); setTo(""); setLine(""); setMachine(""); setTech(""); }}>
              Limpar
            </button>
          </div>
        </div>

        <div className="p" style={{ marginTop: 10 }}>
          Total: <strong>{sorted.length}</strong>
        </div>
      </div>

      <div className="card card-pad" style={{ marginTop: 12 }}>
        <div className="h2">Registos</div>

        <div className="grid" style={{ marginTop: 12 }}>
          {sorted.map((i) => (
            <div key={i.id} className="card card-pad" style={{ boxShadow: "none" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontWeight: 950, fontSize: 18 }}>
                    {i.lineName} — Máquina {i.machineNumber}
                  </div>
                  <div className="p" style={{ marginTop: 6 }}>
                    Resolvida: <strong>{i.resolvedAt ? new Date(i.resolvedAt).toLocaleString() : "—"}</strong>
                  </div>
                  <div className="p" style={{ marginTop: 6 }}>
                    Operador: <strong>{i.reportedByOperatorNumber}</strong> • Técnico:{" "}
                    <strong>{i.assignedToTechnicianNumber ?? "—"}</strong>
                  </div>
                  {i.quickObservations?.length ? (
                    <div className="p" style={{ marginTop: 6 }}>Obs: <strong>{i.quickObservations.join(", ")}</strong></div>
                  ) : null}
                </div>

                <div className="card card-pad" style={{ boxShadow: "none", minWidth: 320, background: "#f7f9fa" }}>
                  <div style={{ fontWeight: 950 }}>Paragem</div>
                  <div className="p" style={{ marginTop: 8 }}>
                    Total: <strong>{msToHuman(i.durations?.totalDownMs ?? null)}</strong>
                  </div>
                  <div className="p" style={{ marginTop: 6 }}>
                    Até iniciar: <strong>{msToHuman(i.durations?.timeToStartMs ?? null)}</strong>
                  </div>
                  <div className="p" style={{ marginTop: 6 }}>
                    Intervenção: <strong>{msToHuman(i.durations?.repairMs ?? null)}</strong>
                  </div>
                  <div className="p" style={{ marginTop: 6 }}>
                    Espera: <strong>{msToHuman(i.durations?.waitingMs ?? 0)}</strong>
                  </div>
                </div>
              </div>

              <details style={{ marginTop: 12 }}>
                <summary style={{ cursor: "pointer", fontWeight: 900 }}>Logs (Detalhes)</summary>
                <div className="grid" style={{ marginTop: 10 }}>
                  {(i.logs ?? []).slice().reverse().map((l: any, idx: number) => (
                    <div key={idx} className="card card-pad" style={{ boxShadow: "none", background: "#f7f9fa" }}>
                      <div className="p" style={{ fontSize: 12 }}>
                        {l.at ? new Date(l.at).toLocaleString() : "—"} •{" "}
                        {l.actorType === "TECH" ? `Técnico ${l.actorId}` : l.actorType === "OPERATOR" ? `Operador ${l.actorId}` : "Sistema"}
                      </div>
                      <div style={{ fontWeight: 900, marginTop: 6 }}>{l.summary}</div>
                      {l.details?.status ? (
                        <div className="p" style={{ marginTop: 6 }}>
                          Estado: <strong>{l.details.status}</strong>
                        </div>
                      ) : null}
                      {l.details?.note ? (
                        <div className="p" style={{ marginTop: 6 }}>
                          Nota: <strong>{l.details.note}</strong>
                        </div>
                      ) : null}
                      {l.details?.partsUsed ? (
                        <div className="p" style={{ marginTop: 6 }}>
                          Peças: <strong>{l.details.partsUsed}</strong>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              </details>
            </div>
          ))}

          {!sorted.length && <div className="p">Ainda não há histórico a mostrar (ou filtros muito restritos).</div>}
        </div>
      </div>
    </DashboardLayout>
  );
}
