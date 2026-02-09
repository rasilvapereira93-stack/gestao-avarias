import { useEffect, useMemo, useRef, useState } from "react";
import DashboardLayout from "../layout/DashboardLayout";
import { API_BASE, safeJson } from "../lib/api";

type Incident = {
  id: number;
  team?: "MECHANICAL" | "ELECTRICAL";
  status: "OPEN" | "ASSIGNED" | "IN_PROGRESS" | "WAITING_PARTS" | "LONG_REPAIR" | "RESOLVED";
  lineName: string;
  machineNumber: string;
  reportedByOperatorNumber: string;
  quickObservations: string[];
  openedAt: string;
  assignedToTechnicianNumber: string | null;
  assignedAt: string | null;
  workStartedAt: string | null;
  resolvedAt: string | null;
  logs?: Array<{
    action: string;
    details?: { status?: string; note?: string };
  }>;
};

type Line = { id: string; name: string; active: boolean };
type Machine = { id: string; lineId: string; number: string; name: string; active: boolean };

type TechPublic = { id: string; number: string; name: string; active: boolean; team?: "MECHANICAL" | "ELECTRICAL" };

const T4TR_ICON_SRC = "/t4.png";
const GS_ICON_SRC = "/gs.png";

function hasT4trName(name?: string) {
  return String(name || "").toLowerCase().includes("t4tr");
}

function hasGs2000Name(name?: string) {
  const normalized = String(name || "").toLowerCase().replace(/\s+/g, "");
  return normalized.includes("gs-2000") || normalized.includes("gs2000");
}

function statusBadgeClass(s: Incident["status"]) {
  if (s === "OPEN") return "badge-open";
  if (s === "ASSIGNED") return "badge-assigned";
  if (s === "IN_PROGRESS") return "badge-progress";
  if (s === "WAITING_PARTS") return "badge-wait";
  if (s === "LONG_REPAIR") return "badge-long";
  return "badge-done";
}

function statusLabel(s: Incident["status"]) {
  switch (s) {
    case "OPEN": return "Aberta";
    case "ASSIGNED": return "Assumida";
    case "IN_PROGRESS": return "Em intervenção";
    case "WAITING_PARTS": return "A aguardar material";
    case "LONG_REPAIR": return "Reparação prolongada";
    case "RESOLVED": return "Resolvida";
  }
}

function ageFromIso(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const sec = Math.floor(ms / 1000);
  const min = Math.floor(sec / 60);
  const hr = Math.floor(min / 60);
  const day = Math.floor(hr / 24);
  if (day > 0) return `${day}d ${hr % 24}h`;
  if (hr > 0) return `${hr}h ${min % 60}m`;
  if (min > 0) return `${min}m`;
  return `${sec}s`;
}

function statusNoteForIncident(i: Incident, status: Incident["status"]) {
  if (!i.logs || !i.logs.length) return "";
  const last = [...i.logs]
    .reverse()
    .find((log) => log.action === "STATUS_CHANGED" && log.details?.status === status && log.details?.note);
  return last?.details?.note || "";
}

