const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

dotenv.config();

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(cors({ origin: true }));

// ===== Persistência em ficheiro =====
const DATA_DIR = path.resolve(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "data.json");

function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

  if (!fs.existsSync(DATA_FILE)) {
    const seed = {
      config: {
        lines: [{ id: "L1", name: "Linha 1", active: true }],
        machines: [{ id: "M1", lineId: "L1", number: "01", name: "Máquina 01", active: true }],
        quickObservations: [
          { id: "Q1", text: "Não arranca", active: true },
          { id: "Q2", text: "Barulho anormal", active: true },
          { id: "Q3", text: "Paragens intermitentes", active: true }
        ],
        technicians: [
          { id: "T1", number: "819", name: "Técnico 819", active: true, pin: "1234" }
        ]
      },
      incidents: [],
      history: [],
      nextIncidentId: 1
    };
    fs.writeFileSync(DATA_FILE, JSON.stringify(seed, null, 2), "utf-8");
  }
}

function loadDB() {
  ensureDataFile();
  return JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));
}

function saveDB(db) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2), "utf-8");
}

function nowIso() {
  return new Date().toISOString();
}

function rid(prefix) {
  return `${prefix}_${crypto.randomBytes(12).toString("hex")}`;
}

// Gera um objecto com salt+hash pbkdf2 para armazenar PINs de forma segura
function hashPin(pin) {
  const salt = crypto.randomBytes(16).toString("hex");
  const iterations = 120000;
  const keylen = 32;
  const digest = "sha256";
  const hash = crypto.pbkdf2Sync(String(pin).trim(), salt, iterations, keylen, digest).toString("hex");
  return { salt, hash, iterations, keylen, digest };
}

function pushLog(incident, entry) {
  if (!incident.logs) incident.logs = [];
  incident.logs.push(entry);
}

function computeDurations(incident) {
  const opened = incident.openedAt ? new Date(incident.openedAt).getTime() : null;
  const assigned = incident.assignedAt ? new Date(incident.assignedAt).getTime() : null;
  const started = incident.workStartedAt ? new Date(incident.workStartedAt).getTime() : null;
  const resolved = incident.resolvedAt ? new Date(incident.resolvedAt).getTime() : null;
  if (!opened || !resolved) return null;
  return {
    totalDownMs: resolved - opened,
    timeToAssignMs: assigned ? assigned - opened : null,
    timeToStartMs: started ? started - opened : null,
    repairMs: started ? resolved - started : null,
    waitingMs: Number(incident.waitingMs || 0)
  };
}

function isWaitingStatus(status) {
  return status === "WAITING_PARTS" || status === "LONG_REPAIR";
}

function addWaitingTime(incident, atIso) {
  if (!incident.waitingSince) return;
  const start = new Date(incident.waitingSince).getTime();
  const end = new Date(atIso).getTime();
  const delta = end - start;
  if (Number.isFinite(delta) && delta > 0) {
    incident.waitingMs = Number(incident.waitingMs || 0) + delta;
  }
  incident.waitingSince = null;
}

function normalizeTeam(value) {
  const t = String(value || "").trim().toUpperCase();
  if (t === "ELECTRICAL" || t === "ELETRICA") return "ELECTRICAL";
  return "MECHANICAL";
}

// ===== Auth simples (tokens em memória) =====
const ADMIN_PIN = (process.env.ADMIN_PIN || "1234").trim();

const adminTokens = new Map(); // token -> { createdAt }
const techTokens = new Map();  // token -> { techNumber, techName, team, createdAt }
const sseClients = new Set();  // Set<http.ServerResponse>

function emitEvent(eventName, payload) {
  const data = payload ? JSON.stringify(payload) : "{}";
  for (const res of sseClients) {
    res.write(`event: ${eventName}\n`);
    res.write(`data: ${data}\n\n`);
  }
}

function requireAdmin(req, res, next) {
  const token = (req.headers["x-admin-token"] || "").toString().trim();
  if (!token || !adminTokens.has(token)) return res.status(401).json({ error: "Unauthorized" });
  next();
}

function requireTech(req, res, next) {
  const token = (req.headers["x-tech-token"] || "").toString().trim();
  if (!token || !techTokens.has(token)) return res.status(401).json({ error: "Unauthorized" });
  req.tech = techTokens.get(token);
  next();
}

// ===== Health =====
app.get("/", (req, res) => {
  res.json({ ok: true, service: "backend", time: nowIso() });
});

