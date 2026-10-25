# Manual da Lojinha A&G

Como usar o app, tela por tela, e de onde vem cada número.

- **Parte 1 — Uso do app:** para a equipe e para o gerente. Linguagem do dia a dia.
- **Parte 2 — Apêndice técnico:** fórmulas, tabelas, gatilhos e regras do banco. Para quem mantém o app.

A tabela completa de quem pode o quê está em [papeis-e-permissoes.md](papeis-e-permissoes.md).

---

# Parte 1 — Uso do app

## 1. Ideias básicas

- **O app só conhece vendas, compras, despesas e lançamentos.** Ninguém digita saldo de banco: o caixa é calculado a partir do que foi lançado.
- **Todo produto tem custo e preço.** O lucro de cada venda é preço − custo, e o custo é "fotografado" na hora da venda. Mudar o custo depois não altera vendas antigas.
- **Comissão é sobre o lucro, não sobre o valor vendido.** O padrão é 40% do lucro. Venda no prejuízo não gera comissão negativa.
- **Cartão parcela, à vista não.** Pagamento é **À vista** ou **Cartão** (de 1 a 12x). O dinheiro do cartão entra no caixa em cada parcela, no vencimento. A comissão também cai parcela a parcela.
- **Nada é apagado de verdade.** Venda, compra, despesa e lançamento excluídos ficam guardados. O gerente pode restaurar em **Histórico de alterações**.
- **Datas são de Brasília.** "Hoje" é o dia no Brasil, mesmo de madrugada.

### Os papéis

| Papel | Quem é | Resumo do acesso |
| --- | --- | --- |
| **Vendedor** | Equipe de vendas | Lança vendas e vê só a própria comissão. Não vê custo nem lucro. |
| **Sócia** | A sócia (uma só) | Acesso de vendedor + Resumos completo, Painel e CRM (só leitura) + contagem de estoque. Ganha comissão extra sobre as vendas dos outros. |
| **Gerente** | Dono do dia a dia | Tudo: produtos, custo, compras, despesas, cartões, lançamentos, histórico. |
| **Cliente** | Quem compra pela vitrine | Faz pedidos e acompanha os próprios em **Minha conta**. |

Só o administrador do banco muda o papel e a % de comissão de alguém.

### Celular e computador

- **No celular**, as abas ficam no rodapé: **Vendas · Estoque · Saídas · Resumos** (Saídas só o gerente vê).
- **No computador** (tela de 1024 px ou mais), as abas viram um menu lateral, com duas a mais: **Painel** e **CRM**, que só aparecem para gerente e sócia.
- **Pode instalar como app.** No celular, "Adicionar à tela inicial". Sem internet, abre uma tela de aviso.

---

## 2. Vitrine, pedidos e conta do cliente (público)

### Vitrine (`/`)
Abre sem login e mostra os produtos ativos com foto, preço e categoria.
- **"Esgotado"** aparece quando não há saldo.
- **"Restam N"** aparece quando o saldo está entre 1 e 10. O "+" do carrinho trava nesse limite.
- **Custo e saldo exato nunca aparecem.**

### Carrinho e pedido
1. O cliente monta o carrinho. Ele fica guardado no próprio celular do cliente.
2. Informa nome e WhatsApp e envia.
3. O pedido é gravado com os preços do banco, mesmo que o cliente tenha mexido na página.
4. Se a loja tiver WhatsApp configurado, abre a conversa com o resumo do pedido.

Há limites contra abuso: 3 pedidos por telefone, 5 por rede e 30 no total a cada 10 minutos.

### Cadastro, login e senha
- **Criar conta:** em `/cadastro`, com nome, WhatsApp, e-mail e senha. Quem se cadastra sozinho é sempre cliente.
- **Senha esquecida:** "Esqueci a senha" manda um link por e-mail.

