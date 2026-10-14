"use client";

import { useId, useState } from "react";
import { enviarFoto } from "../app/actions";
import { reduzirImagem } from "../lib/imagem";

// Foto opcional (produto ou categoria): escolhe da galeria/câmera, reduz no aparelho e sobe na hora.
// O endereço só fica gravado quando o formulário em volta é salvo.
export default function CampoFoto({ valor, aoMudar, pasta = "produtos", rotulo = "Foto (opcional)" }) {
  const id = useId();
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState(null);

  async function escolher(e) {
    const arquivo = e.target.files?.[0];
    e.target.value = ""; // permite escolher a mesma foto de novo
    if (!arquivo) return;
    setErro(null);
    setEnviando(true);
    try {
      const blob = await reduzirImagem(arquivo);
      const dados = new FormData();
      dados.append("foto", blob, `foto.${blob.type === "image/webp" ? "webp" : "jpg"}`);
      dados.append("pasta", pasta);
      const r = await enviarFoto(dados);
      if (r.ok) aoMudar(r.url);
      else setErro(r.erro);
    } catch {
      setErro("Não deu para usar essa foto. Tente outra.");
    }
    setEnviando(false);
  }

  return (
    <div className="campo-foto">
      <label htmlFor={id}>{rotulo}</label>
      <div className="campo-foto-linha">
        {valor ? (
          // eslint-disable-next-line @next/next/no-img-element -- foto já reduzida no envio; dispensa o otimizador do Next
          <img src={valor} alt="" className="miniatura" />
        ) : (
          <span className="miniatura vazia" aria-hidden="true">
            📷
          </span>
        )}
        <div className="campo-foto-acoes">
          <label htmlFor={id} className="botao-arquivo" aria-disabled={enviando}>
            {enviando ? "Enviando..." : valor ? "Trocar foto" : "Escolher foto"}
          </label>
          <input id={id} type="file" accept="image/*" onChange={escolher} disabled={enviando} hidden />
          {valor && !enviando && (
            <button type="button" className="botao-link" onClick={() => aoMudar("")}>
              Remover foto
            </button>
          )}
        </div>
      </div>
      {erro && <p className="msg-erro">{erro}</p>}
    </div>
  );
}
