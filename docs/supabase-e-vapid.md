# Supabase (migrações) e notificações push (VAPID)

Guia prático. Projeto Supabase da Lojinha: ref `modldgphwfzjarydzolx` (nunca o BarAppChapeu).

---

## 1. Subir migrações para o Supabase

### Como funciona

- Cada mudança no banco é um arquivo em `supabase/migrations/<AAAAMMDDHHMMSS>_nome.sql`.
- O banco guarda a lista de versões já aplicadas (`supabase_migrations.schema_migrations`).
- `supabase db push` compara a pasta com essa lista e aplica **só as que faltam**, em ordem.
- `db/schema.sql` continua sendo o retrato do estado atual: toda migração nova também é refletida nele.
- `db/migracoes/` guarda só a 001 e a 002 (anteriores ao histórico do banco). Não crie migrações novas ali.

### Preparação (uma vez por computador)

```powershell
npm install                      # instala a CLI do projeto (devDependency "supabase")
npx supabase login               # abre o navegador e guarda o token
npx supabase link --project-ref modldgphwfzjarydzolx   # pede a senha do banco
```

A senha do banco está em Supabase → Project Settings → Database (dá para redefinir lá).
Se `npx supabase migration list` mostrar a lista, está tudo conectado.

### Fluxo do dia a dia

```powershell
# 1. criar o arquivo (já com o timestamp certo)
npx supabase migration new nome_curto

# 2. escrever o SQL em supabase/migrations/<timestamp>_nome_curto.sql
#    e refletir a mudança em db/schema.sql

# 3. ver o que seria aplicado, sem alterar nada
npx supabase db push --dry-run

# 4. aplicar de verdade
npx supabase db push

# 5. conferir
npx supabase migration list      # Local e Remote devem ter as mesmas versões
```

Depois: `npm run lint`, `npm test`, commit e push no GitHub.

### Pelo GitHub Actions (botão)

Workflow `.github/workflows/db.yml`, manual:

1. GitHub → Actions → **Banco (migrações)** → Run workflow.
2. Deixe **dry_run ligado** na primeira vez: ele só lista o que seria aplicado.
3. Rode de novo com dry_run **desligado** para aplicar.

Pré-requisitos já configurados no repositório:

| Onde        | Nome                    | Valor                                                       |
| ----------- | ----------------------- | ----------------------------------------------------------- |
| Secret      | `SUPABASE_ACCESS_TOKEN` | token em supabase.com/dashboard/account/tokens              |
| Secret      | `SUPABASE_DB_PASSWORD`  | senha do banco                                              |
| Secret      | `SUPABASE_PROJECT_ID`   | `modldgphwfzjarydzolx`                                      |
| Environment | `producao`              | em Settings → Environments; dá para exigir aprovação manual |

O `ci.yml` (lint + testes) roda sozinho em todo push e pull request.

### Regras de ouro

- **Nunca edite uma migração já aplicada.** Se errou, crie outra que corrige.
- Só o gerente mexe no banco de produção; sempre `--dry-run` antes.
- Não aplique migração pelo MCP (`apply_migration`) nem pelo SQL Editor: isso grava uma versão com outro
  timestamp e o histórico local deixa de bater. Se precisar rodar SQL avulso, crie a migração depois com o
  mesmo conteúdo e use `migration repair` (abaixo).
- Funções de trigger precisam de `execute` revogado de `anon`/`authenticated`; tabela nova da equipe precisa da
  policy restritiva `so_equipe` (veja `CLAUDE.md`).

### Problemas comuns

| Mensagem / sintoma                                                               | Causa                                                    | Solução                                                                                                      |
| -------------------------------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `Found local migration files to be inserted before the last migration on remote` | Arquivo novo com timestamp **anterior** ao último remoto | Renomeie o arquivo com timestamp atual (`migration new` já faz isso)                                         |
| `Remote migration versions not found in local migrations directory`              | Existe versão no banco sem arquivo local                 | `npx supabase migration repair --status reverted <versão>` (ou traga o arquivo)                              |
| Migração aplicada por fora do histórico                                          | SQL rodado direto no banco                               | `npx supabase migration repair --status applied <versão>` (só mexe na tabela de controle)                    |
| `password authentication failed`                                                 | Senha do banco errada                                    | Redefina em Project Settings → Database e rode `link` de novo                                                |
| `eslint`/`npm run lint` trava com `UNKNOWN: read`                                | `node_modules` no OneDrive com arquivos só na nuvem      | Botão direito em `node_modules` → "Sempre manter neste dispositivo", ou mova o projeto para fora do OneDrive |