### Minha conta (`/conta`, só cliente)
Dados do cliente e a lista dos pedidos dele, com a situação de cada um. Com os avisos ativados, o cliente recebe no celular cada mudança de situação. No iPhone, só com o app instalado (iOS 16.4 ou mais novo).

---

## 3. Vendas (`/vendas`)

### Pedidos da loja
No topo aparecem os pedidos da vitrine ainda em aberto. Cada um passa por:

**Recebido → Confirmado → Pronto → Entregue**, ou **Cancelado**.

- O botão principal avança para o próximo passo.
- **Cancelar** vale enquanto o pedido está aberto, e um cancelado pode ser reaberto.
- **"Entregue" só acontece por "Lançar venda".** Esse botão abre a venda já preenchida com os itens, o preço e o cliente do pedido. Ao registrar, o estoque baixa e o pedido vira Entregue.
- **Para desfazer uma entrega**, exclua a venda.

### Nova venda
1. **Produto, quantidade e preço.** O preço vem do cadastro e pode ser mudado (desconto ou acréscimo).
2. **"+ Adicionar outro item"** põe mais produtos na mesma venda.
3. **Pagamento:** à vista ou cartão. No cartão, escolha as parcelas. A 1ª vence no **dia 8 do mês seguinte**, mas a data pode ser alterada; as demais vencem mês a mês.
4. **Cliente (opcional):** WhatsApp e nome.
   - Se o WhatsApp já for conhecido, o nome é sugerido sozinho.
   - Com cliente, a venda entra no histórico dele, no **CRM**.
   - Venda de pedido já vem com o cliente.
5. **Data e observação.**

O resumo embaixo mostra:
- **Total.**
- **Desconto:** preço de tabela − preço praticado. Negativo quando vendeu acima da tabela.
- **Lucro:** só gerente e sócia veem.
- **Sua comissão:** com o valor por mês, quando é parcelada.
- **Alerta vermelho** quando algum item está abaixo do custo.

Não dá para vender mais do que há em estoque. O banco confere, inclusive se duas pessoas venderem o mesmo produto ao mesmo tempo.

### Lista "Últimos 7 dias"
Toque numa venda para ver os detalhes: vendedor, cliente, observação, parcelas e, para gerente e sócia, custo, lucro e comissões. A venda de outro vendedor aparece para o vendedor só com o nome de quem vendeu.

- **Editar:** abre o formulário no próprio item. Venda com vários itens é editada item a item. O cliente vale para a venda toda.
- **Excluir:** apaga a venda inteira, com todos os itens.
- **Quem pode mexer:**
  - Vendedor e sócia: só nas vendas que **eles lançaram**, até **48 horas** depois do lançamento. Conta a hora em que a venda foi lançada, não a data dela.
  - Gerente: em qualquer venda, a qualquer momento.

---

## 4. Estoque (`/estoque`)

Tem quatro abas: **Produtos · Compras · Contagem · Categorias**.

### Produtos
Lista por categoria, com o saldo de cada produto. O gerente cadastra e edita: nome, unidade, custo, preço, categoria, foto, descrição e ativo/inativo.

**O custo segue a média das compras.** Depois da 1ª compra, ele passa a ser a média ponderada sobre o saldo, recalculada a cada compra. A partir daí a edição manual do custo é ignorada. Produto inativo some da venda e da vitrine.

### Compras (só gerente)
Entrada de mercadoria: produto, quantidade, custo unitário, fornecedor e forma de pagamento (à vista ou num cartão cadastrado, em até 12x).
- A compra **aumenta o estoque** e **refaz o custo médio**.
- **Não entra no lucro**, porque o custo já entra quando a mercadoria é vendida.
- **No caixa**, sai na data (à vista) ou no vencimento de cada fatura (cartão).

