import { Link } from "react-router-dom";

function Home() {
  return (
    <div style={{ padding: 20 }}>
      <h1 style={{ marginBottom: 20 }}>Gestão de Avarias</h1>

      <div style={{ display: "grid", gap: 12, maxWidth: 420 }}>
        <Link to="/producao" style={btnStyle}>
          Produção
        </Link>

        <Link to="/mecanica" style={btnStyle}>
          Mecânica
        </Link>

        <Link to="/admin" style={{ ...btnStyle, opacity: 0.9 }}>
          Administração
        </Link>
      </div>
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  display: "block",
  padding: "18px 16px",
  borderRadius: 12,
  textDecoration: "none",
  border: "1px solid #ddd",
  fontSize: 18,
  fontWeight: 600,
  color: "inherit",
};

export default Home;
