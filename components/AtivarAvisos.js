"use client";

import { useEffect, useState } from "react";
import { ativarAvisos, desativarAvisos } from "../app/push/actions";

// chave pública VAPID (base64url) → bytes, como o pushManager pede
function chaveEmBytes(base64) {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const bin = atob((base64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function registro() {
  // no dev o RegistrarSW não instala o service worker; para avisos ele é obrigatório
  return (await navigator.serviceWorker.getRegistration()) ?? navigator.serviceWorker.register("/sw.js");
}

// Botão "Ativar avisos" deste aparelho. `texto` explica o que chega (pedido novo / andamento do pedido).
export default function AtivarAvisos({ chavePublica, texto }) {
  const [estado, setEstado] = useState("carregando"); // carregando | sem-suporte | iphone | negado | desligado | ligado
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState(null);

  useEffect(() => {
    (async () => {
      const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
      const instalado = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone;
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        setEstado(ios && !instalado ? "iphone" : "sem-suporte");
        return;
      }
      if (Notification.permission === "denied") {
        setEstado("negado");
        return;
      }
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      setEstado(sub ? "ligado" : "desligado");
    })().catch(() => setEstado("sem-suporte"));
  }, []);

  async function ligar() {
    setErro(null);
    setOcupado(true);
    try {
      const permissao = await Notification.requestPermission();
      if (permissao !== "granted") {
        setEstado(permissao === "denied" ? "negado" : "desligado");
        return;
      }
      const reg = await registro();
      await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: chaveEmBytes(chavePublica) }));
      const r = await ativarAvisos(sub.toJSON());
      if (!r.ok) setErro(r.erro);
      else setEstado("ligado");
    } catch {
      setErro("Não foi possível ativar os avisos neste aparelho.");
    } finally {
      setOcupado(false);
    }
  }

  async function desligar() {
    setOcupado(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await desativarAvisos(sub.endpoint);
        await sub.unsubscribe();
      }
      setEstado("desligado");
    } finally {
      setOcupado(false);
    }
  }

  if (!chavePublica || estado === "carregando") return null;

  return (
    <div className="card avisos">
      <h2>🔔 Avisos no celular</h2>
      <p className="info" style={{ marginTop: 0 }}>
        {texto}
      </p>
      {estado === "iphone" && <p className="info">No iPhone, primeiro adicione o app à tela de início (Compartilhar › Adicionar à Tela de Início) e abra por lá.</p>}
      {estado === "sem-suporte" && <p className="info">Este navegador não recebe avisos. Tente pelo Chrome (Android) ou pelo app instalado.</p>}
      {estado === "negado" && <p className="info">Os avisos estão bloqueados para este site. Libere nas configurações do navegador e volte aqui.</p>}
      {estado === "desligado" && (
        <button type="button" onClick={ligar} disabled={ocupado}>
          {ocupado ? "Ativando..." : "Ativar avisos"}
        </button>
      )}
      {estado === "ligado" && (
        <>
          <p className="msg-ok">Avisos ativados neste aparelho.</p>
          <button type="button" className="botao-secundario" onClick={desligar} disabled={ocupado}>
            Desativar avisos
          </button>
        </>
      )}
      {erro && <p className="msg-erro">{erro}</p>}
    </div>
  );
}