### Contagem (gerente e sócia)
Use quando contar a prateleira:
1. Escolha o produto. A tela mostra quanto o sistema calcula.
2. Digite quanto foi contado. A **diferença** ajusta o estoque.
3. **Se houver diferença, diga o motivo:**
   - **Perda:** sumiu, venceu.
   - **Quebra:** estragou, quebrou.
   - **Erro de lançamento:** uma venda ou compra foi lançada errada.
   - **Outro.**

O motivo separa prejuízo real de correção de cadastro. As faltas aparecem em **Resumos → Estoque → Perdas**. Só o gerente edita ou exclui uma contagem; excluir desfaz o ajuste.

### Categorias (só gerente)
Nome, ordem, foto e ativa/inativa. Produto sem categoria aparece como "Outros". Excluir uma categoria não apaga os produtos, só os solta da categoria.

---

## 5. Saídas (`/saidas`, só gerente)

### Despesas
Tipo (gasolina, alimentação, pedágio, aluguel, água, luz, internet, outros), descrição, valor, data e forma de pagamento.
- **No lucro**, conta na data do gasto.
- **No caixa**, sai na data (à vista) ou no vencimento da fatura (cartão).

### Lançamentos dos sócios
| Tipo | O que é | Entra no lucro? |
| --- | --- | --- |
| **Pró-labore** | Retirada combinada do sócio | **Sim** (desconta do lucro líquido) |
| **Pagamento de comissão** | Comissão paga a um vendedor | Não (já está nas comissões) |
| **Saque** | Retirada fora do pró-labore | Não |
| **Aporte** | Dinheiro posto na loja | Não |
| **Capital inicial** | Dinheiro do começo da loja | Não |
| **Repasse** | Vendedor entregou ao gerente o dinheiro das vendas | Não. Só mostra quanto ainda está com o vendedor. |

Pagamento de comissão e repasse exigem escolher o vendedor.

### Cartões
Nome, dia de fechamento e dia de vencimento (1 a 28). Cartão não se apaga, se desativa.
- **Fatura:** gasto no dia do fechamento ou depois cai na fatura seguinte.
- **Mês do vencimento:** a fatura vence no mesmo mês do fechamento quando o dia de vencimento é maior que o de fechamento; senão, no mês seguinte.
- Mudar os dias do cartão não refaz o que já foi lançado.

---

## 6. Resumos (`/resumos`)

Sempre **um mês por vez**, com as setas ‹ › para trocar. O mês corrente vai só até hoje. **Meses futuros** podem ser abertos para ver o que vai vencer, e lá o saldo aparece como **"Saldo projetado"**.

O vendedor vê só as próprias vendas, comissão e repasse. Gerente e sócia veem tudo, menos o link do Histórico, que é só do gerente.

### 01 · Visão geral
| Número | De onde vem |
| --- | --- |
| **Saldo em <data>** | Caixa acumulado desde o começo até o fim do mês (ver 03 · Caixa). Em mês futuro: **Saldo projetado**. |
| **Cartão a pagar** | Gastos no cartão até a data que ainda vão vencer depois dela. "Sobra" = saldo − cartão a pagar. |
| **Vendas** | Soma de quantidade × preço das vendas com data no mês. |
| **Lucro líquido** | Ver 02 · Resultado. |
| **Margem líquida** | Lucro líquido ÷ vendas. |
| **Comissões / Sua comissão** | Comissões das **parcelas que vencem no mês**, inclusive a comissão extra da sócia. |
| **Ticket médio** | Vendas ÷ número de vendas. Venda com vários itens conta uma vez. |

**Por que as datas não batem.** Vendas e lucro contam na data da venda; a comissão conta no vencimento da parcela. Num mês com muita venda parcelada, a comissão do mês fica menor e a margem, maior. A diferença aparece nos meses seguintes.

