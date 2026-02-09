import { useEffect, useMemo, useState } from "react";
import DashboardLayout from "../layout/DashboardLayout";
import { API_BASE, safeJson } from "../lib/api";

type Line = { id: string; name: string; active: boolean };
type Machine = { id: string; lineId: string; number: string; name: string; active: boolean };
type Tech = { id: string; number: string; name: string; active: boolean; hasPin: boolean; team?: string };

export default function Admin() {
  const [token, setToken] = useState<string>(() => localStorage.getItem("adminToken") ?? "");
  const [pin, setPin] = useState("");

  const [lines, setLines] = useState<Line[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [techs, setTechs] = useState<Tech[]>([]);

  const [newLineName, setNewLineName] = useState("");
  const [newMachineLineId, setNewMachineLineId] = useState("");
  const [newMachineNumber, setNewMachineNumber] = useState("");
  const [newMachineName, setNewMachineName] = useState("");
  const [multiMachineLineId, setMultiMachineLineId] = useState("");
  const [multiMachineText, setMultiMachineText] = useState("");
  const [machineListLineId, setMachineListLineId] = useState("");
  const [newTechNumber, setNewTechNumber] = useState("");
  const [newTechName, setNewTechName] = useState("");
  const [newTechPin, setNewTechPin] = useState("");
  const [newTechTeam, setNewTechTeam] = useState("MECHANICAL");
  const [tabletLineId, setTabletLineId] = useState("");

  const [editLineId, setEditLineId] = useState<string>("");
  const [editLineName, setEditLineName] = useState("");

  const [editMachineId, setEditMachineId] = useState<string>("");
  const [editMachineLineId, setEditMachineLineId] = useState("");
  const [editMachineNumber, setEditMachineNumber] = useState("");
  const [editMachineName, setEditMachineName] = useState("");


  const [editTechId, setEditTechId] = useState<string>("");
  const [editTechNumber, setEditTechNumber] = useState("");
  const [editTechName, setEditTechName] = useState("");
  const [editTechTeam, setEditTechTeam] = useState("MECHANICAL");

  const authed = token.trim().length > 0;
  const tabletUrl = tabletLineId ? `${window.location.origin}/producao?lineId=${tabletLineId}` : "";
  const kioskUrl = tabletLineId ? `${tabletUrl}&kiosk=1` : "";

  const parsedMultiMachines = useMemo(() => {
    return multiMachineText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const m = line.match(/^\s*([^,;\-]+)\s*[,;\-]\s*(.*)$/);
        if (m) {
          return { number: m[1].trim(), name: m[2].trim() };
        }
        return { number: line.trim(), name: "" };
      })
      .filter((x) => x.number);
  }, [multiMachineText]);

  const filteredMachines = useMemo(() => {
    if (!machineListLineId) return [] as Machine[];
    return machines.filter((m) => m.lineId === machineListLineId);
  }, [machines, machineListLineId]);

  async function apiGet(path: string) {
    const res = await fetch(`${API_BASE}${path}`, { headers: { "x-admin-token": token } });
    const data = await safeJson(res);
    if (!res.ok) throw new Error(data?.error ?? "Erro");
    return data;
  }
  async function apiPost(path: string, body?: any) {
    const res = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-token": token },
      body: JSON.stringify(body ?? {}),
    });
    const data = await safeJson(res);
    if (!res.ok) throw new Error(data?.error ?? "Erro");
    return data;
  }
  async function apiDelete(path: string) {
    const res = await fetch(`${API_BASE}${path}`, { method: "DELETE", headers: { "x-admin-token": token } });
    const data = await safeJson(res);
    if (!res.ok) throw new Error(data?.error ?? "Erro");
    return data;
  }

  async function loadAll() {
    if (!authed) return;
    try {
      const [l, m, t] = await Promise.all([
        apiGet("/admin/lines"),
        apiGet("/admin/machines"),
        apiGet("/admin/technicians"),
      ]);
      setLines(l.lines);
      setMachines(m.machines);
      setTechs(t.technicians);
    } catch (e: any) {
      alert(e?.message ?? "Erro");
      localStorage.removeItem("adminToken");
      setToken("");
    }
  }

  useEffect(() => { loadAll(); /* eslint-disable-next-line */ }, [authed]);

  async function doLogin() {
    try {
      const res = await fetch(`${API_BASE}/admin/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      const data = await safeJson(res);
      if (!res.ok) return alert(data?.error ?? "Erro no login");
      localStorage.setItem("adminToken", data.token);
      setToken(data.token);
      setPin("");
    } catch { alert("Erro de ligação ao backend"); }
  }
  async function doLogout() {
    try { await apiPost("/admin/logout"); } catch {}
    localStorage.removeItem("adminToken");
    setToken("");
  }

  async function downloadBackup() {
    const res = await fetch(`${API_BASE}/admin/backup`, { headers: { "x-admin-token": token } });
    if (!res.ok) {
      const err = await safeJson(res).catch(() => ({}));
      alert((err as any)?.error ?? "Erro no backup");
      return;
    }
    const text = await res.text();
    const blob = new Blob([text], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function deleteHistory(scope: "resolved" | "all") {
    const word = prompt(`Confirma apagamento (${scope}). Escreve APAGAR:`) ?? "";
    if (word.trim().toUpperCase() !== "APAGAR") return alert("Cancelado.");
    await apiDelete(`/admin/history?scope=${scope}`);
    alert("Histórico apagado.");
  }

  if (!authed) {
    return (
      <DashboardLayout title="Admin">
        <div className="card card-pad" style={{ maxWidth: 720 }}>
          <div className="p" style={{ marginBottom: 6 }}>PIN</div>
          <input className="input" value={pin} onChange={(e) => setPin(e.target.value)} inputMode="numeric" placeholder="Ex: 1234" />
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
            <button className="btn btn-primary" onClick={doLogin}>Entrar</button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout
      title="Configurações"
      right={
        <>
          <button className="btn" onClick={loadAll}>Atualizar</button>
          <button className="btn btn-danger" onClick={doLogout}>Sair</button>
        </>
      }
    >
      <div className="admin-page">
      <div className="card card-pad admin-section admin-tablet" style={{ marginBottom: 12 }}>
        <div className="h2">Modo Tablet (Produção)</div>
        <div className="grid grid-2 admin-tablet-grid" style={{ marginTop: 12 }}>
          <select className="select" value={tabletLineId} onChange={(e) => setTabletLineId(e.target.value)}>
            <option value="">Selecionar linha</option>
            {lines.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
          <input
            className="input"
            readOnly
            value={tabletUrl}
            placeholder="URL para usar no tablet"
          />
        </div>
        <div className="admin-tablet-actions" style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
          <button
            className="btn"
            disabled={!tabletLineId}
            onClick={async () => {
              if (!tabletLineId) return;
              const url = tabletUrl;
              try {
                await navigator.clipboard.writeText(url);
                alert("URL copiado.");
              } catch {
                alert(url);
              }
            }}
          >
            Copiar URL
          </button>
          <button
            className="btn"
            disabled={!tabletLineId}
            onClick={async () => {
              if (!tabletLineId) return;
              const url = kioskUrl;
              try {
                await navigator.clipboard.writeText(url);
                alert("URL kiosk copiado.");
              } catch {
                alert(url);
              }
            }}
          >
            Copiar URL Kiosk
          </button>
          <a
            className={`btn ${tabletLineId ? "" : "btn-disabled"}`}
            href={tabletLineId ? tabletUrl : undefined}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => { if (!tabletLineId) e.preventDefault(); }}
          >
            Abrir
          </a>
          <a
            className={`btn ${tabletLineId ? "" : "btn-disabled"}`}
            href={tabletLineId ? kioskUrl : undefined}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => { if (!tabletLineId) e.preventDefault(); }}
          >
            Abrir Kiosk
          </a>
        </div>
      </div>

      <div className="grid grid-3 admin-section admin-tools">
        <div className="card card-pad">
          <div className="h2">Backup</div>
          <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={downloadBackup}>Download</button>
        </div>
        <div className="card card-pad">
          <div className="h2">Apagar Histórico</div>
          <button className="btn" style={{ marginTop: 12 }} onClick={() => deleteHistory("resolved")}>Apagar resolvidas</button>
        </div>
        <div className="card card-pad">
          <div className="h2">Apagar Tudo</div>
          <button className="btn btn-danger" style={{ marginTop: 12 }} onClick={() => deleteHistory("all")}>Apagar tudo</button>
        </div>
      </div>

      <div className="hr" />

      <div className="card card-pad admin-section">
        <div className="h2">Linhas</div>
        <div className="grid grid-2" style={{ marginTop: 12 }}>
          <input className="input" value={newLineName} onChange={(e) => setNewLineName(e.target.value)} placeholder="Nome (ex: Linha 3)" />
          <button className="btn btn-primary" onClick={async () => {
            try { await apiPost("/admin/lines", { name: newLineName.trim() }); setNewLineName(""); await loadAll(); }
            catch (e: any) { alert(e?.message ?? "Erro"); }
          }}>Adicionar</button>
        </div>

        <div className="admin-lines" style={{ marginTop: 12 }}>
          {lines.map((l) => (
            <div key={l.id} className="card card-pad admin-line-card" style={{ boxShadow: "none" }}>
              <div className="admin-line-header">
                <div>
                  <div className="admin-line-title">{l.name} <span className="p">({l.id})</span></div>
                  <div className="admin-line-meta">Estado: <strong>{l.active ? "Ativa" : "Desativada"}</strong></div>
                </div>
                <div className="admin-line-actions">
                  <button className="btn btn-edit" onClick={() => {
                    setEditLineId(l.id);
                    setEditLineName(l.name);
                  }}>Editar</button>
                  <button className="btn btn-toggle" onClick={async () => { await apiPost(`/admin/lines/${l.id}/toggle`); await loadAll(); }}>
                    {l.active ? "Desativar" : "Ativar"}
                  </button>
                  <button className="btn btn-danger" onClick={async () => {
                    if (!confirm(`Apagar a linha "${l.name}"? (apaga máquinas desta linha)`)) return;
                    await apiDelete(`/admin/lines/${l.id}`); await loadAll();
                  }}>Apagar</button>
                </div>
              </div>

              {editLineId === l.id ? (
                <div className="card card-pad" style={{ marginTop: 12, background: "#f7f9fa", boxShadow: "none" }}>
                  <div className="p" style={{ marginBottom: 6 }}>Editar linha</div>
                  <div className="grid grid-2">
                    <input className="input" value={editLineName} onChange={(e) => setEditLineName(e.target.value)} placeholder="Nome da linha" />
                    <div style={{ display: "flex", gap: 10 }}>
                      <button className="btn btn-primary" onClick={async () => {
                        try {
                          await apiPost(`/admin/lines/${l.id}/edit`, { name: editLineName.trim() });
                          setEditLineId("");
                          setEditLineName("");
                          await loadAll();
                        } catch (e: any) { alert(e?.message ?? "Erro"); }
                      }}>Guardar</button>
                      <button className="btn" onClick={() => { setEditLineId(""); setEditLineName(""); }}>Cancelar</button>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </div>

      <div className="hr" />

      <div className="card card-pad admin-section">
        <div className="h2">Máquinas</div>
        <div className="grid grid-3" style={{ marginTop: 12 }}>
          <select className="select" value={newMachineLineId} onChange={(e) => setNewMachineLineId(e.target.value)}>
            <option value="">Selecionar linha</option>
            {lines.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          <input className="input" value={newMachineNumber} onChange={(e) => setNewMachineNumber(e.target.value)} placeholder="Nº (ex: 12 ou E1)" />
          <input className="input" value={newMachineName} onChange={(e) => setNewMachineName(e.target.value)} placeholder="Nome (ex: Torno / Embaladeira)" />
          <button className="btn btn-primary" onClick={async () => {
            try {
              await apiPost("/admin/machines", { lineId: newMachineLineId, number: newMachineNumber.trim(), name: newMachineName.trim() });
              setNewMachineLineId(""); setNewMachineNumber(""); setNewMachineName("");
              await loadAll();
            } catch (e: any) { alert(e?.message ?? "Erro"); }
          }}>Adicionar</button>
        </div>

        <div className="grid grid-2" style={{ marginTop: 12 }}>
          <select className="select" value={machineListLineId} onChange={(e) => setMachineListLineId(e.target.value)}>
            <option value="">Selecionar linha para ver maquinas</option>
            {lines.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          <button className="btn" onClick={() => setMachineListLineId("")} disabled={!machineListLineId}>Limpar filtro</button>
        </div>

        <div className="card card-pad" style={{ marginTop: 12, background: "#f7f9fa", boxShadow: "none" }}>
          <div className="h2">Adicionar varias maquinas</div>
          <div className="grid grid-2" style={{ marginTop: 12 }}>
            <select className="select" value={multiMachineLineId} onChange={(e) => setMultiMachineLineId(e.target.value)}>
              <option value="">Selecionar linha</option>
              {lines.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
            <button className="btn" onClick={() => setMultiMachineText("")} disabled={!multiMachineText}>Limpar</button>
          </div>

          <textarea
            className="input"
            style={{ marginTop: 10, minHeight: 120 }}
            placeholder="Uma maquina por linha. Ex: 01 - Embaladeira"
            value={multiMachineText}
            onChange={(e) => setMultiMachineText(e.target.value)}
          />

          <div className="p" style={{ marginTop: 8 }}>
            {parsedMultiMachines.length} linhas detetadas.
          </div>

          <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
            <button
              className="btn btn-primary"
              disabled={!multiMachineLineId || parsedMultiMachines.length === 0}
              onClick={async () => {
                try {
                  if (!multiMachineLineId) return alert("Seleciona a linha.");
                  for (const m of parsedMultiMachines) {
                    await apiPost("/admin/machines", {
                      lineId: multiMachineLineId,
                      number: m.number,
                      name: m.name,
                    });
                  }
                  setMultiMachineText("");
                  await loadAll();
                  alert("Maquinas adicionadas.");
                } catch (e: any) { alert(e?.message ?? "Erro"); }
              }}
            >
              Adicionar varias
            </button>
          </div>
        </div>

        <div className="grid" style={{ marginTop: 12 }}>
          {!machineListLineId ? (
            <div className="p">Seleciona a linha para ver as maquinas.</div>
          ) : null}
          {machineListLineId && filteredMachines.length === 0 ? (
            <div className="p">Sem maquinas nesta linha.</div>
          ) : null}
          {filteredMachines.map((m) => (
            <div key={m.id} className="card card-pad" style={{ boxShadow: "none" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontWeight: 900 }}>{m.number} — {m.name || "(sem nome)"}</div>
                  <div className="p" style={{ marginTop: 6 }}>Linha: <strong>{m.lineId}</strong> • Estado: <strong>{m.active ? "Ativa" : "Desativada"}</strong></div>
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  <button className="btn btn-edit" onClick={() => {
                    setEditMachineId(m.id);
                    setEditMachineLineId(m.lineId);
                    setEditMachineNumber(m.number);
                    setEditMachineName(m.name || "");
                  }}>Editar</button>
                  <button className="btn btn-toggle" onClick={async () => { await apiPost(`/admin/machines/${m.id}/toggle`); await loadAll(); }}>
                    {m.active ? "Desativar" : "Ativar"}
                  </button>
                  <button className="btn btn-danger" onClick={async () => {
                    if (!confirm(`Apagar a máquina "${m.number} — ${m.name}"?`)) return;
                    await apiDelete(`/admin/machines/${m.id}`); await loadAll();
                  }}>Apagar</button>
                </div>
              </div>

              {editMachineId === m.id ? (
                <div className="card card-pad" style={{ marginTop: 12, background: "#f7f9fa", boxShadow: "none" }}>
                  <div className="p" style={{ marginBottom: 6 }}>Editar máquina</div>
                  <div className="grid grid-3">
                    <select className="select" value={editMachineLineId} onChange={(e) => setEditMachineLineId(e.target.value)}>
                      <option value="">Selecionar linha</option>
                      {lines.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                    </select>
                    <input className="input" value={editMachineNumber} onChange={(e) => setEditMachineNumber(e.target.value)} placeholder="Número" />
                    <input className="input" value={editMachineName} onChange={(e) => setEditMachineName(e.target.value)} placeholder="Nome" />
                  </div>
                  <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
                    <button className="btn btn-primary" onClick={async () => {
                      try {
                        await apiPost(`/admin/machines/${m.id}/edit`, {
                          lineId: editMachineLineId,
                          number: editMachineNumber.trim(),
                          name: editMachineName.trim(),
                        });
                        setEditMachineId("");
                        setEditMachineLineId("");
                        setEditMachineNumber("");
                        setEditMachineName("");
                        await loadAll();
                      } catch (e: any) { alert(e?.message ?? "Erro"); }
                    }}>Guardar</button>
                    <button className="btn" onClick={() => {
                      setEditMachineId("");
                      setEditMachineLineId("");
                      setEditMachineNumber("");
                      setEditMachineName("");
                    }}>Cancelar</button>
                  </div>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </div>

      <div className="hr" />

      <div className="card card-pad admin-section">
        <div className="h2">Técnicos (Mecânica)</div>
        <div className="grid grid-3" style={{ marginTop: 12 }}>
          <input className="input" value={newTechNumber} onChange={(e) => setNewTechNumber(e.target.value)} placeholder="Nº técnico" inputMode="numeric" />
          <input className="input" value={newTechName} onChange={(e) => setNewTechName(e.target.value)} placeholder="Nome (opcional)" />
          <input className="input" value={newTechPin} onChange={(e) => setNewTechPin(e.target.value)} placeholder="PIN (4 dígitos)" inputMode="numeric" maxLength={4} />
          <select className="select" value={newTechTeam} onChange={(e) => setNewTechTeam(e.target.value)}>
            <option value="MECHANICAL">Mecânica</option>
            <option value="ELECTRICAL">Elétrica</option>
          </select>
          <button className="btn btn-primary" onClick={async () => {
            await apiPost("/admin/technicians", {
              number: newTechNumber.trim(),
              name: newTechName.trim(),
              pin: newTechPin.trim(),
              team: newTechTeam,
            });
            setNewTechNumber(""); setNewTechName(""); setNewTechPin(""); setNewTechTeam("MECHANICAL");
            await loadAll();
          }}>Adicionar</button>
        </div>

        <div className="admin-techs" style={{ marginTop: 12 }}>
          {techs.map((t) => (
            <div key={t.id} className="card card-pad admin-tech-card" style={{ boxShadow: "none" }}>
              <div className="admin-tech-header">
                <div>
                  <div className="admin-tech-title">{t.number} — {t.name}</div>
                  <div className="admin-tech-meta">
                    Estado: <strong>{t.active ? "Ativo" : "Desativado"}</strong> • PIN: <strong>{t.hasPin ? "Definido" : "Não"}</strong> • Equipa: <strong>{t.team === "ELECTRICAL" ? "Elétrica" : "Mecânica"}</strong>
                  </div>
                </div>
                <div className="admin-tech-actions">
                  <button className="btn btn-edit" onClick={() => {
                    setEditTechId(t.id);
                    setEditTechNumber(t.number);
                    setEditTechName(t.name);
                    setEditTechTeam(t.team === "ELECTRICAL" ? "ELECTRICAL" : "MECHANICAL");
                  }}>Editar</button>
                  <button className="btn btn-toggle" onClick={async () => { await apiPost(`/admin/technicians/${t.id}/toggle`); await loadAll(); }}>
                    {t.active ? "Desativar" : "Ativar"}
                  </button>
                  <button className="btn" onClick={async () => {
                    const p = prompt("Novo PIN (4 dígitos):") ?? "";
                    if (!/^[0-9]{4}$/.test(p.trim())) return alert("PIN inválido.");
                    await apiPost(`/admin/technicians/${t.id}/reset-pin`, { pin: p.trim() });
                    alert("PIN atualizado.");
                    await loadAll();
                  }}>Reset PIN</button>
                  <button className="btn btn-danger" onClick={async () => {
                    if (!confirm(`Apagar o técnico "${t.number} — ${t.name}"?`)) return;
                    await apiDelete(`/admin/technicians/${t.id}`);
                    await loadAll();
                  }}>Apagar</button>
                </div>
              </div>

              {editTechId === t.id ? (
                <div className="card card-pad" style={{ marginTop: 12, background: "#f7f9fa", boxShadow: "none" }}>
                  <div className="p" style={{ marginBottom: 6 }}>Editar técnico</div>
                  <div className="grid grid-2">
                    <input className="input" value={editTechNumber} onChange={(e) => setEditTechNumber(e.target.value)} placeholder="Número" />
                    <input className="input" value={editTechName} onChange={(e) => setEditTechName(e.target.value)} placeholder="Nome" />
                    <select className="select" value={editTechTeam} onChange={(e) => setEditTechTeam(e.target.value)}>
                      <option value="MECHANICAL">Mecânica</option>
                      <option value="ELECTRICAL">Elétrica</option>
                    </select>
                  </div>
                  <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
                    <button className="btn btn-primary" onClick={async () => {
                      try {
                        await apiPost(`/admin/technicians/${t.id}/edit`, {
                          number: editTechNumber.trim(),
                          name: editTechName.trim(),
                          team: editTechTeam,
                        });
                        setEditTechId("");
                        setEditTechNumber("");
                        setEditTechName("");
                        setEditTechTeam("MECHANICAL");
                        await loadAll();
                      } catch (e: any) { alert(e?.message ?? "Erro"); }
                    }}>Guardar</button>
                    <button className="btn" onClick={() => { setEditTechId(""); setEditTechNumber(""); setEditTechName(""); }}>Cancelar</button>
                  </div>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </div>
      </div>
    </DashboardLayout>
  );
}
