# Lojinha A&G — instruções para o Claude

App de vendas, estoque e comissões, derivado do exemplo em `Exemplo/` (BarApp), mas profissional:
sem saldo bancário digitado, só vendas; todo produto exige **custo e preço**.

## Mobile-first (obrigatório)

Uso no celular: 360–430px primeiro, coluna única (560px), abas no rodapé (`components/BottomNav.js`),
campos ≥ 52px com fonte ≥ 16px, botões de largura total, cartões em vez de tabelas, `:active` em vez de
`:hover`, `safe-area-inset`. Reaproveite as classes de `app/globals.css`. Use `brl()`, `qtd()`, `dataBR()`,
`hoje()` de `lib/formato.js` (nunca `toISOString()` para datas).
Edição acontece **no próprio item** da lista (toque abre o formulário no lugar do item, como em
`EstoqueClient`, ou os detalhes/excluir em `ListaExpansivel`), não num formulário no topo da página.
Campos `type="number"` só aceitam ponto decimal: preencha com `String(valor)`, nunca com vírgula.

## Regras de negócio

- Venda = um item por venda. Custo e % de comissão são fotografados por trigger (`vendas_preencher`).
- Comissão = % (padrão 40) do **lucro** da venda; prejuízo não gera comissão negativa.
- Pagamento: `a_vista` ou `cartao` (sem Pix). Só cartão parcela (1–12x). `parcelas` guarda uma linha por
  parcela (trigger `vendas_gerar_parcelas`, vence data + (k−1) meses) com a fatia da comissão; nos Resumos
  a comissão conta no **vencimento da parcela**, não na data da venda.
- Estoque = compras − vendas + diferença das contagens (view `estoque_atual`). Não vende acima do saldo.
- Custo do produto (`produtos.custo`) = **custo médio móvel sobre o saldo**: a cada compra lançada/excluída,
  `recalcular_custo_medio` refaz o histórico em ordem cronológica (compra: `(saldo×custo + qtd×custo da compra) /
  (saldo + qtd)`; venda e contagem só mexem na quantidade; saldo ≤ 0 antes da compra → custo da compra).
  Sem compras, vale o custo digitado no cadastro; depois da 1ª compra a edição manual do custo é ignorada
  (trigger `produtos_bloquear_custo_manual`, liberado só dentro do recálculo via `app.recalculando_cmp`).
- Lucro líquido = lucro bruto − comissões − despesas (compras não entram de novo: o custo já está na venda).
- Lançamentos dos sócios (`lancamentos`, aba em Saídas, só gerente): `pro_labore`, `pagamento_comissao` (exige
  vendedor), `saque`, `aporte`. Só o **pró-labore** entra no lucro líquido; os demais ficam na "Movimentação de caixa"
  dos Resumos. Resumos tem aba Mês com setas ‹ › (`?p=mes&m=AAAA-MM`; mês corrente vai só até hoje).
- Dois papéis (`perfis.papel`): **gerente** vê e cadastra despesas e vê o resumo de todos os vendedores;
  **vendedor** não acessa despesas (aba some em Saídas, Server Action recusa) e no resumo só vê as
  próprias vendas/comissão (sem despesas, lucro líquido ou comparativo entre vendedores). Só o admin
  altera `papel`/`comissao_pct` (SQL/painel ou `--` do `criar-usuario`).

## Banco e auth

- Supabase **próprio da Lojinha**. NUNCA usar o projeto BarAppChapeu (é do app do bar).
- Auth: Supabase Auth (e-mail/senha), sessão por cookie (`@supabase/ssr`). Dados pelo servidor, com o
  usuário logado, sob RLS (`lib/supabase/server.js`, Server Actions em `app/actions.js`).
- Projeto Supabase da Lojinha: ref `modldgphwfzjarydzolx` (o mesmo de `NEXT_PUBLIC_SUPABASE_URL` em `.env.local`).
- Schema em `db/schema.sql` (estado atual completo); mudanças em `db/migracoes/NNN_*.sql` (001–011), sempre
  refletidas no schema. O banco aplica a partir da 003 pelo histórico do Supabase; confira com o MCP
  (`list_migrations`) antes de numerar a próxima. Funções de trigger têm `execute` revogado de
  anon/authenticated; funções que chamam outras revogadas precisam ser `security definer`.
- Usuários: `npm run criar-usuario -- "Nome" email senha [comissao] [papel]` (papel: gerente|vendedor, padrão vendedor).
- O caminho tem "&": no Windows rode o Next com `node node_modules/next/dist/bin/next ...` (o `npx` quebra).
