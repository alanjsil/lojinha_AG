import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import { ehEquipe, inicioDe, rotaCliente, rotaLogado, rotaPublica } from "./lib/rotas";

// Monta a CSP de uma resposta. O nonce é novo a cada requisição e vai no header x-nonce,
// que o layout usa nas tags <script>; 'strict-dynamic' libera os scripts que esses carregarem.
// Não fica no next.config.js porque lá o valor seria fixo para todas as respostas.
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

// Roda antes de toda requisição que passa pelo matcher (é o "middleware" do Next 16).
// Faz três coisas: renova a sessão do Supabase, aplica a CSP com nonce e barra quem tenta
// abrir página que não é do seu papel. A autorização de verdade fica nas Server Actions e na RLS.
export async function proxy(req) {
  // hex sem hífens, para caber no atributo nonce= das tags <script>
  const nonce = crypto.randomUUID().replace(/-/g, "");
  const politica = csp(nonce);
  // (Re)monta a resposta repassando os headers da requisição, agora com o nonce e a CSP.
  // É chamada de novo quando o Supabase grava cookies, para o render já ver a sessão renovada.
  const seguir = () => {
    const cabecalhos = new Headers(req.headers);
    cabecalhos.set("x-nonce", nonce);
    cabecalhos.set("Content-Security-Policy", politica);
    const res = NextResponse.next({ request: { headers: cabecalhos } });
    res.headers.set("Content-Security-Policy", politica);
    return res;
  };

  let res = seguir();
  // cookies que o Supabase gravou, para repetir no redirect (a resposta original é descartada)
  const gravados = [];
  // getAll/setAll: o @supabase/ssr lê os cookies da requisição e, ao renovar o token,
  // grava na requisição (para o render atual) e na resposta (para o navegador guardar).
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll(lista) {
        // primeiro na requisição, para o render desta mesma resposta já usar o token novo
        lista.forEach(({ name, value }) => req.cookies.set(name, value));
        // a resposta é refeita porque os headers da requisição mudaram
        res = seguir();
        lista.forEach(({ name, value, options }) => {
          res.cookies.set(name, value, options);
          gravados.push({ name, value, options });
        });
      },
    },
  });

  // getUser() valida o token no Auth (e renova se estiver vencido); não dá para confiar só no cookie
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { pathname } = req.nextUrl;
  const naTelaLogin = pathname === "/login";
  // sem sessão: página pública passa, o resto vai para o login
  if (!user && !rotaPublica(pathname)) {
    // escrita (Server Action) recebe 401 em vez de redirect, que o fetch não seguiria
    if (req.method !== "GET" && req.method !== "HEAD") {
      const negado = new NextResponse("Login necessário", { status: 401 });
      negado.headers.set("Content-Security-Policy", politica);
      return negado;
    }
    // clone() mantém a origem (e o host atrás de proxy); search vazio evita arrastar a query
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
  const foraDoLugar =
    user && !rotaLogado(pathname) && (naTelaLogin || pathname === "/cadastro" || (!ehEquipe(user) && !rotaPublica(pathname) && !rotaCliente(pathname)) || (ehEquipe(user) && rotaCliente(pathname)));
  if (foraDoLugar) {
    // mesma regra: escrita não é redirecionada, senão a ação cairia na tela de destino
    if (req.method !== "GET" && req.method !== "HEAD") {
      const negado = new NextResponse("Sem acesso", { status: 403 });
      negado.headers.set("Content-Security-Policy", politica);
      return negado;
    }

    // cada papel vai para o seu início: equipe em /vendas, cliente em /conta
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

// Ficam fora do proxy: assets do Next, ícones, manifest e sw.js (não pode ser redirecionado)
// e /api/health, que precisa responder sem sessão.
export const config = { matcher: ["/((?!_next/|icons/|api/health|manifest.webmanifest|icon.png|apple-icon.png|sw.js).*)"] };
