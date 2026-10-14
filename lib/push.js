import "server-only";
import webpush from "web-push";
import { PAPEIS_EQUIPE } from "./rotas";
import { criarAdmin } from "./supabase/admin";

// Notificações Web Push (chaves VAPID no .env). Sem chave ou sem service role, simplesmente não avisa:
// o pedido nunca pode falhar por causa do aviso.
function configurado() {
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return false;
  webpush.setVapidDetails(VAPID_SUBJECT || "https://lojinha-ag.vercel.app", VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  return true;
}

async function enviar(admin, inscricoes, { titulo, corpo, url, tag }) {
  const payload = JSON.stringify({ titulo, corpo, url, tag });
  const vencidas = [];
  await Promise.all(
    inscricoes.map(async (i) => {
      try {
        await webpush.sendNotification({ endpoint: i.endpoint, keys: { p256dh: i.p256dh, auth: i.auth } }, payload, { TTL: 60 * 60 * 24 });
      } catch (e) {
        // 404/410: o aparelho desinstalou ou revogou a permissão
        if (e?.statusCode === 404 || e?.statusCode === 410) vencidas.push(i.id);
        else console.error("push", e?.statusCode, e?.body ?? e);
      }
    }),
  );
  if (vencidas.length) await admin.from("push_inscricoes").delete().in("id", vencidas);
}

// "novo pedido" para todos os aparelhos da equipe
export async function avisarEquipe(aviso) {
  try {
    const admin = criarAdmin();
    if (!admin || !configurado()) return;
    const { data } = await admin.from("push_inscricoes").select("id, endpoint, p256dh, auth, perfis!inner(papel)").in("perfis.papel", PAPEIS_EQUIPE);
    if (data?.length) await enviar(admin, data, aviso);
  } catch (e) {
    console.error("avisarEquipe", e);
  }
}

// andamento do pedido para os aparelhos do cliente dono
export async function avisarCliente(clienteId, aviso) {
  try {
    if (!clienteId) return;
    const admin = criarAdmin();
    if (!admin || !configurado()) return;
    const { data } = await admin.from("push_inscricoes").select("id, endpoint, p256dh, auth").eq("usuario_id", clienteId);
    if (data?.length) await enviar(admin, data, aviso);
  } catch (e) {
    console.error("avisarCliente", e);
  }
}

// grava (ou move para este usuário) a inscrição do aparelho; service role porque o mesmo
// navegador pode ter sido de outra conta antes (endpoint é único)
export async function salvarInscricaoDe(usuarioId, inscricao) {
  const admin = criarAdmin();
  if (!admin) throw new Error("SUPABASE_SERVICE_ROLE_KEY ausente");
  const { endpoint, keys } = inscricao ?? {};
  if (typeof endpoint !== "string" || !endpoint.startsWith("https://") || endpoint.length > 1000 || !keys?.p256dh || !keys?.auth) {
    throw new Error("inscrição inválida");
  }
  const { error } = await admin
    .from("push_inscricoes")
    .upsert({ usuario_id: usuarioId, endpoint, p256dh: String(keys.p256dh).slice(0, 200), auth: String(keys.auth).slice(0, 100) }, { onConflict: "endpoint" });
  if (error) throw error;
}

export async function removerInscricaoDe(usuarioId, endpoint) {
  const admin = criarAdmin();
  if (!admin) return;
  await admin
    .from("push_inscricoes")
    .delete()
    .eq("usuario_id", usuarioId)
    .eq("endpoint", String(endpoint ?? ""));
}
