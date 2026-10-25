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
Carregamento = skeleton: cada rota tem `loading.js` montado com as peças de `components/Skeleton.js`.

**PC (≥ 1024px):** as abas viram menu lateral (CSS em `globals.css`); o item Painel (`so-pc`) só aparece no PC.
`/painel` (gerente e sócia; vendedor vai para Resumos) é a única tela larga (`.content:has(.painel)`, 1200px):
contas puras em `lib/painel.js`, geometria em `lib/graficos.js`, gráficos SVG sem biblioteca em `components/Graficos.js`
(cores validadas: azul `#2a78d6` = série 1, laranja `#eb6834` = série 2). Função não passa de server para client:
a página calcula e entrega só dados ao `PainelClient`.

**PWA:** `app/manifest.js` + `public/sw.js` (navegação pela rede, `/offline` sem conexão; cache só de `/_next/static` e ícones),
registrado por `components/RegistrarSW.js` só em produção. `sw.js` fica fora do matcher do `proxy.js`.

## Regras de negócio

- Venda com vários itens (mig. 027): cada item é uma linha de `vendas` (custo, comissão, parcelas e estoque são por item); `grupo_id` liga os itens lançados juntos (null = um item só). Pagamento/parcelas/data/obs são os mesmos na criação (`registrarVenda({ itens, ... })`, um único insert; saldo conferido pela soma por produto); a lista agrupa por `grupo_id`, excluir um grupo apaga todos os itens, editar é item a item. Custo e % de comissão são fotografados por trigger (`vendas_preencher`).
- Comissão = % (padrão 40) do **lucro** da venda; prejuízo não gera comissão negativa.
- Pagamento: `a_vista` ou `cartao` (sem Pix). Só cartão parcela (1–12x). `parcelas` guarda uma linha por
  parcela (trigger `vendas_gerar_parcelas`; cartão: 1ª no dia 8 do mês seguinte à venda ou em `vendas.primeiro_vencimento` (mig. 035), as demais mês a mês; à vista: na data da venda) com a fatia da comissão; nos Resumos
  a comissão conta no **vencimento da parcela**, não na data da venda.
- Estoque = compras − vendas + diferença das contagens (view `estoque_atual`). Não vende acima do saldo.
- **Quem mexe no quê (mig. 036, auditoria em `docs/auditoria-seguranca.md`):** vendedor e sócia editam/excluem **só a própria venda, até 48 h depois de lançada**
  (conta `created_at`, não a data da venda); depois disso só o gerente, a qualquer momento. A sócia não ganha poder de gerente. Regra no banco
  (`pode_mexer_venda()` nas policies `vendas_editar`/`vendas_apagar`), espelhada em `lib/vendas.js` para mensagem e botões. Como a exclusão é lógica
  (o DELETE não devolve linhas), `excluirVenda` confere antes de apagar. **Compras: só o gerente lança e exclui** (aba Compras some para os outros). **Contagem de estoque: só gerente e sócia** (aba some para o vendedor; mig. 037, policy `contagens_criar` com `eh_resumo_completo()`).
  O banco, não a Server Action, é quem garante: saldo (trigger `vendas_checar_saldo`, com lock por produto), `quantidade_sistema` da contagem
  (trigger `contagens_preencher`), transições do pedido (`pedidos_validar_status`: `entregue` só com venda real, ligada a um pedido só) e `INSERT` por
  coluna em `vendas`/`compras`/`contagens_estoque` (autoria, custo/comissão e `apagado_*` não vêm do navegador; coluna nova que o app envia precisa de `grant insert`).
- Custo do produto (`produtos.custo`) = **custo médio móvel sobre o saldo**: a cada compra lançada/excluída,
  `recalcular_custo_medio` refaz o histórico em ordem cronológica (compra: `(saldo×custo + qtd×custo da compra) /
(saldo + qtd)`; venda e contagem só mexem na quantidade; saldo ≤ 0 antes da compra → custo da compra).
  Sem compras, vale o custo digitado no cadastro; depois da 1ª compra a edição manual do custo é ignorada
  (trigger `produtos_bloquear_custo_manual`, liberado só dentro do recálculo via `app.recalculando_cmp`).
