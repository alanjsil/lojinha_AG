# compras-app

App Android (WebView, sem Gradle) com a lista de compras da viagem e envio para o Supabase da Lojinha A&G.
É um complemento do app da lojinha: lê o catálogo, faz o de-para por nome e grava produtos novos, compras e despesas.

## Estrutura

- `web/` — fonte da página: `index.html`, `core.js` (lógica pura, testada), fontes (Inter) e Font Awesome.
- `src/`, `res/`, `AndroidManifest.xml` — parte Android (ponte HTTP, ícone, rede).
- `assets/` — **gerada** pelo build (não editar, está no `.gitignore`); inclui `config.js` com as chaves públicas.
- `tests/` — `node --test "tests/*.test.js"` (de-para, plano de envio, cliente Supabase com servidor falso).
- `tools/` — `checar-web.js` (sintaxe e ids da página), `gerar-icone.ps1`, `gerar-fixture.mjs`, `inspect-dev.mjs` (só leitura no dev).

## Build e instalação

```powershell
node tools/checar-web.js
node --test "tests/*.test.js"
powershell -ExecutionPolicy Bypass -File build.ps1      # gera compras.apk (fora do git)
adb connect <ip:porta>; adb install -r compras.apk
```

O build lê do `..\.env.local`:

| Variável | Uso |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ambiente **PRODUÇÃO** |
| `DEV_SUPABASE_URL` (opcional, padrão `http://192.168.1.50:8000`) | API do Supabase de dev no Pi |
| `DEV_SUPABASE_ANON_KEY` | chave `anon` do Supabase de dev (painel do Studio do Pi → API) |

Só a chave pública (`anon`/publishable) vai para o app. Nunca a `service_role`.

## Fluxo de envio

1. Marcar o que comprou na loja (qtd, preço em US$), ajustar o dólar tocando no valor do topo.
2. ☁️ **Supabase** → ambiente (DEV por padrão) → entrar com a conta de gerente → atualizar catálogo.
3. **De-para**: resolver itens ⚠ (vínculo suspeito, sugerido ou sem produto) ou criar como produto novo.
4. 🧾 **Despesas**: lançar as despesas (tipo Ônibus exige a migração `20261101025657_despesas_tipo_onibus`).
5. **Prévia e envio**: produtos novos → compras → despesas, uma vez só (retomável). Produção exige digitar `PRODUCAO`.

Compras à vista (sem cartão): o banco gera 1 saída na data do lançamento. O custo médio dos produtos é recalculado pelo banco.