// ===== Events (SSE) =====
app.get("/events", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  res.write("event: ready\n");
  res.write("data: {}\n\n");

  sseClients.add(res);
  req.on("close", () => {
    sseClients.delete(res);
  });
});

// ===== Config público =====
app.get("/config/lines", (req, res) => {
  const db = loadDB();
  res.json({ lines: db.config.lines.filter((x) => x.active !== false) });
});

app.get("/config/machines", (req, res) => {
  const db = loadDB();
  res.json({ machines: db.config.machines.filter((x) => x.active !== false) });
});

app.get("/config/quick-observations", (req, res) => {
  const db = loadDB();
  res.json({ quickObservations: db.config.quickObservations.filter((x) => x.active !== false) });
});

app.get("/config/technicians", (req, res) => {
  const db = loadDB();
  const teamFilter = String(req.query.team || "").trim();
  const technicians = (db.config.technicians || [])
    .filter((t) => t.active !== false)
    .map((t) => ({ id: t.id, number: t.number, name: t.name, active: t.active, team: normalizeTeam(t.team) }))
    .filter((t) => !teamFilter || t.team === normalizeTeam(teamFilter));
  res.json({ technicians });
});

// ===== Incidents =====
app.get("/incidents", (req, res) => {
  const db = loadDB();
  res.json({ incidents: db.incidents });
});

app.post("/incidents", (req, res) => {
  const { lineName, machineNumber, operatorNumber, observations, team } = req.body || {};
  if (!lineName || !machineNumber || !operatorNumber) {
    return res.status(400).json({ error: "Faltam campos obrigatórios." });
  }

  const db = loadDB();
  const normalizedTeam = normalizeTeam(team);
  const existsOpen = (db.incidents || []).some((i) =>
    i.status !== "RESOLVED" &&
    String(i.lineName) === String(lineName) &&
    String(i.machineNumber) === String(machineNumber) &&
    normalizeTeam(i.team) === normalizedTeam
  );
  if (existsOpen) {
    return res.status(400).json({ error: "Já existe uma avaria aberta para esta máquina." });
  }
  const at = nowIso();
  const incident = {
    id: db.nextIncidentId++,
    team: normalizedTeam,
    status: "OPEN",
    lineName: String(lineName),
    machineNumber: String(machineNumber),
    reportedByOperatorNumber: String(operatorNumber),
    quickObservations: Array.isArray(observations) ? observations.map(String) : [],
    openedAt: at,
    assignedToTechnicianNumber: null,
    assignedAt: null,
    workStartedAt: null,
    resolvedAt: null,
    logs: [
      {
        at,
        actorType: "OPERATOR",
        actorId: String(operatorNumber),
        actorName: null,
        action: "REPORTED",
        summary: `Operador ${operatorNumber} reportou avaria.`,
        details: { lineName: String(lineName), machineNumber: String(machineNumber), quickObservations: Array.isArray(observations) ? observations.map(String) : [] }
      }
    ],
    notes: [
      {
        at,
        by: `OPERATOR:${operatorNumber}`,
        text: `Avaria ${normalizedTeam === "ELECTRICAL" ? "elétrica" : "mecânica"} reportada. Obs: ${(Array.isArray(observations) ? observations : []).join(", ")}`
      }
    ]
  };

  db.incidents.unshift(incident);
  saveDB(db);

  emitEvent("incident_created", { id: incident.id });

  res.json({ ok: true, message: normalizedTeam === "ELECTRICAL" ? "Avaria elétrica registada." : "Avaria mecânica registada.", incident });
});

function findIncident(db, id) {
  const incident = db.incidents.find((x) => x.id === id);
  if (!incident) return null;
  return incident;
}

// ===== Tech actions on incidents =====
app.post("/incidents/:id/assign", requireTech, (req, res) => {
  const id = Number(req.params.id);
  const db = loadDB();
  const incident = findIncident(db, id);
  if (!incident) return res.status(404).json({ error: "Avaria não encontrada." });
  if (normalizeTeam(incident.team) !== normalizeTeam(req.tech.team)) {
    return res.status(403).json({ error: "Sem acesso a esta avaria." });
  }

  const at = nowIso();
  incident.assignedToTechnicianNumber = String(req.tech.techNumber);
  if (!incident.assignedAt) incident.assignedAt = at;
  incident.status = "ASSIGNED";
  pushLog(incident, {
    at,
    actorType: "TECH",
    actorId: req.tech.techNumber,
    actorName: req.tech.techName,
    action: "ASSIGNED",
    summary: `Técnico ${req.tech.techNumber} assumiu.`,
    details: { status: "ASSIGNED" }
  });

  saveDB(db);
  emitEvent("incident_updated", { id: incident.id });
  res.json({ ok: true, incident });
});