export default function Eletrica() {
  const team = "ELECTRICAL";
  const [techToken, setTechToken] = useState<string>(() => localStorage.getItem("techToken") ?? "");
  const [techNumber, setTechNumber] = useState<string>(() => localStorage.getItem("techNumber") ?? "");
  const [techName, setTechName] = useState<string>(() => localStorage.getItem("techName") ?? "");
  const [techTeam, setTechTeam] = useState<string>(() => localStorage.getItem("techTeam") ?? "");

  const [techs, setTechs] = useState<TechPublic[]>([]);
  const [loginBusy, setLoginBusy] = useState(false);

  const [lines, setLines] = useState<Line[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);

  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(false);

  const authed = techToken.trim().length > 0;

  const sseRef = useRef<EventSource | null>(null);

  useEffect(() => {
    (async () => {
      const res = await fetch(`${API_BASE}/config/technicians?team=${team}`);
      const data = await safeJson(res);
      const raw = (data.technicians ?? []) as TechPublic[];
      const filtered = raw.filter((t) => (t.team || "MECHANICAL") === team);
      setTechs(filtered);
    })().catch(() => {});
  }, []);

  useEffect(() => {
    (async () => {
      const l = await safeJson(await fetch(`${API_BASE}/config/lines`));
      const m = await safeJson(await fetch(`${API_BASE}/config/machines`));
      setLines((l.lines ?? []).filter((x: Line) => x.active !== false));
      setMachines((m.machines ?? []).filter((x: Machine) => x.active !== false));
    })().catch(() => {});
  }, []);

  useEffect(() => {
    if (!authed) return;

    loadNotResolved();

    if (!sseRef.current) {
      const es = new EventSource(`${API_BASE}/events`);
      sseRef.current = es;

      const onUpdate = () => loadNotResolved();
      es.addEventListener("incident_created", onUpdate);
      es.addEventListener("incident_updated", onUpdate);
      es.addEventListener("history_deleted", onUpdate);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed]);

  useEffect(() => {
    if (!authed || techTeam) return;
    (async () => {
      const res = await fetch(`${API_BASE}/tech/me`, { headers: { "x-tech-token": techToken } });
      const data = await safeJson(res);
      if (!res.ok) {
        alert(data?.error ?? "Sessão inválida. Faz login novamente.");
        doLogout();
        return;
      }
      const serverTeam = data?.tech?.team || team;
      setTechTeam(serverTeam);
      localStorage.setItem("techTeam", serverTeam);
    })().catch(() => {
      alert("Erro de ligação ao backend");
      doLogout();
    });
  }, [authed, techTeam, techToken]);

  async function loadNotResolved() {
    setLoading(true);
    try {
      const resAll = await fetch(`${API_BASE}/incidents`);
      const dataAll = await safeJson(resAll);
      const notResolved = (dataAll.incidents as Incident[])
        .filter((i) => i.status !== "RESOLVED")
        .filter((i) => (i.team || "MECHANICAL") === team);
      setIncidents(notResolved);
    } catch (e: any) {
      alert(e?.message ?? "Erro ao carregar");
    } finally {
      setLoading(false);
    }
  }

  async function doLogin(number: string, pin: string) {
    if (!number.trim()) return alert("Seleciona/introduz o número do técnico.");
    if (!/^[0-9]{4}$/.test(pin.trim())) return alert("PIN deve ter 4 dígitos.");

    setLoginBusy(true);
    try {
      const res = await fetch(`${API_BASE}/tech/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ number: number.trim(), pin: pin.trim(), team }),
      });
      const data = await safeJson(res);
      if (!res.ok) return alert(data?.error ?? "Erro no login");

      if (data.tech.team && data.tech.team !== team) {
        alert("Este técnico não tem acesso à Elétrica.");
        return;
      }
      setTechToken(data.token);
      setTechNumber(data.tech.number);
      setTechName(data.tech.name);
      setTechTeam(data.tech.team || team);

      localStorage.setItem("techToken", data.token);
      localStorage.setItem("techNumber", data.tech.number);
      localStorage.setItem("techName", data.tech.name);
      localStorage.setItem("techTeam", data.tech.team || team);
    } catch {
      alert("Erro de ligação ao backend");
    } finally {
      setLoginBusy(false);
    }
  }

  async function loginWithTech(t: TechPublic) {
    const tTeam = (t.team || "MECHANICAL").toUpperCase();
    if (tTeam !== team) {
      alert("Este técnico não tem acesso à Elétrica.");
      return;
    }
    const pin = prompt(`PIN do técnico ${t.number} — ${t.name}`) ?? "";
    if (!pin.trim()) return;
    await doLogin(t.number, pin);
  }

  async function doLogout() {
    try {
      await fetch(`${API_BASE}/tech/logout`, { method: "POST", headers: { "x-tech-token": techToken } });
    } catch {}
    localStorage.removeItem("techToken");
    localStorage.removeItem("techNumber");
    localStorage.removeItem("techName");
    localStorage.removeItem("techTeam");
    setTechToken("");
    setTechNumber("");
    setTechName("");
    setTechTeam("");
  }

  async function postTech(path: string, body?: any) {
    const res = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-tech-token": techToken },
      body: JSON.stringify(body ?? {}),
    });
    const data = await safeJson(res);
    if (!res.ok) {
      if (res.status === 401) {
        alert(data?.error ?? "Sessão inválida. Faz login novamente.");
        doLogout();
        throw new Error("Sessão inválida");
      }
      throw new Error(data?.error ?? "Erro");
    }
    return data;
  }

  const sorted = useMemo(() => {
    const rank = (s: Incident["status"]) => {
      switch (s) {
        case "OPEN": return 0;
        case "ASSIGNED": return 1;
        case "IN_PROGRESS": return 2;
        case "WAITING_PARTS": return 3;
        case "LONG_REPAIR": return 4;
        default: return 99;
      }
    };
    return [...incidents].sort((a, b) => {
      const ra = rank(a.status);
      const rb = rank(b.status);
      if (ra !== rb) return ra - rb;
      return new Date(a.openedAt).getTime() - new Date(b.openedAt).getTime();
    });
  }, [incidents]);

  const machineNameByKey = useMemo(() => {
    const lineIdByName = new Map(lines.map((l) => [l.name, l.id]));
    const map = new Map<string, string>();
    for (const m of machines) {
      const lineName = [...lineIdByName.entries()].find(([, id]) => id === m.lineId)?.[0];
      if (!lineName) continue;
      map.set(`${lineName}::${m.number}`, m.name || "");
    }
    return map;
  }, [lines, machines]);

  function isT4trIncident(line: string, machine: string) {
    const name = machineNameByKey.get(`${line}::${machine}`) || "";
    return hasT4trName(name);
  }

  function isGsIncident(line: string, machine: string) {
    const name = machineNameByKey.get(`${line}::${machine}`) || "";
    return hasGs2000Name(name);
  }

  async function startWork(id: number) { await postTech(`/incidents/${id}/start`); }
  async function setStatus(id: number, status: "WAITING_PARTS" | "LONG_REPAIR") {
    const note = prompt(status === "WAITING_PARTS" ? "Nota (ex.: material em falta)" : "Nota (ex.: avaria grave / previsão)") ?? "";
    await postTech(`/incidents/${id}/status`, { status, note: note.trim() });
  }
  async function resolve(id: number) {
    const note = prompt("Trabalho realizado (opcional)") ?? "";
    const partsUsed = prompt("Peças usadas (opcional)") ?? "";
    await postTech(`/incidents/${id}/resolve`, { note: note.trim(), partsUsed: partsUsed.trim() });
  }

  if (!authed) {
    return (
      <DashboardLayout title="Elétrica">
        <div className="card card-pad mecanica-login" style={{ maxWidth: 900 }}>
          <div className="h2">Selecionar técnico</div>
          <div className="grid grid-3" style={{ marginTop: 12 }}>
            {techs.map((t) => (
              <button
                key={t.id}
                className="btn"
                onClick={() => loginWithTech(t)}
                disabled={loginBusy || !t.active}
                type="button"
              >
                {t.number} — {t.name}
              </button>
            ))}
            {techs.length === 0 ? <div className="p">Sem técnicos ativos.</div> : null}
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (authed && !techTeam) {
    return (
      <DashboardLayout title="Elétrica">
        <div className="card card-pad" style={{ maxWidth: 720 }}>
          <div className="h2">A validar acesso…</div>
          <div className="p" style={{ marginTop: 8 }}>Aguarda um momento.</div>
        </div>
      </DashboardLayout>
    );
  }

  if (techTeam && techTeam !== team) {
    return (
      <DashboardLayout title="Elétrica">
        <div className="card card-pad" style={{ maxWidth: 720 }}>
          <div className="h2">Sem acesso</div>
          <div className="p" style={{ marginTop: 8 }}>
            Este técnico só pode aceder à página de {techTeam === "ELECTRICAL" ? "Elétrica" : "Mecânica"}.
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
            <button className="btn btn-danger" onClick={doLogout}>Sair</button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout
      title="Elétrica"
      subtitle={`Sessão: ${techNumber} — ${techName}`}
      right={
        <>
          <button className="btn" onClick={loadNotResolved} disabled={loading}>{loading ? "A carregar…" : "Atualizar"}</button>
          <button className="btn btn-danger" onClick={doLogout}>Sair</button>
        </>
      }
    >
      <div className="mecanica-page">
      <div className="grid grid-3 mecanica-stats">
        <div className="card card-pad mecanica-card">
          <div className="h2">Avarias não resolvidas</div>
          <div style={{ fontSize: 36, fontWeight: 950, marginTop: 6 }}>{sorted.length}</div>
        </div>
        <div className="card card-pad mecanica-card">
          <div className="h2">Em intervenção</div>
          <div style={{ fontSize: 36, fontWeight: 950, marginTop: 6 }}>
            {sorted.filter((x) => x.status === "IN_PROGRESS").length}
          </div>
        </div>
        <div className="card card-pad mecanica-card">
          <div className="h2">Aguardar material</div>
          <div style={{ fontSize: 36, fontWeight: 950, marginTop: 6 }}>
            {sorted.filter((x) => x.status === "WAITING_PARTS" || x.status === "LONG_REPAIR").length}
          </div>
        </div>
      </div>

      <div className="card card-pad mecanica-list" style={{ marginTop: 12 }}>
        <div className="h2">Ocorrências</div>

        <div className="grid" style={{ marginTop: 12 }}>
          {sorted.map((i) => (
            <div key={i.id} className="card card-pad mecanica-item" style={{ boxShadow: "none" }}>
              <div className="mecanica-item-header">
                <div style={{ minWidth: 260 }}>
                  <div style={{ fontWeight: 950, fontSize: 18, display: "flex", alignItems: "center", gap: 6 }}>
                    <span>{i.lineName} — Máquina {i.machineNumber}</span>
                    {isT4trIncident(i.lineName, i.machineNumber) ? (
                      <img
                        src={T4TR_ICON_SRC}
                        alt="T4TR"
                        title="T4TR"
                        style={{ width: 40, height: 40 }}
                        onError={(e) => { e.currentTarget.style.display = "none"; }}
                      />
                    ) : isGsIncident(i.lineName, i.machineNumber) ? (
                      <img
                        src={GS_ICON_SRC}
                        alt="GS-2000"
                        title="GS-2000"
                        style={{ width: 40, height: 40 }}
                        onError={(e) => { e.currentTarget.style.display = "none"; }}
                      />
                    ) : null}
                  </div>

                  <div style={{ marginTop: 8 }}>
                    <span className={`badge ${statusBadgeClass(i.status)}`}>
                      <span className="badge-dot" /> {statusLabel(i.status)}
                    </span>
                    <span className="badge" style={{ marginLeft: 8 }}>
                      <span className="badge-dot" /> Parada há: <strong>{ageFromIso(i.openedAt)}</strong>
                    </span>
                  </div>

                  <div className="p" style={{ marginTop: 8 }}>
                    Operador: <strong>{i.reportedByOperatorNumber}</strong> • Técnico: {" "}
                    <strong>{i.assignedToTechnicianNumber ?? "—"}</strong>
                  </div>

                  {i.quickObservations?.length ? (
                    <div className="p" style={{ marginTop: 8 }}>
                      Obs: <strong>{i.quickObservations.join(", ")}</strong>
                    </div>
                  ) : null}

                  {i.status === "WAITING_PARTS" ? (
                    <div className="p" style={{ marginTop: 8 }}>
                      Motivo: <strong>{statusNoteForIncident(i, "WAITING_PARTS") || "—"}</strong>
                    </div>
                  ) : null}
                </div>

                <div className="grid grid-2 mecanica-actions" style={{ minWidth: 260, alignContent: "start" }}>
                  <button className="btn" onClick={() => startWork(i.id)}>Iniciar</button>
                  <button className="btn" onClick={() => setStatus(i.id, "WAITING_PARTS")}>Aguardar material</button>
                  <button className="btn" onClick={() => setStatus(i.id, "LONG_REPAIR")}>Reparação longa</button>
                  <button className="btn btn-primary" onClick={() => resolve(i.id)} style={{ gridColumn: "1 / -1" }}>
                    Máquina pronta
                  </button>
                </div>
              </div>
            </div>
          ))}

          {sorted.length === 0 && <div className="p">Sem avarias elétricas por tratar.</div>}
        </div>
      </div>
      </div>
    </DashboardLayout>
  );
}