### Dinheiro com os vendedores / Seu repasse
Para cada vendedor:
- **Recebido:** parcelas das vendas dele já vencidas, do começo até o fim do mês e nunca depois de hoje.
- **Entregue:** repasses lançados.
- **Pendente** = recebido − entregue. É o dinheiro das vendas que ainda está com ele.
- **Comissão a receber** = comissão das parcelas vencidas − comissão já paga.
- **Limpo** = pendente − comissão a receber. É o que ele ainda deve entregar se a comissão for acertada com esse dinheiro.

### 02 · Resultado (só gerente)
```
  Receita
− CMV (custo das mercadorias vendidas, fotografado em cada venda)
= Lucro bruto
− Comissões (no vencimento das parcelas)
− Despesas (na data do gasto; toque para ver por tipo)
− Pró-labore
= Lucro líquido
```
Compras **não** entram aqui: o custo delas já está no CMV de cada venda.

### 03 · Caixa
```
  Saldo inicial (caixa até o dia anterior ao 1º do mês)
+ Entradas: vendas recebidas, capital inicial, aportes
− Saídas: compras, despesas, saques, pró-labore, comissões pagas
= Saldo final (ou Saldo projetado, em mês futuro)
```
- **Vendas recebidas:** à vista conta na data da venda; cartão, no vencimento de cada parcela.
- **Despesas e compras no cartão** saem no vencimento da fatura.
- O saldo final de um mês é o saldo inicial do seguinte.
- **Não é o saldo do banco.** O app supõe que toda parcela vencida caiu na conta.

### 04 · Estoque
| Número | De onde vem |
| --- | --- |
| **Estoque a custo** | Saldo × custo atual, só de produtos **ativos** com saldo. É o mesmo número do Painel. Posição de hoje, não do mês escolhido. |
| **Estoque a venda** | Saldo × preço, só dos ativos. |
| **Margem potencial** | A venda − a custo, em R$ e em % do valor a venda. |
| **Compras do mês × CMV** | Mercadoria comprada no mês contra o custo do que foi vendido. Compras acima do CMV (em vermelho) = o estoque cresceu. |
| **Perdas na contagem (aprox.)** | Faltas achadas nas contagens do mês, por motivo, ao custo **atual** do produto. É aproximado porque o custo da contagem não é guardado. |

### 05 · Performance
- **Por vendedor, de quem mais vendeu para quem menos:** número de vendas, valor vendido e, só para o gerente, o lucro de cada um (comparar lucro entre vendedores é só do gerente; a sócia vê o valor vendido, mas não o lucro dos outros).
- **Comissão do mês:** é a das parcelas que vencem no mês.
- **Comissão paga / a pagar:** só gerente e sócia veem.
- **Sem venda no mês:** quem não vendeu mas tem comissão de parcelas antigas aparece como "sem venda no mês · comissão de parcelas anteriores". A sócia aparece como "comissão sobre as vendas da equipe".
- **Produtos que mais deram lucro** (gerente e sócia): os 5 de maior lucro, com a margem. O vendedor vê **Mais vendidos**, por quantidade.
- **Lucro por categoria** (gerente e sócia).

### 06 · Indicadores
| Indicador | Conta | Como ler |
| --- | --- | --- |
| **Margem de contribuição** | (lucro bruto − comissões) ÷ vendas | O que cada R$ 1 vendido deixa para pagar as despesas. |
| **Ponto de equilíbrio** | despesas ÷ margem de contribuição | Faturamento do mês em que tudo se paga e não sobra nada. Mostra quanto falta. |
| **Margem mínima** | despesas ÷ vendas | Quanto de cada R$ 1 as despesas comem. Verde quando a margem de contribuição **cobre** esse valor. |
| **Meta do mês** | sobrar **20% do lucro bruto** antes do pró-labore | Mostra quanto sobra hoje, quanto deveria sobrar, o faturamento que bate a meta e o % atingido. |

Ponto de equilíbrio e meta supõem que o resto do mês terá a mesma margem do que já foi vendido.

### 07 · Demonstrativo (só gerente)
É o Resultado em tabela, com cada linha em % da receita e em % do lucro bruto.

