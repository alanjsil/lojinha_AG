"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// Envia uma Server Action, mostra "Salvando...", exibe a mensagem e atualiza a tela.
// Evita toque duplo: enquanto salva, `salvando` fica true e o botão desabilita.
export default function useEnvio() {
  const router = useRouter();
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState(null);

  async function enviar(acao, dados, { aoConcluir, textoOk = "Salvo!" } = {}) {
    setSalvando(true);
    setMsg(null);
    const r = await acao(dados);
    setSalvando(false);
    if (!r.ok) {
      setMsg({ ok: false, texto: r.erro });
      return false;
    }
    setMsg({ ok: true, texto: textoOk });
    aoConcluir?.();
    router.refresh();
    return true;
  }

  return { salvando, msg, enviar, limpar: () => setMsg(null) };
}

export function Mensagem({ msg }) {
  if (!msg) return null;
  return <p className={msg.ok ? "msg-ok" : "msg-erro"}>{msg.texto}</p>;
}