app.post("/incidents/:id/start", requireTech, (req, res) => {
  const id = Number(req.params.id);
  const db = loadDB();
  const incident = findIncident(db, id);
  if (!incident) return res.status(404).json({ error: "Avaria não encontrada." });
  if (normalizeTeam(incident.team) !== normalizeTeam(req.tech.team)) {
    return res.status(403).json({ error: "Sem acesso a esta avaria." });
  }

  const at = nowIso();
  addWaitingTime(incident, at);
  if (!incident.assignedToTechnicianNumber) {
    incident.assignedToTechnicianNumber = String(req.tech.techNumber);
    incident.assignedAt = incident.assignedAt || at;
  }
  incident.workStartedAt = incident.workStartedAt || at;
  incident.status = "IN_PROGRESS";
  pushLog(incident, {
    at,
    actorType: "TECH",
    actorId: req.tech.techNumber,
    actorName: req.tech.techName,
    action: "WORK_STARTED",
    summary: `Técnico ${req.tech.techNumber} iniciou intervenção.`,
    details: { workStartedAt: incident.workStartedAt }
  });

  saveDB(db);
  emitEvent("incident_updated", { id: incident.id });
  res.json({ ok: true, incident });
});

app.post("/incidents/:id/status", requireTech, (req, res) => {
  const id = Number(req.params.id);
  const { status, note } = req.body || {};
  if (!status || !["WAITING_PARTS", "LONG_REPAIR"].includes(String(status))) {
    return res.status(400).json({ error: "Status inválido." });
  }

  const db = loadDB();
  const incident = findIncident(db, id);
  if (!incident) return res.status(404).json({ error: "Avaria não encontrada." });
  if (normalizeTeam(incident.team) !== normalizeTeam(req.tech.team)) {
    return res.status(403).json({ error: "Sem acesso a esta avaria." });
  }

  const at = nowIso();
  if (!incident.assignedToTechnicianNumber) {
    incident.assignedToTechnicianNumber = String(req.tech.techNumber);
    incident.assignedAt = incident.assignedAt || at;
  }
  if (!isWaitingStatus(incident.status)) {
    incident.waitingSince = at;
  } else if (!incident.waitingSince) {
    incident.waitingSince = at;
  }
  incident.status = String(status);
  pushLog(incident, {
    at,
    actorType: "TECH",
    actorId: req.tech.techNumber,
    actorName: req.tech.techName,
    action: "STATUS_CHANGED",
    summary: `Técnico ${req.tech.techNumber} alterou estado para ${incident.status}.`,
    details: { status: incident.status, note: String(note || "").trim() }
  });

  saveDB(db);
  emitEvent("incident_updated", { id: incident.id });
  res.json({ ok: true, incident });
});

app.post("/incidents/:id/resolve", requireTech, (req, res) => {
  const id = Number(req.params.id);
  const { note, partsUsed } = req.body || {};
  const db = loadDB();
  const incident = findIncident(db, id);
  if (!incident) return res.status(404).json({ error: "Avaria não encontrada." });
  if (normalizeTeam(incident.team) !== normalizeTeam(req.tech.team)) {
    return res.status(403).json({ error: "Sem acesso a esta avaria." });
  }

  const at = nowIso();
  addWaitingTime(incident, at);
  if (!incident.assignedToTechnicianNumber) {
    incident.assignedToTechnicianNumber = String(req.tech.techNumber);
    incident.assignedAt = incident.assignedAt || at;
  }
  if (!incident.workStartedAt) incident.workStartedAt = at;
  incident.resolvedAt = at;
  incident.status = "RESOLVED";

  pushLog(incident, {
    at,
    actorType: "TECH",
    actorId: req.tech.techNumber,
    actorName: req.tech.techName,
    action: "RESOLVED",
    summary: `Máquina pronta por técnico ${req.tech.techNumber}.`,
    details: { resolvedAt: at, note: String(note || "").trim(), partsUsed: String(partsUsed || "").trim() }
  });

  incident.durations = computeDurations(incident);
  db.history = db.history || [];
  db.history.unshift(incident);
  db.incidents = db.incidents.filter((x) => x.id !== id);

  saveDB(db);
  emitEvent("incident_updated", { id });
  res.json({ ok: true, incident });
});