---

## 2. Notificações push (VAPID)

### O que é

Web Push precisa de um par de chaves **VAPID**: o servidor assina cada aviso com a chave **privada** e o navegador
confere com a chave **pública** recebida na hora de ativar os avisos. É isso que prova ao navegador que o aviso
veio do app certo.

No app:

- `components/AtivarAvisos.js` pede permissão, inscreve o aparelho (usa a chave pública) e grava a inscrição em
  `push_inscricoes` pela Server Action `ativarAvisos`.
- `lib/push.js` (biblioteca `web-push`) envia: pedido novo → toda a equipe; mudança de status → o cliente dono.
  O envio roda em `after()` para não atrasar a resposta e usa a service role do Supabase para ler as inscrições.
- Inscrição que o navegador recusa (404/410) é apagada sozinha.
- Sem as chaves o app funciona normalmente, só não avisa.

### Variáveis de ambiente

| Variável                    | O que é                                                      | Segredo?                                           |
| --------------------------- | ------------------------------------------------------------ | -------------------------------------------------- |
| `VAPID_PUBLIC_KEY`          | chave pública (base64url)                                    | não, mas só vive no servidor e é entregue à página |
| `VAPID_PRIVATE_KEY`         | chave privada                                                | **sim**                                            |
| `VAPID_SUBJECT`             | contato do remetente: `mailto:voce@email.com` ou URL do site | não                                                |
| `SUPABASE_SERVICE_ROLE_KEY` | chave de serviço do Supabase (Project Settings → API)        | **sim**, ignora RLS                                |
| `WHATSAPP_LOJA`             | número da loja para o `wa.me` (ex.: `5511999999999`)         | não; vazio = só grava o pedido                     |

Nenhuma delas começa com `NEXT_PUBLIC_`: ficam só no servidor.

### Passo a passo

**1. Gerar as chaves** (uma única vez):

```powershell
npx web-push generate-vapid-keys
```

Saída: `Public Key` e `Private Key`. Guarde as duas em um gerenciador de senhas.

> **Não gere de novo depois de em uso.** Trocar o par invalida todas as inscrições existentes: cada aparelho
> teria de reativar os avisos.

**2. Local** — acrescente ao `.env.local` (já está no `.gitignore`):

```
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:seu@email.com
SUPABASE_SERVICE_ROLE_KEY=...
WHATSAPP_LOJA=5511999999999
```

O `.env.example` lista os nomes sem valores.

**3. Vercel (produção)** — pelo painel (Project → Settings → Environment Variables) ou pela CLI:

```powershell
vercel env add VAPID_PUBLIC_KEY production
vercel env add VAPID_PRIVATE_KEY production
vercel env add VAPID_SUBJECT production
vercel env add SUPABASE_SERVICE_ROLE_KEY production
vercel env add WHATSAPP_LOJA production
```

Marque as duas chaves secretas como **Sensitive** no painel. Variável nova só vale depois de um novo deploy:

```powershell
vercel --prod
```

**4. Testar**

1. Abra o app instalado no celular, entre como cliente e toque em ativar avisos na conta; aceite a permissão.
2. Entre como equipe em outro aparelho, abra Vendas e ative os avisos também.
3. Faça um pedido pela vitrine: a equipe deve receber o aviso. Mude o status no app: o cliente recebe.
4. Para conferir se a inscrição foi gravada: tabela `push_inscricoes` no Supabase (uma linha por aparelho).

### Limitações e dicas

- **iPhone** só recebe push com o app **instalado na tela inicial** (iOS 16.4+). No Safari comum, não.
- Permissão negada no navegador só se desfaz nas configurações do site/aparelho.
- Nada chega e não há erro? Confira, nesta ordem: variáveis no Vercel + novo deploy, `SUPABASE_SERVICE_ROLE_KEY`
  correta, linha em `push_inscricoes`, permissão de notificação do aparelho.
- **Rotação de chaves** (se a privada vazar): gere um par novo, troque no Vercel, faça deploy e peça para
  reativarem os avisos.