- Lucro líquido = lucro bruto − comissões − despesas (compras não entram de novo: o custo já está na venda).
- **Despesa/compra no cartão (mig. 034):** `cartoes` (nome, `dia_fechamento`/`dia_vencimento` 1–28, `ativo`; só o gerente cadastra, aba Cartões em Saídas;
  não se apaga, desativa) e `despesas`/`compras` com `cartao_id` (null = à vista) e `parcelas` (1–12, só cartão). **Competência × caixa:** o lucro
  conta na `data` do gasto; o caixa (`resumo_acumulado`) conta em `saidas_parcelas.vencimento` (trigger `saidas_gerar_parcelas`, à vista = 1 parcela
  na própria data). Fatura: gasto com dia ≥ fechamento cai na seguinte; vence no mesmo mês do fechamento se vencimento > fechamento, senão no
  seguinte (`vencimento_fatura()` no banco, espelhada em `lib/cartao.js`). Mudar os dias do cartão não refaz o que já foi lançado.
  `resumo_acumulado` devolve `cartao_a_pagar` (gasto até a data que vence depois dela), mostrado nos Resumos.
- Lançamentos dos sócios (`lancamentos`, aba em Saídas, só gerente): `pro_labore`, `pagamento_comissao` (exige
  vendedor), `saque`, `aporte`, `capital_inicial`, `repasse` (exige vendedor: dinheiro das vendas que ele entregou ao gerente; não mexe no caixa total; o vendedor lê só os próprios; Resumos mostra recebido/entregue/pendente = parcelas vencidas − repasses). Só o **pró-labore** entra no lucro líquido; os demais ficam na "Movimentação de caixa"
  dos Resumos. Resumos tem aba Mês com setas ‹ › (`?p=mes&m=AAAA-MM`; mês corrente vai só até hoje).
- Resumos (gerente) tem o card "Acumulado até <fim do período>" via função `resumo_acumulado(ate)` (mig. 012):
  **saldo = caixa real**: recebido (parcelas vencidas) + capital inicial + aportes − compras − despesas − saques − pró-labore − comissões pagas.
  Aparece em destaque no topo e na "Movimentação de caixa" (saldo anterior = `resumo_acumulado(de − 1 dia)`; passa de um período para o outro). Mig. 013/014 acrescentaram `recebido`, `compras` e `capital_inicial`.
- Papel **socia** (mig. 018, ex.: Glasi): tem acesso de **vendedor** (despesas/lançamentos/resumo geral seguem só do gerente, `eh_gerente()`; mig. 019) e **sempre ganha comissão**:
  além da comissão normal nas próprias vendas, recebe `comissao_pct` do perfil dela sobre o lucro das vendas de **todos os outros** vendedores,
  como adicional (não sai da comissão do vendedor). Fotografada na venda (`socia_id`, `socia_pct`, `comissao_socia`), parcelada em `parcelas.comissao_socia`,
  somada em Comissões/lucro líquido/caixa e listada no Resumos como a comissão dela. Vendas anteriores à 018 não têm comissão de sócia. Uma sócia só (a mais antiga).
- Dois papéis básicos (`perfis.papel`): **gerente** vê e cadastra despesas e vê o resumo de todos os vendedores;
  **vendedor** não vê custo nem lucro por venda (só a própria comissão), nem detalhes da venda de outro vendedor (só nome do vendedor), nem "Margem bruta" nos Resumos; não acessa despesas (aba some em Saídas, Server Action recusa) e no resumo só vê as
  próprias vendas/comissão (sem despesas, lucro líquido ou comparativo entre vendedores). Só o admin
  altera `papel`/`comissao_pct` (SQL/painel ou `--` do `criar-usuario`).
- **Categorias e fotos (mig. 029):** `categorias` (nome, ordem, foto, ativo; só o gerente cadastra, aba Categorias no Estoque)
  e `produtos.categoria_id`/`foto_url`/`descricao` (sem categoria = "Outros"; excluir a categoria solta os produtos).
  Fotos no bucket público `fotos` (só o gerente envia; até 2 MB): o navegador reduz para WebP 800px (`lib/imagem.js`)
  e a Server Action `enviarFoto` sobe; `foto_url` só aceita endereço desse bucket. O CSP libera `img-src` para o Supabase.
