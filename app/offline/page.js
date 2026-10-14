import BotaoRecarregar from "../../components/BotaoRecarregar";

export const metadata = { title: "Sem conexão — Lojinha A&G" };

// Guardada pelo service worker e mostrada no lugar de qualquer página que não carregou por falta de internet
export default function Offline() {
  return (
    <div className="login">
      <div className="card">
        <h1>Sem conexão</h1>
        <p className="info">O aparelho está sem internet. Assim que a conexão voltar, toque em Tentar de novo.</p>
        <BotaoRecarregar />
      </div>
    </div>
  );
}