// ===== Tech login =====
app.post("/tech/login", (req, res) => {
  const { number, pin, team: desiredTeam } = req.body || {};
  if (!number || !pin || !desiredTeam) return res.status(400).json({ error: "Faltam campos." });

  const db = loadDB();
  const tech = (db.config.technicians || []).find(
    (t) => t.active !== false && String(t.number) === String(number).trim()
  );
  if (!tech) return res.status(401).json({ error: "Técnico inválido." });

  // Suporte a PIN armazenado em claro (legacy) e a PIN armazenado como hash (pbkdf2)
  const storedPin = tech.pin || tech.pinHash || null;
  let verified = false;
  if (!storedPin) {
    verified = false;
  } else if (typeof storedPin === "object" && storedPin.hash && storedPin.salt) {
    try {
      const iterations = storedPin.iterations || 120000;
      const keylen = storedPin.keylen || 32;
      const digest = storedPin.digest || "sha256";
      const derived = crypto
        .pbkdf2Sync(String(pin).trim(), storedPin.salt, iterations, keylen, digest)
        .toString("hex");
      verified = derived === storedPin.hash;
    } catch (err) {
      verified = false;
    }
  } else {
    verified = String(storedPin || "").trim() === String(pin).trim();
  }

  if (!verified) return res.status(401).json({ error: "PIN inválido." });

  const team = normalizeTeam(tech.team);
  if (normalizeTeam(desiredTeam) !== team) {
    return res.status(403).json({ error: "Sem acesso a esta área." });
  }

  const token = rid("TECH");
  techTokens.set(token, { techNumber: tech.number, techName: tech.name, team, createdAt: nowIso() });

  res.json({ ok: true, token, tech: { number: tech.number, name: tech.name, team } });
});

app.post("/tech/logout", requireTech, (req, res) => {
  const token = (req.headers["x-tech-token"] || "").toString().trim();
  techTokens.delete(token);
  res.json({ ok: true });
});

app.get("/tech/me", requireTech, (req, res) => {
  res.json({ ok: true, tech: { number: req.tech.techNumber, name: req.tech.techName, team: req.tech.team } });
});

// ===== Admin login =====
app.post("/admin/login", (req, res) => {
  const { pin } = req.body || {};
  if (!pin) return res.status(400).json({ error: "Falta PIN." });
  if (String(pin).trim() !== ADMIN_PIN) return res.status(401).json({ error: "PIN inválido." });

  const token = rid("ADMIN");
  adminTokens.set(token, { createdAt: nowIso() });
  res.json({ ok: true, token });
});

app.post("/admin/logout", requireAdmin, (req, res) => {
  const token = (req.headers["x-admin-token"] || "").toString().trim();
  adminTokens.delete(token);
  res.json({ ok: true });
});

// ===== Admin: listar =====
app.get("/admin/lines", requireAdmin, (req, res) => {
  const db = loadDB();
  res.json({ lines: db.config.lines });
});

app.get("/admin/machines", requireAdmin, (req, res) => {
  const db = loadDB();
  res.json({ machines: db.config.machines });
});

app.get("/admin/quick-observations", requireAdmin, (req, res) => {
  const db = loadDB();
  res.json({ quickObservations: db.config.quickObservations });
});

app.get("/admin/technicians", requireAdmin, (req, res) => {
  const db = loadDB();
  const technicians = (db.config.technicians || []).map((t) => ({
    id: t.id,
    number: t.number,
    name: t.name,
    active: t.active,
    team: normalizeTeam(t.team),
    hasPin: !!(t.pin && (typeof t.pin === "object" ? t.pin.hash : String(t.pin).trim()))
  }));
  res.json({ technicians });
});

// ===== Admin: backup =====
app.get("/admin/backup", requireAdmin, (req, res) => {
  ensureDataFile();
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.send(fs.readFileSync(DATA_FILE, "utf-8"));
});

// ===== Admin: apagar histórico =====
app.delete("/admin/history", requireAdmin, (req, res) => {
  const scope = String(req.query.scope || "resolved");
  const db = loadDB();

  if (scope === "all") {
    db.history = [];
    db.incidents = [];
    db.nextIncidentId = 1;
  } else {
    // apaga só resolvidas do histórico
    db.history = [];
  }
  saveDB(db);
  emitEvent("history_deleted", { scope });
  res.json({ ok: true });
});

