"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { criarPedido } from "../app/loja/actions";
import { agruparPorCategoria } from "../lib/categorias";
import { brl } from "../lib/formato";
import { formatarTelefone, limparCarrinho, linkWhatsApp, MAX_POR_ITEM, mensagemPedido, mudarQuantidade, resumoCarrinho, telefoneValido } from "../lib/pedido";

const CHAVE_CARRINHO = "loja-carrinho";
const CHAVE_CLIENTE = "loja-cliente";

const ler = (chave, padrao) => {
  try {
    return JSON.parse(localStorage.getItem(chave)) ?? padrao;
  } catch {
    return padrao;
  }
};
const gravar = (chave, valor) => {
  try {
    localStorage.setItem(chave, JSON.stringify(valor));
  } catch {}
};

// busca sem acento e sem diferença de maiúsculas
const normalizar = (t) =>
  String(t ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

function Foto({ url, nome, className }) {
  if (!url)
    return (
      <span className={`${className} vazia`} aria-hidden="true">
        {nome.trim()[0]?.toUpperCase() ?? "?"}
      </span>
    );
  // eslint-disable-next-line @next/next/no-img-element -- foto já reduzida no envio
  return <img src={url} alt="" className={className} loading="lazy" />;
}

function Quantidade({ valor, aoMudar, nome }) {
  return (
    <div className="qtd-passo" role="group" aria-label={`Quantidade de ${nome}`}>
      <button type="button" onClick={() => aoMudar(valor - 1)} aria-label="Diminuir">
        −
      </button>
      <span aria-live="polite">{valor}</span>
      <button type="button" onClick={() => aoMudar(valor + 1)} disabled={valor >= MAX_POR_ITEM} aria-label="Aumentar">
        +
      </button>
    </div>
  );
}

export default function Vitrine({ produtos, visitante, whatsapp, erro }) {
  const [carrinho, setCarrinho] = useState({});
  const [cliente, setCliente] = useState({ nome: "", telefone: "", obs: "" });
  const [busca, setBusca] = useState("");
  const [aberto, setAberto] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [falha, setFalha] = useState(null);
  const [enviado, setEnviado] = useState(null); // { numero, link }

  // carrinho e dados do cliente ficam no aparelho; o que esgotou desde a última visita sai
  useEffect(() => {
    setCarrinho(limparCarrinho(ler(CHAVE_CARRINHO, {}), produtos));
    // cliente com conta: nome e WhatsApp do cadastro; sem conta: o que ficou salvo no aparelho
    const doCadastro = visitante && !visitante.equipe && visitante.nome ? { nome: visitante.nome, telefone: formatarTelefone(visitante.telefone) } : {};
    setCliente((c) => ({ ...c, ...ler(CHAVE_CLIENTE, {}), ...doCadastro, obs: "" }));
  }, [produtos, visitante]);

  function mudar(id, q) {
    setCarrinho((atual) => {
      const novo = mudarQuantidade(atual, id, q);
      gravar(CHAVE_CARRINHO, novo);
      return novo;
    });
  }

  const resumo = resumoCarrinho(carrinho, produtos);

  const grupos = useMemo(() => {
    const termo = normalizar(busca.trim());
    const filtrados = termo ? produtos.filter((p) => normalizar(`${p.nome} ${p.descricao ?? ""}`).includes(termo)) : produtos;
    const categorias = [
      ...new Map(
        produtos.filter((p) => p.categoria_id).map((p) => [p.categoria_id, { id: p.categoria_id, nome: p.categoria_nome, ordem: p.categoria_ordem, foto_url: p.categoria_foto_url }]),
      ).values(),
    ];
    const g = agruparPorCategoria(filtrados, categorias);
    // sem nenhuma categoria cadastrada, "Outros" não faz sentido
    if (g.length === 1 && g[0].id === null) g[0] = { ...g[0], nome: "Produtos" };
    return g;
  }, [produtos, busca]);

  async function enviar(e) {
    e.preventDefault();
    setFalha(null);
    setEnviando(true);
    const r = await criarPedido({ ...cliente, carrinho });
    setEnviando(false);
    if (!r.ok) {
      setFalha(r.erro);
      return;
    }
    gravar(CHAVE_CLIENTE, { nome: cliente.nome.trim(), telefone: cliente.telefone.trim() });
    gravar(CHAVE_CARRINHO, {});
    setCarrinho({});
    const texto = mensagemPedido({ ...r.pedido, nome: cliente.nome.trim(), telefone: cliente.telefone.trim(), obs: cliente.obs });
    const link = linkWhatsApp(whatsapp, texto);
    setEnviado({ numero: r.pedido.numero, link });
    setAberto(false);
    setCliente((c) => ({ ...c, obs: "" }));
    if (link) window.location.href = link;
  }

  const podeEnviar = resumo.quantidade > 0 && cliente.nome.trim().length >= 2 && telefoneValido(cliente.telefone);

  return (
    <div className="vitrine">
      <header className="loja-topo">
        {/* eslint-disable-next-line @next/next/no-img-element -- ícone local */}
        <img src="/icons/icon-192.png" alt="" className="loja-logo" />
        <strong>Lojinha A&amp;G</strong>
        <Link href={!visitante ? "/login" : visitante.equipe ? "/vendas" : "/conta"} className="loja-entrar">
          {!visitante ? "Entrar" : visitante.equipe ? "Abrir app" : "Minha conta"}
        </Link>
      </header>

      <input type="search" className="loja-busca" placeholder="Buscar produto" aria-label="Buscar produto" value={busca} onChange={(e) => setBusca(e.target.value)} />

      {erro && <p className="msg-erro">Não foi possível carregar os produtos. Tente de novo em instantes.</p>}
      {!erro && grupos.length === 0 && (
        <div className="card">
          <p className="vazio">{busca ? "Nenhum produto encontrado." : "Nenhum produto disponível no momento."}</p>
        </div>
      )}

      {grupos.map((g) => (
        <details className="card grupo-categoria" key={g.id ?? "outros"} open>
          <summary>
            <Foto url={g.foto_url} nome={g.nome} className="miniatura" />
            <span className="titulo">{g.nome}</span>
            <span className="sub">{g.produtos.length}</span>
          </summary>
          <ul className="loja-grade">
            {g.produtos.map((p) => {
              const q = carrinho[p.id] ?? 0;
              return (
                <li key={p.id} className={p.esgotado ? "esgotado" : undefined}>
                  <div className="loja-foto-caixa">
                    <Foto url={p.foto_url} nome={p.nome} className="loja-foto" />
                    {p.esgotado && <span className="selo-esgotado">Esgotado</span>}
                  </div>
                  <div className="loja-nome">{p.nome}</div>
                  {p.descricao && <div className="loja-desc">{p.descricao}</div>}
                  <div className="loja-preco">{brl(p.preco)}</div>
                  {p.esgotado ? (
                    <button type="button" disabled>
                      Esgotado
                    </button>
                  ) : q > 0 ? (
                    <Quantidade valor={q} nome={p.nome} aoMudar={(n) => mudar(p.id, n)} />
                  ) : (
                    <button type="button" onClick={() => mudar(p.id, 1)}>
                      Adicionar
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </details>
      ))}

      {resumo.quantidade > 0 && !aberto && (
        <button type="button" className="barra-carrinho" onClick={() => setAberto(true)}>
          <span>
            🛒 {resumo.quantidade} {resumo.quantidade === 1 ? "item" : "itens"}
          </span>
          <span>Ver carrinho · {brl(resumo.total)}</span>
        </button>
      )}

      {aberto && (
        <div className="modal-fundo" role="dialog" aria-modal="true" aria-label="Carrinho">
          <form className="card" onSubmit={enviar}>
            <div className="titulo-linha">
              <h2 style={{ margin: 0 }}>Seu carrinho</h2>
              <button type="button" className="filtro-chip" onClick={() => setAberto(false)}>
                Fechar
              </button>
            </div>
            {resumo.itens.length === 0 ? (
              <p className="vazio">O carrinho está vazio.</p>
            ) : (
              <ul className="lista">
                {resumo.itens.map((i) => (
                  <li key={i.produto_id} className="item-carrinho">
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="titulo">{i.nome}</div>
                      <div className="sub">
                        {brl(i.preco)} · {brl(i.subtotal)}
                      </div>
                    </div>
                    <Quantidade valor={i.quantidade} nome={i.nome} aoMudar={(n) => mudar(i.produto_id, n)} />
                  </li>
                ))}
              </ul>
            )}
            <div className="destaque">
              <span>Total</span>
              <span>{brl(resumo.total)}</span>
            </div>

            <label htmlFor="cliente-nome">Seu nome</label>
            <input id="cliente-nome" autoComplete="name" maxLength={80} value={cliente.nome} onChange={(e) => setCliente({ ...cliente, nome: e.target.value })} required />
            <label htmlFor="cliente-tel">WhatsApp com DDD</label>
            <input
              id="cliente-tel"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="(51) 99999-0000"
              maxLength={20}
              value={cliente.telefone}
              onChange={(e) => setCliente({ ...cliente, telefone: e.target.value })}
              required
            />
            <label htmlFor="cliente-obs">Observação (opcional)</label>
            <textarea
              id="cliente-obs"
              rows={2}
              maxLength={500}
              value={cliente.obs}
              onChange={(e) => setCliente({ ...cliente, obs: e.target.value })}
              placeholder="Ex.: retirar na loja, entregar à tarde"
            />

            <button type="submit" disabled={enviando || !podeEnviar}>
              {enviando ? "Enviando..." : whatsapp ? "Enviar pedido pelo WhatsApp" : "Enviar pedido"}
            </button>
            {falha && <p className="msg-erro">{falha}</p>}
            <p className="info">O pagamento e a entrega são combinados com a loja depois do pedido.</p>
          </form>
        </div>
      )}

      {enviado && (
        <div className="modal-fundo" role="dialog" aria-modal="true" aria-label="Pedido enviado">
          <div className="card">
            <h2>Pedido nº {enviado.numero} recebido!</h2>
            <p className="info">
              {enviado.link ? "Se o WhatsApp não abriu sozinho, toque no botão abaixo para mandar o pedido para a loja." : "A loja já recebeu o seu pedido e vai entrar em contato."}
              {!visitante ? " Crie uma conta para acompanhar os próximos pedidos e receber avisos no celular." : !visitante.equipe ? " Acompanhe o andamento em Minha conta." : ""}
            </p>
            {enviado.link && (
              <a className="botao-whatsapp" href={enviado.link}>
                Chamar a loja no WhatsApp
              </a>
            )}
            {visitante && !visitante.equipe && (
              <Link href="/conta" className="botao-link-cheio">
                Acompanhar o pedido
              </Link>
            )}
            {!visitante && (
              <Link href="/cadastro" className="botao-link-cheio botao-claro">
                Criar minha conta
              </Link>
            )}
            <button type="button" className="botao-secundario" onClick={() => setEnviado(null)}>
              Voltar à loja
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
