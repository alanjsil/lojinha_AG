# Auditoria de segurança — Lojinha A&G

**Data:** 23/10/2026
**Método:** leitura do código (`app/`, `lib/`, `proxy.js`, `db/schema.sql`, migrações) e consultas **somente leitura** ao
catálogo do banco de produção (`pg_policies`, grants por coluna, advisor de segurança do Supabase). Nenhum ataque foi
executado em produção: o que segue é o que dá para explorar segundo o código e as permissões reais do banco, não algo
testado na prática.

Modelo de ameaça considerado: visitante sem login (vitrine), cliente cadastrado, vendedor/sócia mal-intencionado
usando a interface **ou** chamando o PostgREST direto (a chave anon é pública; basta logar com o próprio usuário).

---

## Status das correções (24/10/2026)

Implementadas no repositório, : migração `20261024201255_seguranca_auditoria.sql` (espelhada em `db/schema.sql`) + ajustes no app.

| #   | Achado                                | Correção                                                                                                                                            |
| --- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Comissão inflada com compra a custo 0 | Lançar e excluir compra: só o gerente (policy + Server Action + aba oculta)                                                                         |
| 2   | Qualquer um apaga venda alheia        | Vendedor/sócia: só a própria, até 48 h do lançamento; depois só o gerente (`pode_mexer_venda` no banco, `lib/vendas.js` na tela)                    |
| 3   | Regras só na Server Action            | Triggers de saldo e de contagem, `INSERT` por coluna, trigger de status do pedido                                                                   |
| 4   | Travar a vitrine                      | `criar_pedido` só pela service role; limite por rede (HMAC do IP; IPv6 pelo /64) de 5 em 10 min e 30 em 24 h, além dos limites por telefone e total |
| 5   | Saldo vaza no erro                    | Acima de 10 unidades a mensagem é genérica                                                                                                          |
| 6   | SSRF no push                          | Lista de hosts (`lib/push-endpoint.js` + constraint no banco); INSERT direto removido; envio ignora endpoint fora da lista                          |
| 7   | INSERT em `perfis`                    | `revoke insert`                                                                                                                                     |
| 8   | Auth                                  | `config.toml` local com senha mínima 8; **produção: ver abaixo**                                                                                    |

**Testado** (banco de dev, dentro de transação desfeita, simulando cada papel): compra, exclusão/edição de venda por dono/outro/sócia/gerente, venda acima do saldo (inclusive dois itens do mesmo produto no mesmo comando), `vendedor_id`/`custo_unit` forjados, contagem forjada, `criar_pedido` como anon/authenticated/service_role, limite por IP, transições do pedido, push com host interno e com host parecido, `perfis`, `saldo_do_produto`. Também `npm run lint`, `npm test` (65 testes) e `next build`.
**Não testado:** o fluxo pelas telas do app contra o banco já migrado (o dev não está migrado), e a concorrência real de duas vendas simultâneas (o lock por produto foi escrito, não exercitado).

### Antes de aplicar em produção

1. **Confirme `SUPABASE_SERVICE_ROLE_KEY` na Vercel.** Sem ela, o site não grava nenhum pedido (a `criar_pedido` agora só roda pela service role).
2. A migração muda a assinatura de `criar_pedido` e o `INSERT` de contagem. Entre aplicar a migração e o deploy do app, pedido da loja e contagem de estoque falham. Faça um logo depois do outro.
3. Rode o workflow `db.yml` com `dry_run` primeiro.

### Manual no painel do Supabase (produção)

- Ligar **Leaked password protection** (Auth → Providers → Email / Password security).
- Subir a **senha mínima para 8** (hoje o app exige 8, mas quem chama a API do Auth direto passa por fora).
- Conferir se **Confirm email** está ligado.

### Riscos que continuam

- **Saldo por tentativa:** com acima de 10 unidades, quem pede 99 e vai baixando ainda descobre o saldo no primeiro pedido que passa. Isso gera um pedido real (visível para a equipe e limitado por rede), então é ruidoso e lento, mas não é zero.
- **Rede compartilhada:** quem usa o mesmo IP (ex.: 4G com CGNAT) divide o limite de 5 pedidos em 10 min.
- **Contagem de estoque é de gerente e sócia (mig. 037).** O vendedor não vê a aba e o banco recusa o INSERT. A sócia ainda pode "criar" estoque contando a mais (a contagem ajusta o saldo sem custo); se isso incomodar, vira só do gerente ou ganha aprovação.
- **Vendedor ainda recebe o custo no navegador.** A tela esconde, mas `estoque_atual`, `vendas` e `compras` são legíveis por toda a equipe pela API. Se isso importa, as consultas e as policies de leitura precisam mudar.
- **Dev sem o trigger `antes_de_apagar_venda`.** O banco de dev não tem a exclusão lógica de `vendas` (produção tem os cinco). Lá, apagar venda é físico. Não faz parte da 036.
- **Sem captcha.** Um atacante com muitos IPs ainda consegue lotar o limite global de 30 pedidos em 10 min. Turnstile resolveria, mas exige mexer na CSP.