- **Vitrine pública (mig. 030):** `/` (`app/(loja)/page.js`) abre sem login; rotas públicas em `lib/rotas.js` (`/`, `/login`,
  `/cadastro`, `/offline`, que aceitam POST para a Server Action). O anon não lê tabela nenhuma: só as RPCs `vitrine()` (ativos de categoria
  ativa, preço, foto, `esgotado` e `restam` — saldo só quando é de 1 a 10, senão null; trava o "+" do carrinho via `limiteDe` de `lib/pedido.js`; nunca custo nem saldo exato) e `criar_pedido()` (security definer: refaz preço pelo banco, recusa
  esgotado/acima do saldo/repetido, limita 3 pedidos por telefone, 5 por rede (IP em HMAC, `pedidos.ip_hash`, IPv6 pelo /64) e 30 no total a cada 10 min; erro `P0001` = mensagem para o cliente; **só a service role executa** (mig. 036): a Server Action `criarPedido` chama pelo `criarAdmin()`, então sem `SUPABASE_SERVICE_ROLE_KEY` o site não grava pedido).
  Carrinho no `localStorage` do cliente (`lib/pedido.js`); depois de gravar, abre o `wa.me` do `WHATSAPP_LOJA` (variável de
  ambiente do servidor; vazia = só grava). `pedidos` (status `novo → confirmado → pronto → entregue`, ou `cancelado`; regras em
  `mudancaValida`/`proximoStatus` de `lib/pedido.js`): a equipe lê e só altera status/atendimento (grants por coluna). Em Vendas,
  "Pedidos da loja" mostra os abertos com o botão do próximo passo; "Lançar venda" → `/vendas?pedido=<id>` abre o `FormVenda`
  preenchido e `registrarVenda({ pedidoId })` marca **entregue** com `venda_ref` (grupo_id ou id da venda) — entregue só sai por aí,
  para o estoque baixar; `atualizarPedido` confirma/marca pronto/cancela/reabre (entregue não volta: exclua a venda).
- **Cliente com conta (mig. 031/032):** papel `cliente` em `perfis` (padrão do cadastro aberto em `/cadastro`; nome + WhatsApp + e-mail +
  senha). O papel vive em dois lugares, sincronizados por gatilho: `perfis.papel` (RLS/telas) e `app_metadata.papel` do Auth (o
  `proxy.js` lê do `getUser()` sem consultar o banco; `ehEquipe()`/`inicioDe()` de `lib/rotas.js`). Só o admin muda papel (script,
  painel do Supabase ou SQL em `perfis`); `user_metadata` é do usuário e nunca vale para papel. Cada tabela da equipe tem uma policy
  **RESTRICTIVE `so_equipe`** (`eh_equipe()`), então tabela nova da equipe precisa ganhar a sua; o cliente só vê o próprio perfil e os
  pedidos com `cliente_id` dele. Proxy: cliente fica em `/`, `/conta` e telas públicas; equipe não usa `/conta`. `executar()` de
  `app/actions.js` recusa quem não é da equipe; as ações do cliente ficam em `app/conta`, `app/loja` e `app/push`. Listas de
  vendedores filtram `papel in PAPEIS_EQUIPE`. Pedido feito logado guarda `cliente_id` (a vitrine preenche nome/WhatsApp do perfil).