// ===== CRUD helpers =====
function uniqId(prefix, arr) {
  let i = arr.length + 1;
  while (arr.some((x) => x.id === `${prefix}${i}`)) i++;
  return `${prefix}${i}`;
}

// Lines
app.post("/admin/lines", requireAdmin, (req, res) => {
  const name = String((req.body || {}).name || "").trim();
  if (!name) return res.status(400).json({ error: "Nome inválido." });

  const db = loadDB();
  if (db.config.lines.some((l) => l.name.toLowerCase() === name.toLowerCase())) {
    return res.status(400).json({ error: "Linha já existe." });
  }
  const id = uniqId("L", db.config.lines);
  db.config.lines.push({ id, name, active: true });
  saveDB(db);
  res.json({ ok: true });
});

app.post("/admin/lines/:id/edit", requireAdmin, (req, res) => {
  const name = String((req.body || {}).name || "").trim();
  if (!name) return res.status(400).json({ error: "Nome inválido." });

  const db = loadDB();
  const line = db.config.lines.find((l) => l.id === req.params.id);
  if (!line) return res.status(404).json({ error: "Linha não encontrada." });
  if (db.config.lines.some((l) => l.id !== line.id && l.name.toLowerCase() === name.toLowerCase())) {
    return res.status(400).json({ error: "Linha já existe." });
  }

  line.name = name;
  saveDB(db);
  res.json({ ok: true });
});

app.post("/admin/lines/:id/toggle", requireAdmin, (req, res) => {
  const db = loadDB();
  const l = db.config.lines.find((x) => x.id === req.params.id);
  if (!l) return res.status(404).json({ error: "Linha não encontrada." });
  l.active = !l.active;
  saveDB(db);
  res.json({ ok: true });
});

app.delete("/admin/lines/:id", requireAdmin, (req, res) => {
  const db = loadDB();
  const id = req.params.id;
  db.config.lines = db.config.lines.filter((x) => x.id !== id);
  db.config.machines = db.config.machines.filter((m) => m.lineId !== id);
  saveDB(db);
  res.json({ ok: true });
});

// Machines
app.post("/admin/machines", requireAdmin, (req, res) => {
  const { lineId, number, name } = req.body || {};
  if (!lineId) return res.status(400).json({ error: "Seleciona linha." });
  if (!String(number || "").trim()) return res.status(400).json({ error: "Número inválido." });

  const db = loadDB();
  const line = db.config.lines.find((l) => l.id === String(lineId));
  if (!line) return res.status(400).json({ error: "Linha inválida." });

  const num = String(number).trim();
  const exists = db.config.machines.some((m) => m.lineId === line.id && m.number === num);
  if (exists) return res.status(400).json({ error: "Máquina já existe nessa linha." });

  const id = uniqId("M", db.config.machines);
  db.config.machines.push({ id, lineId: line.id, number: num, name: String(name || "").trim(), active: true });
  saveDB(db);
  res.json({ ok: true });
});

app.post("/admin/machines/batch", requireAdmin, (req, res) => {
  const { lineId, machines } = req.body || {};
  if (!lineId) return res.status(400).json({ error: "Seleciona linha." });
  if (!Array.isArray(machines) || machines.length === 0) {
    return res.status(400).json({ error: "Lista de máquinas inválida." });
  }

  const db = loadDB();
  const line = db.config.lines.find((l) => l.id === String(lineId));
  if (!line) return res.status(400).json({ error: "Linha inválida." });

  const normalized = machines.map((m) => ({
    number: String(m?.number || "").trim(),
    name: String(m?.name || "").trim()
  }));

  if (normalized.some((m) => !m.number)) {
    return res.status(400).json({ error: "Número inválido em lote." });
  }

  const seen = new Set();
  for (const m of normalized) {
    const key = `${line.id}:${m.number}`;
    if (seen.has(key)) return res.status(400).json({ error: "Números repetidos no lote." });
    seen.add(key);
  }

  const hasExisting = normalized.some((m) =>
    db.config.machines.some((x) => x.lineId === line.id && x.number === m.number)
  );
  if (hasExisting) {
    return res.status(400).json({ error: "Já existe máquina com esses números na linha." });
  }

  for (const m of normalized) {
    const id = uniqId("M", db.config.machines);
    db.config.machines.push({ id, lineId: line.id, number: m.number, name: m.name, active: true });
  }

  saveDB(db);
  res.json({ ok: true, count: normalized.length });
});