---

## 0. Urgente (não é segurança): produção sem a migração 035

- Última migração aplicada em produção: `20261020002928`. A coluna `vendas.primeiro_vencimento` **não existe** no banco.
- `registrarVenda` e `editarVenda` (`app/actions.js`) sempre enviam `primeiro_vencimento`.
- Se o código do último commit já está publicado, **toda venda e toda edição de venda falha em produção**.
- O CLAUDE.md diz que a produção está em dia até a 035; não está.

**Ação:** rodar o workflow `.github/workflows/db.yml` (primeiro com `dry_run`). Aplicar antes de qualquer migração de correção.

---

## Resumo dos achados

| #   | Achado                                                      | Quem explora              | Gravidade |
| --- | ----------------------------------------------------------- | ------------------------- | --------- |
| 1   | Comissão inflada com compra a custo 0 + exclusão da compra  | Vendedor (pela interface) | Alta      |
| 2   | Qualquer vendedor apaga venda/compra de qualquer pessoa     | Vendedor (pela interface) | Alta      |
| 3   | Regras só na Server Action, contornáveis pela API direta    | Vendedor (API direta)     | Média     |
| 4   | Limite global de pedidos permite travar a vitrine           | Visitante sem login       | Média     |
| 5   | Saldo exato do estoque vaza pela mensagem de erro           | Visitante sem login       | Baixa     |
| 6   | SSRF cega pelo endpoint de push                             | Cliente cadastrado        | Baixa     |
| 7   | Grant de INSERT em `perfis` inclui `papel` e `comissao_pct` | (defesa em profundidade)  | Baixa     |
| 8   | Configuração do Auth                                        | Qualquer um               | Baixa     |

---

## 1. Comissão inflada usando só a interface — **Alta**

**Onde:** `registrarCompra` e `excluirCompra` em `app/actions.js` (sem `exigeGerente`); policy `compras_apagar` = `using (true)`;
`compras_criar` = `with check (true)`.

**Como explorar:**

1. O vendedor lança uma compra grande do produto com custo unitário 0 (`permiteZero` aceita).
2. `recalcular_custo_medio` derruba o custo médio do produto para perto de zero.
3. Ele vende o produto: `vendas_preencher` fotografa esse custo quase zero, então a comissão vira praticamente
   o preço inteiro (40% do "lucro").
4. Ele exclui a compra: o custo médio volta ao normal, mas a venda continua com o custo zerado e a comissão inflada.

**Agravante:** `editarVenda` deixa o vendedor mudar `preco_unit` e `data` das próprias vendas a qualquer momento,
inclusive de meses já fechados (grant de UPDATE nessas colunas + policy `vendas_editar` para o dono).

O `log_auditoria` registra tudo, mas só se alguém for olhar.

**Correção:**

- `excluirCompra` com `{ exigeGerente: true }` e policy `compras_apagar` usando `eh_gerente()`.
- Avaliar se o vendedor deve lançar compra; se sim, bloquear custo 0 para quem não é gerente.
- Decidir a regra de edição de venda: travar depois de X dias ou liberar o preço só para o gerente.

## 2. Qualquer vendedor apaga venda/compra de qualquer pessoa — **Alta**

**Onde:** policy `vendas_apagar` = `using (true)`; `excluirVenda` não confere o dono.

**Como explorar:**

- Recebe o dinheiro, apaga a venda: o estoque volta e a receita some do caixa.
- Apaga as vendas de um colega para tirar a comissão dele.

**Correção:** `vendas_apagar` restrita a `eh_gerente()` ou ao dono da venda (opcionalmente só no mesmo dia).

## 3. Regras só na Server Action, contornáveis pela API direta — **Média**

O vendedor loga e chama `/rest/v1/...` direto com a chave anon, sem passar pelo Next.

| O que                     | Por quê                                                                                                           | Efeito                                           |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| Vender sem estoque        | O banco não confere saldo no insert de `vendas`; a checagem está só em `registrarVenda`                           | Estoque negativo                                 |
| Ajustar estoque à vontade | INSERT em `contagens_estoque` aceita `quantidade_sistema` vindo do cliente; `diferenca` é calculada a partir dele | Saldo arbitrário                                 |
| Forjar autoria            | Grants de INSERT em `compras`/`contagens_estoque` incluem `created_by`                                            | Registro atribuído a outra pessoa                |
| Inserir já "apagado"      | Grants de INSERT incluem `apagado_em`/`apagado_por`                                                               | Registro escondido desde a criação               |
| Fechar pedido sem venda   | `pedidos_atender` = `using (true)` + grant em `status`/`venda_ref`                                                | Pedido `entregue` sem venda nem baixa de estoque |

**Correção:**

