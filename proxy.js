import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import { ehEquipe, inicioDe, rotaCliente, rotaLogado, rotaPublica } from "./lib/rotas";
function csp(nonce) {
  const dev = process.env.NODE_ENV !== "production";
  return [
    "default-src 'self'",
    `script-src 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: ${process.env.NEXT_PUBLIC_SUPABASE_URL}`,
    "font-src 'self'",
    `connect-src 'self'${dev ? " ws: wss:" : ""}`,
    "form-action 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    ...(dev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}
export async function proxy(req) {
  const nonce = crypto.randomUUID().replace(/-/g, "");
  const politica = csp(nonce);
  const seguir = () => {
    const cabecalhos = new Headers(req.headers);
    cabecalhos.set("x-nonce", nonce);
    cabecalhos.set("Content-Security-Policy", politica);
    const res = NextResponse.next({ request: { headers: cabecalhos } });
    res.headers.set("Content-Security-Policy", politica);
    return res;
  };
  let res = seguir();
  const gravados = [];
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll(lista) {
        lista.forEach(({ name, value }) => req.cookies.set(name, value));
        res = seguir();
        lista.forEach(({ name, value, options }) => {
          res.cookies.set(name, value, options);
          gravados.push({ name, value, options });
        });
      },
    },
  });
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { pathname } = req.nextUrl;
  const naTelaLogin = pathname === "/login";
  if (!user && !rotaPublica(pathname)) {
    if (req.method !== "GET" && req.method !== "HEAD") {
      const negado = new NextResponse("Login necessário", { status: 401 });
      negado.headers.set("Content-Security-Policy", politica);
      return negado;
    }
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    const redir = NextResponse.redirect(url);
    gravados.forEach(({ name, value, options }) => redir.cookies.set(name, value, options));
    redir.headers.set("Content-Security-Policy", politica);
    return redir;
  }
  // logado: login/cadastro levam ao início de cada um; cliente fica na vitrine e na própria conta,
  // equipe não usa a área do cliente (a RLS do banco barra o cliente de qualquer forma)
  const foraDoLugar = user && !rotaLogado(pathname) && (naTelaLogin || pathname === "/cadastro" || (!ehEquipe(user) && !rotaPublica(pathname) && !rotaCliente(pathname)) || (ehEquipe(user) && rotaCliente(pathname)));
  if (foraDoLugar) {
    if (req.method !== "GET" && req.method !== "HEAD") {
      const negado = new NextResponse("Sem acesso", { status: 403 });
      negado.headers.set("Content-Security-Policy", politica);
      return negado;
    }
    const url = req.nextUrl.clone();
    url.pathname = inicioDe(user);
    url.search = "";
    const redir = NextResponse.redirect(url);
    gravados.forEach(({ name, value, options }) => redir.cookies.set(name, value, options));
    redir.headers.set("Content-Security-Policy", politica);
    return redir;
  }
  return res;
}
export const config = { matcher: ["/((?!_next/|icons/|api/health|manifest.webmanifest|icon.png|apple-icon.png|sw.js).*)"] };
