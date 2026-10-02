// Cria um usuário do app (já confirmado, sem e-mail de verificação).
// Uso: npm run criar-usuario -- "Nome" email@exemplo.com senha-forte [comissao%]
// Exige NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env.local (projeto da Lojinha!).
import { createClient } from "@supabase/supabase-js";

const [nome, email, senha, comissao = "40"] = process.argv.slice(2);
if (!nome || !email || !senha) {
  console.error('Uso: npm run criar-usuario -- "Nome" email senha [comissao%]');
  process.exit(1);
}

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: { persistSession: false },
  },
);

const { data, error } = await admin.auth.admin.createUser({
  email,
  password: senha,
  email_confirm: true,
  user_metadata: { nome },
});
if (error) {
  console.error("Erro:", error.message);
  process.exit(1);
}

// o gatilho cria o perfil com 40%; ajusta se foi pedido outro percentual
if (Number(comissao) !== 40) {
  const { error: e2 } = await admin
    .from("perfis")
    .update({ comissao_pct: Number(comissao) })
    .eq("id", data.user.id);
  if (e2)
    console.error(
      "Usuário criado, mas falhou ao ajustar a comissão:",
      e2.message,
    );
}
console.log(`Usuário criado: ${nome} <${email}> (comissão ${comissao}%)`);
