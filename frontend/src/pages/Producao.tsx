import { useEffect, useMemo, useState } from "react";
import DashboardLayout from "../layout/DashboardLayout";
import { API_BASE, safeJson } from "../lib/api";

type Line = { id: string; name: string; active: boolean };
type Machine = { id: string; lineId: string; number: string; name: string; active: boolean };
type Incident = { lineName: string; machineNumber: string; status: string };

const T4TR_ICON_SRC = "/t4.png";
const GS_ICON_SRC = "/gs.png";

function hasT4trName(name?: string) {
  return String(name || "").toLowerCase().includes("t4tr");
}

function hasGs2000Name(name?: string) {
  const normalized = String(name || "").toLowerCase().replace(/\s+/g, "");
  return normalized.includes("gs-2000") || normalized.includes("gs2000");
}

export default function Producao() {
  const [lines, setLines] = useState<Line[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [openIncidents, setOpenIncidents] = useState<Incident[]>([]);

  const [lineName, setLineName] = useState("");
  const [machineNumber, setMachineNumber] = useState("");
  const [operatorNumber, setOperatorNumber] = useState("");

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [lockedLineId, setLockedLineId] = useState("");
  const [lockedLineName, setLockedLineName] = useState("");
  const [selectingTeam, setSelectingTeam] = useState(false);
  const [pendingMachine, setPendingMachine] = useState<Machine | null>(null);

  const isKiosk = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    const v = (params.get("kiosk") || "").toLowerCase();
    return v === "1" || v === "true";
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("lineId") || params.get("linhaId") || "";
    const name = params.get("line") || params.get("linha") || "";
    if (id || name) {
      setLockedLineId(id.trim());
      setLockedLineName(name.trim());
    }
  }, []);

  useEffect(() => {
    (async () => {
      const l = await safeJson(await fetch(`${API_BASE}/config/lines`));
      const m = await safeJson(await fetch(`${API_BASE}/config/machines`));
      setLines((l.lines ?? []).filter((x: Line) => x.active !== false));
      setMachines((m.machines ?? []).filter((x: Machine) => x.active !== false));
    })().catch((e) => {
      console.error(e);
      alert("Erro a carregar configuração (linhas/máquinas). Confirma o backend.");
    });
  }, []);

  useEffect(() => {
    if (!lockedLineId && !lockedLineName) return;
    const target = lockedLineId
      ? lines.find((l) => l.id === lockedLineId)
      : lines.find((l) => l.name === lockedLineName);

    if (target) {
      if (lineName !== target.name) setLineName(target.name);
    }
  }, [lines, lockedLineId, lockedLineName, lineName]);

  async function loadOpenIncidents() {
    try {
      const data = await safeJson(await fetch(`${API_BASE}/incidents`));
      const all = (data.incidents ?? []) as Incident[];
      setOpenIncidents(all.filter((i) => i.status !== "RESOLVED"));
    } catch {
      setOpenIncidents([]);
    }
  }

  useEffect(() => {
    loadOpenIncidents();
    const id = window.setInterval(() => {
      loadOpenIncidents();
    }, 10000);
    return () => window.clearInterval(id);
  }, []);

  const isLineLocked = !!(lockedLineId || lockedLineName);
  const kioskLineLabel = isLineLocked ? `Linha ${lineName || lockedLineName || lockedLineId}` : "";

  const machinesForLine = useMemo(() => {
    const line = lines.find((x) => x.name === lineName);
    if (!line) return [];
    const getPriority = (m: Machine) => {
      const name = (m.name || "").toLowerCase();
      if (name.includes("extrusao")) return 0;
      if (name.includes("embaladeira")) return 1;
      return 2;
    };
    const getNumeric = (value: string) => {
      const match = String(value || "").match(/\d+/);
      return match ? Number(match[0]) : Number.POSITIVE_INFINITY;
    };
    return machines
      .filter((m) => m.lineId === line.id)
      .slice()
      .sort((a, b) => {
        const pa = getPriority(a);
        const pb = getPriority(b);
        if (pa !== pb) return pa - pb;
        const na = getNumeric(a.number);
        const nb = getNumeric(b.number);
        if (na !== nb) return na - nb;
        return String(a.number).localeCompare(String(b.number), "pt-PT", { numeric: true, sensitivity: "base" });
      });
  }, [lines, machines, lineName]);

  const openMachinesForLine = useMemo(() => {
    if (!lineName) return new Set<string>();
    return new Set(
      openIncidents
        .filter((i) => i.lineName === lineName)
        .map((i) => String(i.machineNumber))
    );
  }, [openIncidents, lineName]);

  async function submitIncident(line: string, machine: string, operator: string, team: "MECHANICAL" | "ELECTRICAL") {
    if (!line) return alert("Seleciona a linha.");
    if (!machine) return alert("Seleciona a máquina.");
    if (!operator.trim()) return alert("Indica o nº do operador.");
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`${API_BASE}/incidents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lineName: line,
          machineNumber: machine,
          operatorNumber: operator.trim(),
          team,
        }),
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data?.error ?? "Erro");

      setMsg(data.message ? String(data.message) : "Avaria enviada para a manutenção.");
      setOperatorNumber("");
      await loadOpenIncidents();
    } catch (e: any) {
      alert(e?.message ?? "Erro");
    } finally {
      setBusy(false);
    }
  }

  async function confirmTeam(team: "MECHANICAL" | "ELECTRICAL") {
    const machine = pendingMachine;
    setSelectingTeam(false);
    setPendingMachine(null);
    if (!machine) return;
    const op = prompt("Número do operador:", operatorNumber || "") ?? "";
    if (!op.trim()) return;
    setOperatorNumber(op.trim());
    await submitIncident(lineName, machine.number, op.trim(), team);
  }

  return (
    <DashboardLayout title="Produção" kioskSubtitle={kioskLineLabel}>
      {isKiosk && selectingTeam ? (
        <div className="kiosk-modal-backdrop" onClick={() => { setSelectingTeam(false); setPendingMachine(null); }}>
          <div className="kiosk-modal" onClick={(e) => e.stopPropagation()}>
            <div className="h2">Selecionar tipo de avaria</div>
            {pendingMachine ? (
              <div className="p" style={{ marginTop: 6 }}>
                Máquina: <strong>{pendingMachine.number}</strong>
              </div>
            ) : null}
            <div className="kiosk-modal-actions" style={{ marginTop: 12 }}>
              <button className="btn" onClick={() => confirmTeam("MECHANICAL")} disabled={busy}>Avaria mecanica</button>
              <button className="btn" onClick={() => confirmTeam("ELECTRICAL")} disabled={busy}>Avaria eletrica</button>
            </div>
          </div>
        </div>
      ) : null}

      <div className={`grid ${isLineLocked ? "grid-2" : "grid-3"}`}>
        {!isLineLocked ? (
          <div className="card card-pad">
            <div className="h2">Selecionar linha</div>

            <div className="grid grid-2" style={{ marginTop: 12 }}>
              {lines.map((l) => {
                const active = lineName === l.name;
                return (
                  <button
                    key={l.id}
                    className={`btn ${active ? "btn-primary" : ""}`}
                    onClick={() => {
                      setLineName(l.name);
                      setMachineNumber("");
                    }}
                    type="button"
                  >
                    {l.name}
                  </button>
                );
              })}
              {lines.length === 0 && <div className="p">Sem linhas ativas.</div>}
            </div>
          </div>
        ) : null}

        <div className="card card-pad">
          <div className="h2 kiosk-hide">Selecionar máquina</div>


          <div className="grid grid-2" style={{ marginTop: isKiosk ? -4 : 12 }}>
            {!lineName && <div className="p">Escolhe a linha primeiro.</div>}
            {lineName && machinesForLine.length === 0 && <div className="p">Sem máquinas ativas.</div>}
            {lineName && machinesForLine.map((m) => {
              const isOpen = openMachinesForLine.has(String(m.number));
              const active = machineNumber === m.number;
              return (
                <button
                  key={m.id}
                  className={`btn ${active ? "btn-primary" : ""}`}
                  onClick={async () => {
                    setMachineNumber(m.number);
                    if (isKiosk) {
                      setPendingMachine(m);
                      setSelectingTeam(true);
                      return;
                    }
                    const isElectrical = window.confirm("Avaria elétrica?\nOK = Elétrica | Cancelar = Mecânica");
                    const team = isElectrical ? "ELECTRICAL" : "MECHANICAL";
                    const op = prompt("Número do operador:", operatorNumber || "") ?? "";
                    if (!op.trim()) return;
                    setOperatorNumber(op.trim());
                    await submitIncident(lineName, m.number, op.trim(), team);
                  }}
                  disabled={isOpen}
                  type="button"
                >
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                    {hasT4trName(m.name) ? (
                      <img
                        src={T4TR_ICON_SRC}
                        alt="T4TR"
                        title="T4TR"
                        style={{ width: 40, height: 40 }}
                        onError={(e) => { e.currentTarget.style.display = "none"; }}
                      />
                    ) : hasGs2000Name(m.name) ? (
                      <img
                        src={GS_ICON_SRC}
                        alt="GS-2000"
                        title="GS-2000"
                        style={{ width: 40, height: 40 }}
                        onError={(e) => { e.currentTarget.style.display = "none"; }}
                      />
                    ) : (
                      <div>{m.name || "(sem nome)"}</div>
                    )}
                    <div style={{ fontWeight: 800 }}>{m.number}</div>
                    {isOpen ? <div style={{ fontSize: 12 }}>(Avaria aberta)</div> : null}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {msg && <div className="p kiosk-hide" style={{ marginTop: 10 }}>{msg}</div>}
    </DashboardLayout>
  );
}
