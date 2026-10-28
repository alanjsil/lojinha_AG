import { soDigitos, telefoneValido } from "./pedido.js";

// Comissão do vendedor (mig. 040): de 10% (padrão) a 40% do lucro. A sócia ganha 35% sobre as vendas dos outros,
// e o que o vendedor ganha acima de 10% sai da parte dela. Mesma conta de vendas_preencher no banco.
export const COMISSAO_PADRAO = 10;
export const COMISSAO_MAXIMA = 40;
export const COMISSAO_SOCIA = 35;

export function comissaoDaSocia(pctVendedor) {
  const p = Number(pctVendedor);
  if (!Number.isFinite(p)) return COMISSAO_SOCIA;
  return Math.max(COMISSAO_SOCIA - Math.max(p - COMISSAO_PADRAO, 0), 0);
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Confere o cadastro/edição do vendedor. Na edição (novo = false) não há e-mail nem senha.
export function validarVendedor({ nome, telefone, email, senha, comissao } = {}, { novo = true } = {}) {
  const n = String(nome ?? "")
    .trim()
    .replace(/\s+/g, " ");
  if (n.length < 2 || n.length > 60) return { erro: "Nome do vendedor: de 2 a 60 letras." };
  const t = soDigitos(telefone);
  if (!telefoneValido(t)) return { erro: "Celular inválido: DDD + número." };
  const c = String(comissao ?? "").trim() === "" ? COMISSAO_PADRAO : Number(String(comissao).replace(",", "."));
  if (!Number.isFinite(c) || c < COMISSAO_PADRAO || c > COMISSAO_MAXIMA) {
    return { erro: `A comissão do vendedor vai de ${COMISSAO_PADRAO}% a ${COMISSAO_MAXIMA}%.` };
  }
  const dados = { nome: n, telefone: t, comissao_pct: Math.round(c * 100) / 100 };
  if (!novo) return dados;

  const e = String(email ?? "")
    .trim()
    .toLowerCase();
  if (!EMAIL.test(e)) return { erro: "E-mail inválido." };
  if (String(senha ?? "").length < 8) return { erro: "A senha precisa de pelo menos 8 caracteres." };
  return { ...dados, email: e, senha: String(senha) };
}
