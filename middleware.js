import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";

// Content-Security-Policy com nonce por resposta (o Next injeta scripts inline para hidratar o React).
// O app só fala com o Supabase pelo servidor, então o navegador só precisa conectar em si mesmo.
function csp(nonce) {
  const dev = process.env.NODE_ENV !== "production";
  return [
    "default-src 'self'",
    `script-src 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    `connect-src 'self'${dev ? " ws: wss:" : ""}`,
    "form-action 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    ...(dev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

// Renova a sessão do Supabase a cada requisição e manda quem não está logado para /login.
// As Server Actions também conferem o usuário (app/actions.js).
export async function middleware(req) {
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

  if (!user && !naTelaLogin) {
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

  if (user && naTelaLogin) {
    const url = req.nextUrl.clone();
    url.pathname = "/vendas";
    const redir = NextResponse.redirect(url);
    gravados.forEach(({ name, value, options }) => redir.cookies.set(name, value, options));
    redir.headers.set("Content-Security-Policy", politica);
    return redir;
  }

  return res;
}

// tudo, menos os arquivos do próprio Next e os ícones
export const config = {
  matcher: ["/((?!_next/|logo.png|manifest.webmanifest|favicon.ico).*)"],
};
