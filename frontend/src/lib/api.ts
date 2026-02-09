export const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:3001";

export async function safeJson(res: Response) {
  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) return await res.json();
  const text = await res.text();
  throw new Error(`Resposta não é JSON: ${text.slice(0, 80)}`);
}