- Trigger `before insert` em `vendas` que confere o saldo (somando os itens do mesmo produto no comando).
- Trigger em `contagens_estoque` que calcula `quantidade_sistema` no banco, ignorando o valor enviado.
- Grants de INSERT por coluna em `vendas`, `compras` e `contagens_estoque`, sem `created_by`, `apagado_em`,
  `apagado_por` e sem as colunas preenchidas por trigger.
- Trigger em `pedidos` que só aceita as transições de `mudancaValida` e só permite `entregue` com `venda_ref` existente.

## 4. Limite global de pedidos permite travar a vitrine — **Média**

**Onde:** `criar_pedido` — limite **global** de 30 pedidos a cada 10 minutos; limite por telefone (3) contornável
trocando o número; sem captcha.

**Como explorar:** um script anônimo envia pedidos com telefones aleatórios e ocupa o limite o tempo todo.
Clientes reais não conseguem mais pedir, e o celular da equipe recebe push sem parar, com nome e observação
escolhidos pelo atacante.

**Correção:** limite por IP na Server Action `criarPedido` (o IP vem do cabeçalho da Vercel) e/ou Cloudflare Turnstile;
manter o limite global como freio, não como único controle.

## 5. Saldo exato do estoque vaza pela mensagem de erro — **Baixa**

**Onde:** `criar_pedido` responde `Restam só N de X` quando a quantidade passa do saldo.

**Como explorar:** pedir 99 unidades de cada produto. O erro acontece antes do insert, então não gasta o limite de
pedidos. Dá para mapear o saldo de qualquer produto até 98 unidades, contra a regra "nunca saldo exato".

**Correção:** mensagem genérica ("quantidade indisponível") quando o saldo passa de 10, coerente com `vitrine().restam`.

## 6. SSRF cega pelo endpoint de push — **Baixa**

**Onde:** `salvarInscricaoDe` em `lib/push.js` aceita qualquer endereço `https://`.

**Como explorar:** um cliente cadastrado registra uma URL dele (ou de um serviço interno). O servidor faz um POST
para ela cada vez que o pedido desse cliente muda de status.

**Correção:** aceitar só os hosts reais de push: `fcm.googleapis.com`, `*.push.services.mozilla.com`,
`*.notify.windows.com`, `web.push.apple.com`.

## 7. Grant de INSERT em `perfis` — **Baixa (defesa em profundidade)**

`authenticated` tem INSERT em `perfis`, inclusive nas colunas `papel` e `comissao_pct`. Hoje está barrado só porque não
existe policy permissiva de insert. Uma policy criada por engano vira escalada de privilégio (cliente → gerente).

**Correção:** `revoke insert on perfis from authenticated;` (o perfil é criado pelo trigger `criar_perfil`, security definer).

## 8. Configuração do Auth — **Baixa**

- Proteção contra senhas vazadas (HaveIBeenPwned) **desligada** (aviso do advisor do Supabase).
- `supabase/config.toml` local tem senha mínima de 6; o app exige 8, mas quem chama a API do Auth direto passa por fora.
  Conferir no painel de produção e subir para 8.
- Conferir no painel de produção se a confirmação de e-mail está ligada (sem ela, dá para criar conta com e-mail alheio).

---

## O que resistiu

- **Cliente → equipe:** não achei caminho. O papel vem do `app_metadata` (só service role grava); `user_metadata` não
  vale; `criar_perfil` ignora papel vindo do cadastro; UPDATE de `perfis` limitado a `nome`/`telefone`; toda tabela da
  equipe tem a policy restritiva `so_equipe`; `executar()` recusa quem não é da equipe.
- **Anon:** não lê tabela nenhuma; só `vitrine()` e `criar_pedido()`, que refazem preço e saldo pelo banco.
- **Server Actions:** conferem login e papel (o proxy não cobre chamada de outra origem, e elas não dependem dele).
- **Injeção de filtro no PostgREST:** o UUID é validado antes do `.or()` em `excluirVenda`.
- **Fotos:** `fotoValida` só aceita o bucket `fotos`; upload só do gerente, com tipo e tamanho conferidos.
- **Cabeçalhos:** CSP com nonce e `strict-dynamic`, `frame-ancestors 'none'`, `X-Frame-Options`, HSTS em produção.
- **`restaurar_registro`:** só gerente, tabela em lista fechada, confere saldo ao restaurar venda.
- **Segredos:** nada vazado no histórico do git (`.env*` ignorado; só nomes de variáveis na documentação).

---

## Ordem sugerida

1. Aplicar a 035 em produção.
2. Uma migração com: policies de exclusão (itens 1 e 2), triggers de saldo e de contagem, grants de insert por coluna,
   trigger de status de pedido (item 3) e `revoke insert on perfis` (item 7). Refletir no `db/schema.sql`.
3. Ajustes nas Server Actions: `exigeGerente` em `excluirCompra`, limite por IP em `criarPedido`, mensagem de saldo,
   lista de hosts do push.
4. Painel do Supabase: senhas vazadas, senha mínima, confirmação de e-mail.
