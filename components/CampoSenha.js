"use client";

import { useState } from "react";
import Icone from "./Icone";

// Campo de senha com o olhinho para mostrar/ocultar
export default function CampoSenha({ id, ...props }) {
  const [visivel, setVisivel] = useState(false);
  return (
    <div className="campo-senha">
      <input id={id} type={visivel ? "text" : "password"} {...props} />
      <button type="button" className="olho" aria-label={visivel ? "Ocultar senha" : "Mostrar senha"} aria-pressed={visivel} onClick={() => setVisivel(!visivel)}>
        <Icone nome={visivel ? "olho-cortado" : "olho"} />
      </button>
    </div>
  );
}