### Histórico de alterações (`/log`, só gerente)
Quem criou, editou, apagou ou restaurou vendas, compras, despesas, lançamentos, produtos, contagens e categorias, com o antes e o depois. **Restaurar** traz de volta o que foi apagado. Uma venda só volta se ainda houver estoque.

---

## 7. Painel (`/painel`, só no computador; gerente e sócia)

**Período:** Mês (com setas, sem meses futuros), 30 dias, 90 dias ou Ano.

**Indicadores do topo:**
- Vendas, lucro bruto, margem bruta, lucro líquido, número de vendas, ticket médio, comissões, despesas.
- **Caixa no fim do período.**
- **Pedidos novos** da loja.

**Com o que cada variação ▲▼ compara** (o subtítulo diz):
| Período | Compara com |
| --- | --- |
| Mês | o mês anterior, do dia 1 até o mesmo dia ("vs. set/2026 até dia 25"). Mês fechado compara com o mês anterior inteiro. |
| Ano | as mesmas datas do ano passado. |
| 30 / 90 dias | os 30 / 90 dias imediatamente antes. |

### Blocos
- **A receber e a pagar (a partir de amanhã):** independe do período escolhido.
  - **A receber:** parcelas de vendas no cartão que ainda vão vencer, com as comissões embutidas.
  - **Cartão a pagar:** faturas de despesas e compras.
  - **Caixa hoje.**
  - **Saldo projetado mês a mês** = caixa de hoje + a receber − comissões dessas parcelas − faturas.
  - Não inclui vendas e despesas que ainda não foram lançadas.
- **Vendas e lucro por dia** (ou por mês, no Ano). Passe o mouse para ver os valores, ou abra "Ver em tabela".
- **Por categoria, por vendedor, 10 produtos que mais venderam, forma de pagamento.**
- **Estoque:**
  - **Parado a custo:** saldo × custo dos ativos.
  - **Esgotados:** ativos com saldo zero ou negativo.
  - **Sem venda no período:** ativos com saldo que não venderam nada, os de mais dinheiro parado primeiro.
- **Produtos vendidos no período:** tabela com quantidade, custo, vendas e margem. Clique no título da coluna para ordenar.

---

## 8. CRM (`/crm`, só no computador; gerente e sócia)

### Quem é cliente
É quem teve **nome e/ou WhatsApp informados numa venda**. Venda de pedido da vitrine já traz o cliente.
- O mesmo WhatsApp é o mesmo cliente, com ou sem o 55 na frente.
- Cliente com conta na vitrine é reconhecido pela conta.
- Sem WhatsApp, as vendas são juntadas pelo nome.
- **Venda sem cliente não entra no CRM.** Por isso vale pedir o WhatsApp no balcão.

**Período:** igual ao do Painel.

### Indicadores do topo
| Número | De onde vem |
| --- | --- |
| **Clientes que compraram** | Clientes com pelo menos uma compra no período. **Novos** = primeira compra da vida no período. **Voltaram** = já tinham comprado antes. |
| **Clientes no cadastro** | Todos que já apareceram numa venda. |
| **Pedidos da loja entregues** | Pedidos da vitrine feitos no período que viraram venda ÷ todos os pedidos do período. Também mostra os cancelados. |
| **Vendas sem cliente** | % das vendas do período sem nome nem WhatsApp. Quanto menor, mais confiável o CRM. |

### Blocos
- **Clientes:** tabela com gasto no período, total de sempre, número de compras, ticket, última compra e WhatsApp, que abre a conversa.
  - O filtro alterna entre "Compraram no período" e "Todos".
  - Clicar no nome mostra desde quando ele é cliente e o que mais compra.
