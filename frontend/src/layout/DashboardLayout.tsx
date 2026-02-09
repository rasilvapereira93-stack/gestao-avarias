import { useMemo, useState } from "react";
import { NavLink } from "react-router-dom";

export default function DashboardLayout(props: any) {
  const { title, subtitle, right, children, kioskSubtitle } = props;

  const [open, setOpen] = useState(false);
  const [logoOk, setLogoOk] = useState(true);

  const isKiosk = (() => {
    const params = new URLSearchParams(window.location.search);
    const v = (params.get("kiosk") || "").toLowerCase();
    return v === "1" || v === "true";
  })();

  const hasTech = !!localStorage.getItem("techToken");
  const hasAdmin = !!localStorage.getItem("adminToken");
  const techTeam = (localStorage.getItem("techTeam") || "").toUpperCase();
  const isMechanical = techTeam === "MECHANICAL";
  const isElectrical = techTeam === "ELECTRICAL";

  const items = useMemo(() => {
    const base: any[] = [{ to: "/producao", label: "Produção", show: true }];
    base.push({
      to: "/mecanica",
      label: "Mecânica",
      show: hasAdmin || !hasTech || isMechanical
    });
    base.push({
      to: "/eletrica",
      label: "Elétrica",
      show: hasAdmin || !hasTech || isElectrical
    });
    base.push({ to: "/historico", label: "Histórico", show: hasTech || hasAdmin });
    base.push({ to: "/admin", label: "Configurações", show: hasAdmin });
    return base.filter((x) => x.show);
  }, [hasAdmin, hasTech]);

  return (
    <>
      {!isKiosk && open ? <div className="backdrop" onClick={() => setOpen(false)} /> : null}

      <div className={`shell ${isKiosk ? "kiosk" : ""}`}>
        {!isKiosk ? (
          <aside className={`sidebar ${open ? "open" : ""}`}>
            <div className="sidebar-top">
              <NavLink to="/admin" aria-label="Administração" style={{ display: "inline-flex" }}>
                {logoOk ? (
                  <img
                    src="/logo-cotesi.png"
                    alt="COTESI"
                    className="sidebar-logo"
                    onError={() => setLogoOk(false)}
                  />
                ) : (
                  <div
                    className="sidebar-logo"
                    aria-hidden
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontWeight: 900,
                    }}
                  >
                    C
                  </div>
                )}
              </NavLink>
            </div>

            <nav className="nav">
              {items.map((it) => (
                <NavLink
                  key={it.to}
                  to={it.to}
                  onClick={() => setOpen(false)}
                  className={({ isActive }) => (isActive ? "nav-item active" : "nav-item")}
                >
                  <span className="nav-ico">{it.icon}</span>
                  <span>{it.label}</span>
                </NavLink>
              ))}
            </nav>

            <div className="sidebar-footer">Gestão de Avarias • Desenvolvido por Rui Pereira</div>
          </aside>
        ) : null}

        <main>
          {!isKiosk ? (
            <div className="topbar">
              <div className="topbar-inner">
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <button
                    className="btn btn-ghost"
                    onClick={() => setOpen((v) => !v)}
                    style={{ display: "none", color: "#fff", borderColor: "transparent" }}
                    id="mobileMenuBtn"
                    type="button"
                    title="Menu"
                  >
                    ☰
                  </button>

                  <div className="topbar-title">
                    <div className="h1">{title}</div>
                    {subtitle ? <div className="p">{subtitle}</div> : null}
                  </div>
                </div>

                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>{right}</div>
              </div>

              <style>{`
                @media (max-width: 900px){
                  #mobileMenuBtn{ display:inline-flex !important; }
                }
              `}</style>
            </div>
          ) : null}

          {isKiosk ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "12px 16px", background: "var(--green-dark)", color: "#fff" }}>
              {logoOk ? (
                <img
                  src="/logo-cotesi.png"
                  alt="COTESI"
                  className="sidebar-logo"
                  style={{ marginLeft: 24 }}
                  onError={() => setLogoOk(false)}
                />
              ) : (
                <div
                  className="sidebar-logo"
                  aria-hidden
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: 900,
                    marginLeft: 24,
                  }}
                >
                  C
                </div>
              )}
              <div style={{ textAlign: "right" }}>
                <div className="h1 kiosk-title" style={{ color: "#fff", fontSize: 18 }}>Gestao de Avarias</div>
                {kioskSubtitle ? (
                  <div className="p kiosk-subtitle" style={{ color: "#fff", marginTop: 4 }}>{kioskSubtitle}</div>
                ) : null}
              </div>
            </div>
          ) : null}

          <div className="content">{children}</div>
        </main>
      </div>
    </>
  );
}
