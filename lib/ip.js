import { createHmac } from "node:crypto";

// IP de quem chamou, como a hospedagem informa. Na Vercel o x-real-ip e o x-forwarded-for são escritos pela
// plataforma (o cliente não consegue forjar); fora dela, só vale atrás de um proxy que sobrescreva esses cabeçalhos.
export function ipDoCliente(cabecalhos) {
  const real = cabecalhos.get("x-real-ip")?.trim();
  if (real) return real;
  return (cabecalhos.get("x-forwarded-for") ?? "").split(",")[0].trim();
}

// IPv6: quem tem uma rede tem milhões de endereços; vale o prefixo /64 (4 primeiros blocos), não o endereço.
// IPv4 (inclusive o embutido em ::ffff:a.b.c.d) vale inteiro.
export function redeDoIp(ip) {
  const texto = String(ip ?? "").trim();
  if (!texto) return "";
  if (!texto.includes(":")) return texto;
  if (texto.includes(".")) return texto.slice(texto.lastIndexOf(":") + 1);
  const [antes, depois] = texto.split("::");
  const a = antes ? antes.split(":") : [];
  const d = depois ? depois.split(":") : [];
  const meio = depois === undefined ? [] : Array(Math.max(0, 8 - a.length - d.length)).fill("0");
  return [...a, ...meio, ...d]
    .slice(0, 4)
    .map((h) => h.toLowerCase().replace(/^0+(?=.)/, ""))
    .join(":");
}

// O banco guarda só um HMAC da rede: dá para limitar pedidos por conexão sem guardar o IP em claro.
// Sem IP ou sem segredo devolve null (o banco então só aplica os limites por telefone e total).
export function hashDeIp(ip, segredo) {
  const rede = redeDoIp(ip);
  if (!rede || !segredo) return null;
  return createHmac("sha256", segredo).update(rede).digest("hex").slice(0, 32);
}