- **Top 10:** quem mais gastou.
- **Pedidos da loja:** quantos estão em cada situação, quantos seguem abertos, o valor entregue e o tempo médio do pedido até a entrega.
- **Pedidos por dia:** recebidos × entregues.
- **Clientes sumidos:** sem comprar há 30–59, 60–89 e 90 dias ou mais, contados até hoje. Os que mais gastaram aparecem primeiro, com o WhatsApp para chamar.

---

## 9. Avisos no celular
Em Vendas, **"Ativar avisos"** pede permissão ao navegador.
- **A equipe** recebe aviso de cada pedido novo da vitrine.
- **O cliente** recebe as mudanças de situação dos pedidos dele.

---

# Parte 2 — Apêndice técnico

## A. Onde está cada conta

| Assunto | Código |
| --- | --- |
| Resumos (margens, equilíbrio, meta, despesas por tipo, perdas, motivos) | `lib/resumo.js` (`indicadoresResumo`, `despesasPorTipo`, `perdasPorMotivo`, `motivoDaContagem`, `META_SOBRA`, `TIPOS_DESPESA`, `MOTIVOS_CONTAGEM`) |
| Painel (períodos, indicadores, séries, estoque, comparativo, fluxo futuro) | `lib/painel.js` (`periodoPainel`, `periodoAnterior`, `indicadores`, `seriePorTempo`, `somarPor`, `resumoEstoque`, `fluxoFuturo`) |
| CRM (cliente da venda, identidade, recorrência, sumidos, funil) | `lib/crm.js` (`clienteDaVenda`, `chaveTelefone`, `clientes`, `noPeriodo`, `recorrencia`, `sumidos`, `funil`, `seriePedidos`) |
| Leitura sem teto de 1000 linhas | `lib/paginar.js` (`todas`) |
| Regra das 48 h | `lib/vendas.js` + `pode_mexer_venda()` no banco |
| Pedido (carrinho, situações, WhatsApp) | `lib/pedido.js` |
| Fatura do cartão | `lib/cartao.js` + `vencimento_fatura()` no banco |
| 1ª parcela da venda | `lib/parcelas.js` |
| Gráficos SVG | `lib/graficos.js` (geometria) + `components/Graficos.js` |

Toda conta pura tem teste em `tests/` (`npm test`).

## B. Fórmulas

- **Lucro da venda** = `round((preco_unit − custo_unit) × quantidade, 2)`, coluna gerada.
- **Comissão da venda** = `round(max(lucro, 0) × comissao_pct / 100, 2)`. Comissão da sócia: o mesmo com `socia_pct`, só em venda de outro vendedor.
- **Parcelas** (`vendas_gerar_parcelas`): à vista = 1 parcela na data. Cartão = 1ª em `primeiro_vencimento` ou no dia 8 do mês seguinte, depois mês a mês. Valor e comissão são divididos entre as parcelas.
- **Custo médio móvel** (`recalcular_custo_medio`): refaz o histórico em ordem cronológica. Na compra: `(saldo × custo + qtd × custo_compra) ÷ (saldo + qtd)`. Saldo ≤ 0 antes da compra vale o custo da compra. Venda e contagem só mexem na quantidade.
- **Estoque** (`estoque_atual`) = compras − vendas + diferenças das contagens, sem as apagadas.
- **Lucro líquido** = lucro bruto − comissões (no vencimento) − despesas (na data) − pró-labore.
- **Caixa** (`resumo_acumulado(ate)`) = recebido (parcelas com vencimento ≤ ate) + capital inicial + aportes − compras (`saidas_parcelas` com vencimento ≤ ate) − despesas (idem) − saques − pró-labore − comissões pagas. Com `ate` no futuro, conta parcelas que ainda não venceram: por isso "Saldo projetado".
- **Margem de contribuição** = (lucro − comissões) ÷ receita. **Margem mínima** = despesas ÷ receita, que fica OK quando a contribuição é maior ou igual a ela. **Ponto de equilíbrio** = despesas ÷ contribuição.
- **Meta** (receita R em que sobra 20% do lucro bruto): `R × contrib − despesas = 0,2 × R × bruta`, logo `R = despesas ÷ (contrib − 0,2 × bruta)`.
- **Fluxo futuro** (`fluxoFuturo`): parcelas e `saidas_parcelas` com vencimento > hoje, por mês. O saldo acumulado parte do caixa de hoje e soma a receber − comissões − a pagar.
- **Comparativo do Painel** (`periodoAnterior`): mês → mês anterior até o mesmo dia (limitado ao fim do mês), mês fechado → mês anterior inteiro; ano → mesmas datas do ano anterior (29/02 vira 28/02); N dias → os N dias antes.
- **CRM:**
  - Identidade = `cliente_id` → WhatsApp sem o 55 → nome sem acento e minúsculo. Um WhatsApp que já apareceu numa venda com conta vai para a conta.
  - Uma compra = `grupo_id ?? id`. Novo = 1ª compra dentro do período.
  - Sumido = dias desde a última compra ≥ 30 / 60 / 90.
  - Conversão = pedidos entregues ÷ pedidos criados no período (dia de Brasília). Tempo até entregar = `status_em − criado_em` dos entregues.

