// Páginas abertas sem login: a vitrine (/), o login e a página offline do service worker.
// Nelas não aparecem as abas do app nem a janela de novidades.
export const ROTAS_PUBLICAS = ["/", "/login", "/offline"];

export function rotaPublica(pathname) {
  return ROTAS_PUBLICAS.includes(pathname);
}