- **Push (Web Push/VAPID):** `push_inscricoes` (uma por aparelho, endpoint único). `components/AtivarAvisos.js` pede permissão,
  inscreve no `pushManager` do `sw.js` e grava pela Server Action `ativarAvisos`; o envio (`lib/push.js`, `web-push`) usa a
  service role (`lib/supabase/admin.js`, `server-only`) e roda em `after()` para não atrasar a resposta. Pedido novo → toda a equipe;
  mudança de status → o cliente dono. Inscrição 404/410 é apagada. O endpoint só vale se for de serviço de push de navegador (`lib/push-endpoint.js` + constraint `push_inscricoes_endpoint_host`); o usuário não insere direto na tabela, só a Server Action. Variáveis: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`,
  `VAPID_SUBJECT` e `SUPABASE_SERVICE_ROLE_KEY` (sem elas, simplesmente não avisa). iPhone só recebe com o app instalado (iOS 16.4+).

## Banco e auth

- Supabase **próprio da Lojinha**. NUNCA usar o projeto BarAppChapeu (é do app do bar).
- Auth: Supabase Auth (e-mail/senha), sessão por cookie (`@supabase/ssr`). Dados pelo servidor, com o
  usuário logado, sob RLS (`lib/supabase/server.js`, Server Actions em `app/actions.js`).
- Projeto Supabase da Lojinha: ref `modldgphwfzjarydzolx` (o mesmo de `NEXT_PUBLIC_SUPABASE_URL` em `.env.local`).
- Schema em `db/schema.sql` (estado atual completo); mudanças em `supabase/migrations/<timestamp>_nome.sql` (formato da
  Supabase CLI; as antigas 003–032 foram renomeadas, o número original continua no nome do arquivo), sempre
  refletidas no schema. Nova migração: `npx supabase migration new nome`. `db/migracoes/` guarda só a 001 e a 002
  (anteriores ao histórico do banco). Produção está em dia até a 035 `vencimento_dia8`; a 037 `contagem_so_gerente_socia` entra pelo workflow junto com o deploy; a 036 `seguranca_auditoria` entra pelo workflow, colada no deploy do app (entre um e outro, pedido da loja e contagem de estoque falham: a assinatura de `criar_pedido` e o `INSERT` de contagem mudaram); confira `SUPABASE_SERVICE_ROLE_KEY` na Vercel antes; migrações novas entram pelo workflow manual
  `.github/workflows/db.yml` (só produção; o dev em rede local recebe por `db push --db-url`) (secrets `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_ID`; rode
  primeiro com dry_run). CI de lint/testes em `ci.yml`. Passo a passo de migrações e das chaves VAPID/variáveis de
  ambiente em `docs/supabase-e-vapid.md` (nomes das variáveis em `.env.example`). Confira com `npx supabase migration list` ou o MCP
  (`list_migrations`) antes de criar a próxima. Funções de trigger têm `execute` revogado de
  anon/authenticated; funções que chamam outras revogadas precisam ser `security definer`.
- **Edição pelo gerente (mig. 023):** custo de produto só o gerente vê/edita no cadastro (Estoque); contagens (`contagens_estoque`, agora com exclusão lógica) e compras/lançamentos (Saídas) são editáveis pelo gerente em colunas limitadas (contagem: data/contada/observação; compra: data/quantidade/custo/fornecedor; lançamento: data/valor/descrição/vendedor), com checagem na Server Action para não deixar o estoque negativo; editar compra/contagem refaz o custo médio por trigger.
- **Exclusão lógica + log (mig. 021):** `vendas`, `compras`, `despesas` e `lancamentos` nunca são apagadas de verdade: o trigger `apagar_suave` transforma o `DELETE` em `apagado_em`/`apagado_por`, e uma policy restritiva esconde as apagadas do app (o código do app continua usando `.delete()`). Efeitos derivados reagem: compra apagada/restaurada refaz o custo médio, venda apagada perde as parcelas (restaurar regera), `estoque_atual` e `resumo_acumulado` filtram `apagado_em is null`. Restaurar: tela `/log` (gerente, link no fim de Resumos) chama a Server Action `restaurarRegistro` → RPC `restaurar_registro` (mig. 022, security definer; venda só volta se houver saldo em estoque); apagar de verdade exige desligar o trigger. `log_auditoria` (só o gerente lê; o app não escreve) guarda criou/editou/apagou/restaurou com `antes`/`depois` via trigger `auditar` em vendas, compras, despesas, lançamentos, produtos, contagens e categorias (edição guarda só as colunas alteradas; recálculo automático do custo médio não é logado). Como `apagado_por` liga essas tabelas a `perfis` uma 2ª vez, embed do PostgREST precisa de hint: `perfis!vendas_vendedor_id_fkey(nome)` (sem ele a consulta falha e a lista vem vazia). Query nova que ignora a RLS (função `security definer`) precisa filtrar `apagado_em is null`.
- Usuários da equipe: `npm run criar-usuario -- "Nome" email senha [comissao] [papel]` (papel: gerente|vendedor|socia, padrão vendedor; grava o papel no `app_metadata`). Cliente se cadastra sozinho em `/cadastro`.

## Qualidade

- `npm run lint` (ESLint 9 + `eslint-config-next`, config em `eslint.config.mjs`) e `npm test` (runner nativo do Node, testes em `tests/`).
  Rode os dois antes de commitar. Lógica pura vai em `lib/` e ganha teste; `set-state-in-effect` está desligada de propósito (data local só no navegador).
