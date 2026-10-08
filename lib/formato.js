const moeda = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});
const qtdFmt = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });

// 1234.5 -> "R$ 1.234,50"
export function brl(valor) {
  return moeda.format(Number(valor) || 0);
}

// 12 -> "12"; 1.5 -> "1,5"
export function qtd(valor) {
  return qtdFmt.format(Number(valor) || 0);
}

// "2026-09-27" -> "27/09"; com ano: "27/09/2026"
export function dataBR(iso, comAno = false) {
  if (!iso) return "";
  const [a, m, d] = iso.split("-");
  return comAno ? `${d}/${m}/${a}` : `${d}/${m}`;
}

// data local (toISOString usaria UTC e viraria o dia às 21h no horário de Brasília)
export function hoje() {
  return new Date().toLocaleDateString("sv-SE");
}

// soma (ou subtrai) dias de uma data "AAAA-MM-DD", em data local
export function somarDias(iso, dias) {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() + dias);
  return d.toLocaleDateString("sv-SE");
}

// "12,50" ou "12.50" -> 12.5; vazio -> 0; texto inválido -> NaN
export function numero(texto) {
  if (texto === null || texto === undefined || String(texto).trim() === "") return 0;
  return Number(String(texto).trim().replace(",", "."));
}

// campo preenchido? (numero("") devolve 0, então "vazio" precisa ser checado à parte)
export function preenchido(texto) {
  return texto !== null && texto !== undefined && String(texto).trim() !== "";
}

const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

// "2026-09" -> "Setembro 2026"
export function nomeMes(ym) {
  const [a, m] = ym.split("-");
  return `${MESES[Number(m) - 1]} ${a}`;
}

// soma (ou subtrai) meses de "AAAA-MM"
export function somarMeses(ym, n) {
  const [a, m] = ym.split("-").map(Number);
  const t = a * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
}

// último dia do mês "AAAA-MM" -> "AAAA-MM-DD"
export function ultimoDiaDoMes(ym) {
  const [a, m] = ym.split("-").map(Number);
  return `${ym}-${String(new Date(a, m, 0).getDate()).padStart(2, "0")}`;
}