## C. Banco (Supabase próprio da Lojinha)

- **Schema completo:** `db/schema.sql`. **Migrações:** `supabase/migrations/`, formato da Supabase CLI.
- **Neste pacote:**
  - `20261025130000_clientes_na_venda` (038): `vendas.cliente_nome`, `cliente_telefone` (10 a 13 dígitos) e `cliente_id` → `perfis`. Grants de insert/update por coluna. `cliente_id` só é gravado pela Server Action a partir do pedido.
  - `20261025130100_contagem_motivo` (039): `contagens_estoque.motivo` ∈ perda/quebra/erro/outro. Grants de insert/update.
- **Insert por coluna (036):** coluna nova que o app envia precisa de `grant insert`. Autoria, custo, comissão e `apagado_*` são do banco.
- **Exclusão lógica (021):** o trigger `apagar_suave` transforma DELETE em `apagado_em`. Uma policy restritiva esconde as apagadas. `log_auditoria` guarda tudo.
- **RLS:** cada tabela da equipe tem a RESTRICTIVE `so_equipe`. Despesas e lançamentos: a sócia só lê (028). `saidas_parcelas`: `eh_resumo_completo()`.
- **Embed com hint:** `perfis!vendas_vendedor_id_fkey(nome)`, porque `apagado_por` cria uma 2ª ligação com `perfis`.
- **Limite de linhas:** o PostgREST corta cada resposta em `max_rows` (1000 em `supabase/config.toml`, e o mesmo padrão no projeto). Lista que pode passar disso usa `todas()` com `.order("id").range(a, b)`.

## D. Rotas e acesso

| Rota | Quem | Observação |
| --- | --- | --- |
| `/`, `/login`, `/cadastro`, `/esqueci-senha`, `/offline` | todos | públicas (`lib/rotas.js`) |
| `/conta` | cliente | |
| `/vendas`, `/estoque`, `/resumos` | equipe | o conteúdo varia por papel |
| `/saidas`, `/log` | gerente | |
| `/painel`, `/crm` | gerente e sócia | só no menu do PC (`so-pc`); vendedor é mandado para `/resumos` |

O menu (`components/BottomNav.js`) recebe `gerente` e `socia` do layout, que lê o papel do `app_metadata` do Auth.

## E. Deploy das migrações
Produção recebe migrações pelo workflow manual `.github/workflows/db.yml`: rode primeiro com `dry_run` e só depois de verdade. O dev em rede local recebe por `npm run db:dev`. **Ordem:** primeiro as migrações em produção, depois o deploy do app, porque as telas de Vendas, CRM e Resumos leem as colunas novas. Detalhes em [supabase-e-vapid.md](supabase-e-vapid.md).
