# Lojinha A&G — instruções para o Claude

App de vendas, estoque e comissões, derivado do exemplo em `Exemplo/` (BarApp), mas profissional:
sem saldo bancário digitado, só vendas; todo produto exige **custo e preço**.

## Mobile-first (obrigatório)

Uso no celular: 360–430px primeiro, coluna única (560px), abas no rodapé (`components/BottomNav.js`),
campos ≥ 52px com fonte ≥ 16px, botões de largura total, cartões em vez de tabelas, `:active` em vez de
`:hover`, `safe-area-inset`. Reaproveite as classes de `app/globals.css`. Use `brl()`, `qtd()`, `dataBR()`,
`hoje()` de `lib/formato.js` (nunca `toISOString()` para datas).

## Regras de negócio

- Venda = um item por venda. Custo e % de comissão são fotografados por trigger (`vendas_preencher`).
- Comissão = % (padrão 40) do **lucro** da venda; prejuízo não gera comissão negativa.
- Estoque = compras − vendas + diferença das contagens (view `estoque_atual`). Não vende acima do saldo.
- Lucro líquido = lucro bruto − comissões − despesas (compras não entram de novo: o custo já está na venda).
- Todos os usuários têm o mesmo acesso. Só o admin altera `comissao_pct` (SQL/painel).

## Banco e auth

- Supabase **próprio da Lojinha**. NUNCA usar o projeto BarAppChapeu (é do app do bar).
- Auth: Supabase Auth (e-mail/senha), sessão por cookie (`@supabase/ssr`). Dados pelo servidor, com o
  usuário logado, sob RLS (`lib/supabase/server.js`, Server Actions em `app/actions.js`).
- Schema em `db/schema.sql`; mudanças em `db/migracoes/NNN_*.sql`.
- Usuários: `npm run criar-usuario -- "Nome" email senha [comissao]`.
- O caminho tem "&": no Windows rode o Next com `node node_modules/next/dist/bin/next ...` (o `npx` quebra).