app.post("/admin/machines/:id/edit", requireAdmin, (req, res) => {
  const { lineId, number, name } = req.body || {};
  if (!lineId) return res.status(400).json({ error: "Seleciona linha." });
  if (!String(number || "").trim()) return res.status(400).json({ error: "Número inválido." });

  const db = loadDB();
  const machine = db.config.machines.find((m) => m.id === req.params.id);
  if (!machine) return res.status(404).json({ error: "Máquina não encontrada." });

  const line = db.config.lines.find((l) => l.id === String(lineId));
  if (!line) return res.status(400).json({ error: "Linha inválida." });

  const num = String(number).trim();
  const exists = db.config.machines.some((m) => m.id !== machine.id && m.lineId === line.id && m.number === num);
  if (exists) return res.status(400).json({ error: "Máquina já existe nessa linha." });

  machine.lineId = line.id;
  machine.number = num;
  machine.name = String(name || "").trim();
  saveDB(db);
  res.json({ ok: true });
});

app.post("/admin/machines/:id/toggle", requireAdmin, (req, res) => {
  const db = loadDB();
  const m = db.config.machines.find((x) => x.id === req.params.id);
  if (!m) return res.status(404).json({ error: "Máquina não encontrada." });
  m.active = !m.active;
  saveDB(db);
  res.json({ ok: true });
});

app.delete("/admin/machines/:id", requireAdmin, (req, res) => {
  const db = loadDB();
  db.config.machines = db.config.machines.filter((x) => x.id !== req.params.id);
  saveDB(db);
  res.json({ ok: true });
});

// Quick Observations
app.post("/admin/quick-observations", requireAdmin, (req, res) => {
  const text = String((req.body || {}).text || "").trim();
  if (!text) return res.status(400).json({ error: "Texto inválido." });

  const db = loadDB();
  if (db.config.quickObservations.some((q) => q.text.toLowerCase() === text.toLowerCase())) {
    return res.status(400).json({ error: "Observação já existe." });
  }
  const id = uniqId("Q", db.config.quickObservations);
  db.config.quickObservations.push({ id, text, active: true });
  saveDB(db);
  res.json({ ok: true });
});

app.post("/admin/quick-observations/:id/edit", requireAdmin, (req, res) => {
  const text = String((req.body || {}).text || "").trim();
  if (!text) return res.status(400).json({ error: "Texto inválido." });

  const db = loadDB();
  const obs = db.config.quickObservations.find((q) => q.id === req.params.id);
  if (!obs) return res.status(404).json({ error: "Observação não encontrada." });
  if (db.config.quickObservations.some((q) => q.id !== obs.id && q.text.toLowerCase() === text.toLowerCase())) {
    return res.status(400).json({ error: "Observação já existe." });
  }

  obs.text = text;
  saveDB(db);
  res.json({ ok: true });
});

app.post("/admin/quick-observations/:id/toggle", requireAdmin, (req, res) => {
  const db = loadDB();
  const q = db.config.quickObservations.find((x) => x.id === req.params.id);
  if (!q) return res.status(404).json({ error: "Observação não encontrada." });
  q.active = !q.active;
  saveDB(db);
  res.json({ ok: true });
});

app.delete("/admin/quick-observations/:id", requireAdmin, (req, res) => {
  const db = loadDB();
  db.config.quickObservations = db.config.quickObservations.filter((x) => x.id !== req.params.id);
  saveDB(db);
  res.json({ ok: true });
});

// Technicians
app.post("/admin/technicians", requireAdmin, (req, res) => {
  const number = String((req.body || {}).number || "").trim();
  const name = String((req.body || {}).name || "").trim() || `Técnico ${number}`;
  const pin = String((req.body || {}).pin || "").trim();
  const team = normalizeTeam((req.body || {}).team);

  if (!number) return res.status(400).json({ error: "Número inválido." });
  if (!/^[0-9]{4}$/.test(pin)) return res.status(400).json({ error: "PIN deve ter 4 dígitos." });

  const db = loadDB();
  if (db.config.technicians.some((t) => String(t.number) === number)) {
    return res.status(400).json({ error: "Técnico já existe." });
  }

  const id = uniqId("T", db.config.technicians);
  const pinObj = hashPin(pin);
  db.config.technicians.push({ id, number, name, active: true, pin: pinObj, team });
  saveDB(db);
  res.json({ ok: true });
});

