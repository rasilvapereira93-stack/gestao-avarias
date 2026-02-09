import { useEffect, useState } from "react";

const API_BASE = "http://localhost:3001";

type Props = {
  lineName: string;
  machineNumber: string;
  onClose: () => void;
};

type QuickObs = { id: string; text: string };

export default function AvariaModal({ lineName, machineNumber, onClose }: Props) {
  const [operatorNumber, setOperatorNumber] = useState("");
  const [quickObs, setQuickObs] = useState<QuickObs[]>([]);
  const [selectedObs, setSelectedObs] = useState<string[]>([]);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    loadQuickObs();
  }, []);

  async function loadQuickObs() {
    try {
      const res = await fetch(`${API_BASE}/config/quick-observations`);
      const data = await res.json();
      setQuickObs(data.quickObservations ?? []);
    } catch {
      alert("Erro a carregar observações rápidas");
    }
  }

  function toggleObs(text: string) {
    setSelectedObs((prev) => (prev.includes(text) ? prev.filter((o) => o !== text) : [...prev, text]));
  }

  async function submit() {
    if (!operatorNumber.trim()) {
      alert("Introduz o número do operador");
      return;
    }

    setSending(true);
    try {
      const res = await fetch(`${API_BASE}/incidents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lineName,
          machineNumber,
          operatorNumber: operatorNumber.trim(),
          observations: selectedObs,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data?.error ?? "Erro ao criar avaria");
        return;
      }

      alert(data?.message ?? "✅ Avaria mecânica enviada");
      onClose();
    } catch {
      alert("Erro de ligação ao backend");
    } finally {
      setSending(false);
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 14,
        zIndex: 999,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="card card-pad"
        style={{ width: "100%", maxWidth: 520 }}
      >
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h3 className="h3">Avaria Mecânica</h3>
          <button className="btn btn-ghost" onClick={onClose}>✕</button>
        </div>

        <p className="p" style={{ marginTop: 6 }}>
          <strong>{lineName}</strong> — Máquina <strong>{machineNumber}</strong>
        </p>

        <div style={{ marginTop: 12 }}>
          <div style={{ fontWeight: 900, marginBottom: 6 }}>Número do operador</div>
          <input
            className="input"
            value={operatorNumber}
            onChange={(e) => setOperatorNumber(e.target.value)}
            inputMode="numeric"
            placeholder="Ex: 1234"
          />
        </div>

        <div style={{ marginTop: 14 }}>
          <div style={{ fontWeight: 900, marginBottom: 8 }}>Observações rápidas</div>

          <div className="grid grid-2">
            {quickObs.map((q) => {
              const active = selectedObs.includes(q.text);
              return (
                <button
                  key={q.id}
                  className="btn"
                  onClick={() => toggleObs(q.text)}
                  style={{
                    textAlign: "left",
                    borderColor: active ? "var(--primary)" : undefined,
                    boxShadow: active ? "var(--focus)" : undefined,
                  }}
                >
                  {q.text}
                </button>
              );
            })}
          </div>
        </div>

        <div className="row" style={{ justifyContent: "flex-end", marginTop: 16 }}>
          <button className="btn" onClick={onClose} disabled={sending}>
            Cancelar
          </button>
          <button className="btn btn-primary" onClick={submit} disabled={sending}>
            {sending ? "A enviar…" : "Confirmar"}
          </button>
        </div>
      </div>
    </div>
  );
}
