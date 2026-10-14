"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { NOVIDADES, novidadesPendentes } from "../lib/novidades";
import { rotaCliente, rotaPublica } from "../lib/rotas";

const CHAVE = "novidades-vista";

// Janela "O que mudou" ao abrir o app: aparece uma vez por novidade, por aparelho
export default function Novidades() {
  const pathname = usePathname();
  const [pendentes, setPendentes] = useState([]);

  useEffect(() => {
    let vista = null;
    try {
      vista = localStorage.getItem(CHAVE);
    } catch {}
    setPendentes(novidadesPendentes(NOVIDADES, vista));
  }, []);

  if (rotaPublica(pathname) || rotaCliente(pathname) || !pendentes.length) return null;

  function fechar() {
    try {
      localStorage.setItem(CHAVE, NOVIDADES[0].versao);
    } catch {}
    setPendentes([]);
  }

  return (
    <div className="modal-fundo" role="dialog" aria-modal="true" aria-label="Novidades">
      <div className="card ajuda">
        <h2>O que mudou</h2>
        {pendentes.map((n) => (
          <section key={n.versao}>
            <h3>{n.titulo}</h3>
            <ul>
              {n.itens.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
        ))}
        <button type="button" onClick={fechar}>
          Entendi
        </button>
      </div>
    </div>
  );
}