app.post("/admin/technicians/:id/edit", requireAdmin, (req, res) => {
  const number = String((req.body || {}).number || "").trim();
  const name = String((req.body || {}).name || "").trim();
  const team = normalizeTeam((req.body || {}).team);

  if (!number) return res.status(400).json({ error: "Número inválido." });

  const db = loadDB();
  const tech = db.config.technicians.find((t) => t.id === req.params.id);
  if (!tech) return res.status(404).json({ error: "Técnico não encontrado." });

  if (db.config.technicians.some((t) => t.id !== tech.id && String(t.number) === number)) {
    return res.status(400).json({ error: "Técnico já existe." });
  }

  tech.number = number;
  tech.name = name || `Técnico ${number}`;
  tech.team = team;
  saveDB(db);
  res.json({ ok: true });
});

app.post("/admin/technicians/:id/toggle", requireAdmin, (req, res) => {
  const db = loadDB();
  const t = db.config.technicians.find((x) => x.id === req.params.id);
  if (!t) return res.status(404).json({ error: "Técnico não encontrado." });
  t.active = !t.active;
  saveDB(db);
  res.json({ ok: true });
});

app.post("/admin/technicians/:id/reset-pin", requireAdmin, (req, res) => {
  const pin = String((req.body || {}).pin || "").trim();
  if (!/^[0-9]{4}$/.test(pin)) return res.status(400).json({ error: "PIN inválido." });

  const db = loadDB();
  const t = db.config.technicians.find((x) => x.id === req.params.id);
  if (!t) return res.status(404).json({ error: "Técnico não encontrado." });

  t.pin = hashPin(pin);
  saveDB(db);
  res.json({ ok: true });
});

app.delete("/admin/technicians/:id", requireAdmin, (req, res) => {
  const db = loadDB();
  db.config.technicians = db.config.technicians.filter((x) => x.id !== req.params.id);
  saveDB(db);
  res.json({ ok: true });
});

// ===== History (simples) =====
// (Por agora devolve as resolvidas guardadas em db.history; mais tarde refinamos)
app.get("/history", (req, res) => {
  const adminToken = (req.headers["x-admin-token"] || "").toString().trim();
  const techToken = (req.headers["x-tech-token"] || "").toString().trim();

  const isAdmin = adminToken && adminTokens.has(adminToken);
  const isTech = techToken && techTokens.has(techToken);

  if (!isAdmin && !isTech) return res.status(401).json({ error: "Unauthorized" });

  const db = loadDB();
  const from = String(req.query.from || "").trim();
  const to = String(req.query.to || "").trim();
  const line = String(req.query.line || "").trim().toLowerCase();
  const machine = String(req.query.machine || "").trim().toLowerCase();
  const tech = String(req.query.tech || "").trim();

  let items = Array.isArray(db.history) ? db.history.slice() : [];

  if (isTech) {
    const t = techTokens.get(techToken);
    if (t?.techNumber) items = items.filter((i) => String(i.assignedToTechnicianNumber) === String(t.techNumber));
  }

  if (from) {
    const fromMs = new Date(from + "T00:00:00").getTime();
    items = items.filter((i) => i.resolvedAt && new Date(i.resolvedAt).getTime() >= fromMs);
  }
  if (to) {
    const toMs = new Date(to + "T23:59:59").getTime();
    items = items.filter((i) => i.resolvedAt && new Date(i.resolvedAt).getTime() <= toMs);
  }
  if (line) {
    items = items.filter((i) => String(i.lineName || "").toLowerCase().includes(line));
  }
  if (machine) {
    items = items.filter((i) => String(i.machineNumber || "").toLowerCase().includes(machine));
  }
  if (tech) {
    items = items.filter((i) => String(i.assignedToTechnicianNumber || "") === tech);
  }

  res.json({ role: isAdmin ? "ADMIN" : "TECH", history: items });
});

// ===== Run =====
const PORT = Number(process.env.PORT || 3001);
const HOST = process.env.HOST || "0.0.0.0";

// escutar na rede para permitir acesso por telemóvel
app.listen(PORT, HOST, () => {
  console.log(`✅ Backend OK em http://${HOST}:${PORT}`);
});
