import { Navigate, Route, Routes } from "react-router-dom";
import Producao from "./pages/Producao";
import Mecanica from "./pages/Mecanica";
import Eletrica from "./pages/Eletrica";
import Admin from "./pages/Admin";
import Historico from "./pages/Historico";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/producao" replace />} />
      <Route path="/producao" element={<Producao />} />
      <Route path="/mecanica" element={<Mecanica />} />
      <Route path="/eletrica" element={<Eletrica />} />
      <Route path="/historico" element={<Historico />} />
      <Route path="/admin" element={<Admin />} />
      <Route path="*" element={<Navigate to="/producao" replace />} />
    </Routes>
  );
}
