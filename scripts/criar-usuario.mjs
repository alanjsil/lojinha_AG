// Cria um usuário do app (já confirmado, sem e-mail de verificação).
// Uso: npm run criar-usuario -- "Nome" email@exemplo.com senha-forte [comissao%] [papel]
// papel: "gerente", "socia" (vendedor + comissão extra sobre as vendas dos outros) ou "vendedor" (padrão). Exige NEXT_PUBLIC_SUPABASE_URL e
// SUPABASE_SERVICE_ROLE_KEY no .env.local (projeto da Lojinha!).
import { createClient } from "@supabase/supabase-js";

const [nome, email, senha, comissao = "40", papel = "vendedor"] = process.argv.slice(2);
if (!nome || !email || !senha) {
  console.error('Uso: npm run criar-usuario -- "Nome" email senha [comissao%] [papel]');
  process.exit(1);
}
if (!["gerente", "vendedor", "socia"].includes(papel)) {
  console.error('Papel inválido: use "gerente", "vendedor" ou "socia".');
  process.exit(1);
}

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const { data, error } = await admin.auth.admin.createUser({
  email,
  password: senha,
  email_confirm: true,
  user_metadata: { nome },
  // papel da equipe só no app_metadata (o usuário não consegue alterar); sem ele, o cadastro vira cliente (mig. 031)
  app_metadata: { papel },
});
if (error) {
  console.error("Erro:", error.message);
  process.exit(1);
}

// o gatilho cria o perfil com o papel do app_metadata e 40%; ajusta a comissão se foi pedido outro valor
const ajustes = { papel };
if (Number(comissao) !== 40) ajustes.comissao_pct = Number(comissao);
const { error: e2 } = await admin.from("perfis").update(ajustes).eq("id", data.user.id);
if (e2) console.error("Usuário criado, mas falhou ao ajustar perfil:", e2.message);
console.log(`Usuário criado: ${nome} <${email}> (comissão ${comissao}%, papel ${papel})`);
