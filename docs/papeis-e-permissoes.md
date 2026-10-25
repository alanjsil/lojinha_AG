# Papéis e permissões

Quem pode o quê na Lojinha A&G. Levantado do código (`app/actions.js`, `lib/rotas.js`, `components/BottomNav.js`, telas em `app/`) e das policies de `db/schema.sql`.

## Os papéis

| Papel         | Onde vive                                      | Quem é                                     | Como se cria                                                        |
| ------------- | ---------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------- |
| **Visitante** | sem login                                      | Qualquer pessoa na internet                | —                                                                   |
| **Cliente**   | `perfis.papel = 'cliente'`                     | Quem comprou/pediu pela vitrine com conta  | Sozinho, em `/cadastro` (papel padrão)                              |
| **Vendedor**  | `perfis.papel = 'vendedor'`                    | Equipe de vendas                           | `npm run criar-usuario -- "Nome" email senha [comissao] [vendedor]` |
| **Sócia**     | `perfis.papel = 'socia'`                       | Sócia (ex.: Glasi). Uma só (a mais antiga) | `criar-usuario … socia`                                             |
| **Gerente**   | `perfis.papel = 'gerente'`                     | Dono/administrador do dia a dia            | `criar-usuario … gerente`                                           |
| **Admin**     | fora do app (painel Supabase/SQL/service role) | Quem mexe no banco                         | —                                                                   |

- **Equipe** = gerente + vendedor + sócia (`PAPEIS_EQUIPE`). Quem não é da equipe e está logado é cliente.
- O papel vive em dois lugares, sincronizados por gatilho: `perfis.papel` (RLS e telas) e `app_metadata.papel` do Auth (o `proxy.js` lê daí). `user_metadata` nunca vale para papel.
- Só o **admin** muda `papel` e `comissao_pct`. Nem o gerente muda. O usuário só edita o próprio nome.

## Telas

| Tela                                       | Visitante | Cliente |    Vendedor    |  Sócia   | Gerente  |
| ------------------------------------------ | :-------: | :-----: | :------------: | :------: | :------: |
| `/` Vitrine                                |    ✅     |   ✅    |       ✅       |    ✅    |    ✅    |
| `/login`, `/cadastro`, `/offline`          |    ✅     |   ✅    |       ✅       |    ✅    |    ✅    |
| `/conta` (dados e pedidos próprios)        |    ❌     |   ✅    |       ❌       |    ❌    |    ❌    |
| `/vendas`                                  |    ❌     |   ❌    |       ✅       |    ✅    |    ✅    |
| `/estoque`                                 |    ❌     |   ❌    |       ✅       |    ✅    |    ✅    |
| `/saidas` (despesas, lançamentos, cartões) |    ❌     |   ❌    |       ❌       |    ❌    |    ✅    |
| `/resumos`                                 |    ❌     |   ❌    |   só o dele    | completo | completo |
| `/painel` (só PC)                          |    ❌     |   ❌    | vai p/ Resumos |    ✅    |    ✅    |
| `/log` (histórico e restaurar)             |    ❌     |   ❌    |       ❌       |    ❌    |    ✅    |

Equipe que abre `/conta` e cliente que abre tela da equipe são redirecionados (`inicioDe()`: equipe → `/vendas`, cliente → `/conta`). A aba Saídas nem aparece no rodapé para quem não é gerente.

## Ações

✅ pode · ❌ não pode · 🔸 só o que é dele.

### Vendas e pedidos

| Ação                                                                  |        Cliente        |    Vendedor    |     Sócia      |   Gerente   |
| --------------------------------------------------------------------- | :-------------------: | :------------: | :------------: | :---------: |
| Fazer pedido pela vitrine                                             | ✅ (visitante também) |       —        |       —        |      —      |
| Ver os próprios pedidos                                               |          🔸           |       —        |       —        |      —      |
| Registrar venda                                                       |          ❌           |       ✅       |       ✅       |     ✅      |
| Ver vendas                                                            |          ❌           |    ✅ todas    |    ✅ todas    |  ✅ todas   |
| Ver detalhes, custo e lucro da venda                                  |          ❌           | 🔸 só comissão |       ✅       |     ✅      |
| Editar venda                                                          |          ❌           | 🔸 até 48 h \* | 🔸 até 48 h \* | ✅ qualquer |
| Excluir venda                                                         |          ❌           | 🔸 até 48 h \* | 🔸 até 48 h \* |     ✅      |
| Ver pedidos da loja, confirmar, marcar pronto, cancelar, lançar venda |          ❌           |       ✅       |       ✅       |     ✅      |
| Ver comissão da sócia na venda                                        |          ❌           |       ❌       |       ✅       |     ✅      |

\* **Janela de 48 h (mig. 036):** vendedor e sócia editam/excluem só a venda que eles lançaram, até 48 h depois do lançamento (conta a hora em que foi lançada, não a data da venda). Depois, só o gerente, a qualquer momento. A sócia não herda poder de gerente. O banco aplica a regra (`pode_mexer_venda`); a tela esconde os botões e mostra o motivo.

