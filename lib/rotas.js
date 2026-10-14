// Páginas abertas sem login: a vitrine (/), login, cadastro de cliente e a página offline do service worker.
// Nelas não aparecem as abas do app nem a janela de novidades.
export const ROTAS_PUBLICAS = ["/", "/login", "/cadastro", "/offline"];

// Área do cliente logado (o resto do app é da equipe)
export const ROTAS_CLIENTE = ["/conta"];

export const PAPEIS_EQUIPE = ["gerente", "vendedor", "socia"];

export function rotaPublica(pathname) {
  return ROTAS_PUBLICAS.includes(pathname);
}

export function rotaCliente(pathname) {
  return ROTAS_CLIENTE.some((r) => pathname === r || pathname.startsWith(`${r}/`));
}

// o papel da equipe fica no app_metadata do Auth (só o admin grava); sem ele, é cliente
export function ehEquipe(user) {
  return PAPEIS_EQUIPE.includes(user?.app_metadata?.papel);
}

// para onde mandar cada um depois do login (ou quando abre uma página que não é dele)
export function inicioDe(user) {
  return ehEquipe(user) ? "/vendas" : "/conta";
}