### Estoque e produtos

| Ação                                    | Vendedor | Sócia | Gerente |
| --------------------------------------- | :------: | :---: | :-----: |
| Ver produtos e saldo                    |    ✅    |  ✅   |   ✅    |
| Ver **custo** do produto                |    ❌    |  ❌   |   ✅    |
| Cadastrar/editar produto (custo, preço) |    ❌    |  ❌   |   ✅    |
| Categorias e fotos                      |    ❌    |  ❌   |   ✅    |
| Lançar compra                           |    ❌    |  ❌   |   ✅    |
| Editar compra                           |    ❌    |  ❌   |   ✅    |
| Excluir compra                          |    ❌    |  ❌   |   ✅    |
| Registrar contagem de estoque           |    ❌    |  ✅   |   ✅    |
| Editar/excluir contagem                 |    ❌    |  ❌   |   ✅    |

### Dinheiro (Saídas, Resumos, Log)

| Ação                                                                                                |            Vendedor             |             Sócia             | Gerente |
| --------------------------------------------------------------------------------------------------- | :-----------------------------: | :---------------------------: | :-----: |
| Despesas (ver/cadastrar/editar/excluir)                                                             |               ❌                |          só **ver**           |   ✅    |
| Cartões (cadastrar/editar/desativar)                                                                |               ❌                |              ❌               |   ✅    |
| Lançamentos dos sócios (pró-labore, saque, aporte, capital inicial, pagamento de comissão, repasse) | ❌ (vê só os próprios repasses) |          só **ver**           |   ✅    |
| Resumos: vendas e comissão                                                                          |           só as dele            | todas + a comissão extra dela |  todas  |
| Resumos: despesas, lucro líquido, caixa/acumulado, comparativo entre vendedores                     |               ❌                |              ✅               |   ✅    |
| Resumos: "Dinheiro com os vendedores" / "Seu repasse"                                               |           seu repasse           |              ✅               |   ✅    |
| Painel (gráficos no PC)                                                                             |               ❌                |              ✅               |   ✅    |
| Ver log de auditoria e restaurar registros apagados                                                 |               ❌                |              ❌               |   ✅    |

### Conta e avisos

| Ação                                         |   Cliente    |      Equipe      |
| -------------------------------------------- | :----------: | :--------------: |
| Editar o próprio nome/WhatsApp               |      ✅      |    só o nome     |
| Ativar avisos push no aparelho               |      ✅      |        ✅        |
| Receber aviso de pedido novo                 |      ❌      | ✅ toda a equipe |
| Receber aviso de mudança de status do pedido | ✅ só o dono |        ❌        |

## Comissão por papel

- **Vendedor:** `comissao_pct` do perfil (padrão 40%) sobre o lucro das próprias vendas.
- **Sócia:** comissão normal nas próprias vendas **mais** `comissao_pct` sobre o lucro das vendas de todos os outros vendedores, como adicional (não sai da comissão deles).
- **Gerente:** não recebe comissão pelo sistema; seu ganho entra como pró-labore (lançamento).

## O que o visitante e o cliente enxergam no banco

- **Visitante (anon):** nenhuma tabela. Só duas RPCs: `vitrine()` (produtos ativos, preço, foto, esgotado e "restam" de 1 a 10; nunca custo nem saldo exato) e `criar_pedido()` (refaz preço no banco, recusa esgotado/acima do saldo, limita pedidos por telefone, por rede e no total). Desde a 036 o anon **não** executa mais `criar_pedido` direto: só o servidor do app, pela service role.
- **Cliente:** só o próprio perfil e os pedidos com o `cliente_id` dele. Toda tabela da equipe tem a policy restritiva `so_equipe`; tabela nova da equipe precisa ganhar a sua.

## Pontos de atenção (esqueci algum? / lacunas)

1. **Papéis que faltavam na lista:** _Visitante_ (sem login) e _Admin_ (quem muda papel e comissão, fora do app). São parte do modelo.
2. ✅ _Resolvido na 036._ ~~**Excluir venda é aberto à equipe inteira.** A policy `vendas_apagar` é `using (true)` e a Server Action `excluirVenda` não exige gerente, então um vendedor consegue apagar venda de outro (editar já é restrito às próprias). A exclusão é lógica e fica no log, e o gerente pode restaurar, mas vale decidir se vendedor só apaga as próprias.~~ Agora: só a própria, até 48 h; depois, só o gerente.
3. ✅ _Resolvido na 036._ Lançar e excluir compra agora são só do gerente (a aba Compras nem aparece para os outros).
4. A sócia **não** vê o link do Log nem edita nada além das próprias vendas; o acesso extra dela é de leitura (Resumos completo, Painel, despesas e lançamentos).
5. Uma sócia só: o cálculo usa a mais antiga. Cadastrar uma segunda não divide a comissão.
