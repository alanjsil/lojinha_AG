"use client";

import { useEffect, useState } from "react";
import { editarContagem, excluirCategoria, excluirContagem, registrarContagem, salvarCategoria, salvarProduto } from "../app/actions";
import { agruparPorCategoria } from "../lib/categorias";
import { brl, dataBR, hoje, numero, preenchido, qtd } from "../lib/formato";
import AbaCompras from "./AbaCompras";
import BotaoExcluir from "./BotaoExcluir";
import CampoFoto from "./CampoFoto";
import ListaExpansivel from "./ListaExpansivel";
import useEnvio, { Mensagem } from "./useEnvio";

const CHAVE_OCULTAR_ZERADOS = "estoque-ocultar-zerados";

const VAZIO = {
  id: null,
  nome: "",
  unidade: "un",
  custo: "",
  preco: "",
  ativo: true,
  categoriaId: "",
  fotoUrl: "",
  descricao: "",
};

const CATEGORIA_VAZIA = { id: null, nome: "", ordem: "", fotoUrl: "", ativo: true };

function FormProduto({ inicial, aoFechar, gerente, categorias, embutido = false }) {
  const { salvando, msg, enviar } = useEnvio();
  const [f, setF] = useState(inicial);
  const set = (campo) => (e) => setF({ ...f, [campo]: e.target.value });

  const custo = numero(f.custo);
  const preco = numero(f.preco);
  const pronto = f.nome.trim() && preenchido(f.custo) && preenchido(f.preco) && preco > 0 && custo >= 0;

  return (
    <form
      className={embutido ? "form-inline" : "card"}
      onSubmit={(e) => {
        e.preventDefault();
        enviar(salvarProduto, f, {
          aoConcluir: aoFechar,
          textoOk: "Produto salvo!",
        });
      }}
    >
      {!embutido && <h2>{f.id ? "Editar produto" : "Novo produto"}</h2>}
      <label htmlFor="nome">Nome</label>
      <input id="nome" value={f.nome} onChange={set("nome")} required />
      <label htmlFor="unidade">Unidade</label>
      <input id="unidade" value={f.unidade} onChange={set("unidade")} placeholder="un, kg, cx..." />
      <div className={gerente ? "linha-2" : undefined}>
        {gerente && (
          <div>
            <label htmlFor="custo">Custo (R$) *</label>
            <input id="custo" type="number" inputMode="decimal" step="0.01" min="0" value={f.custo} onChange={set("custo")} required />
            {f.id && <p className="sub">Vale só até a 1ª compra; depois o custo passa a ser a média ponderada das compras, calculada automaticamente.</p>}
          </div>
        )}
        <div>
          <label htmlFor="preco">Preço (R$) *</label>
          <input id="preco" type="number" inputMode="decimal" step="0.01" min="0" value={f.preco} onChange={set("preco")} disabled={!gerente} required />
        </div>
      </div>
      {gerente && pronto && (
        <p className={preco < custo ? "info negativo" : "info"}>
          {preco < custo ? "Atenção: preço abaixo do custo. " : ""}Lucro por unidade: {brl(preco - custo)}
        </p>
      )}
      {gerente && (
        <>
          <label htmlFor="categoria">Categoria</label>
          <select id="categoria" value={f.categoriaId} onChange={set("categoriaId")}>
            <option value="">Sem categoria (Outros)</option>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
          <CampoFoto valor={f.fotoUrl} aoMudar={(fotoUrl) => setF((atual) => ({ ...atual, fotoUrl }))} />
          <label htmlFor="descricao">Descrição na loja (opcional)</label>
          <textarea id="descricao" rows={2} maxLength={500} value={f.descricao} onChange={set("descricao")} />
        </>
      )}
      {f.id && (
        <label className="chk">
          <input type="checkbox" checked={f.ativo} onChange={(e) => setF({ ...f, ativo: e.target.checked })} />
          Ativo (aparece nas vendas e na loja)
        </label>
      )}
      <button type="submit" disabled={salvando || !pronto}>
        {salvando ? "Salvando..." : "Salvar produto"}
      </button>
      <button type="button" className="botao-secundario" onClick={aoFechar}>
        Cancelar
      </button>
      <Mensagem msg={msg} />
    </form>
  );
}

// Categoria da loja: nome, ordem na vitrine e foto. Abre no lugar do item (ou no topo, se for nova).
function FormCategoria({ inicial, aoFechar, embutido = false }) {
  const { salvando, msg, enviar } = useEnvio();
  const [f, setF] = useState(inicial);
  const set = (campo) => (e) => setF({ ...f, [campo]: e.target.value });
  const sufixo = f.id ?? "nova";

  return (
    <form
      className={embutido ? "form-inline" : "card"}
      onSubmit={(e) => {
        e.preventDefault();
        enviar(salvarCategoria, f, { aoConcluir: aoFechar, textoOk: "Categoria salva!" });
      }}
    >
      {!embutido && <h2>Nova categoria</h2>}
      <label htmlFor={`catnome-${sufixo}`}>Nome</label>
      <input id={`catnome-${sufixo}`} value={f.nome} onChange={set("nome")} maxLength={60} required />
      <label htmlFor={`catordem-${sufixo}`}>Ordem na loja</label>
      <input id={`catordem-${sufixo}`} type="number" inputMode="numeric" step="1" min="0" max="999" value={f.ordem} onChange={set("ordem")} placeholder="0 = primeiro" />
      <CampoFoto valor={f.fotoUrl} pasta="categorias" aoMudar={(fotoUrl) => setF((atual) => ({ ...atual, fotoUrl }))} />
      {f.id && (
        <label className="chk">
          <input type="checkbox" checked={f.ativo} onChange={(e) => setF({ ...f, ativo: e.target.checked })} />
          Ativa (aparece na loja)
        </label>
      )}
      <div className="acoes-item">
        <button type="button" className="botao-secundario" onClick={aoFechar}>
          Cancelar
        </button>
        <button type="submit" disabled={salvando || !f.nome.trim()}>
          {salvando ? "Salvando..." : "Salvar"}
        </button>
      </div>
      {f.id && <BotaoExcluir texto="Excluir categoria" onConfirmar={() => enviar(excluirCategoria, f.id, { aoConcluir: aoFechar, textoOk: "Categoria excluída." })} />}
      <Mensagem msg={msg} />
    </form>
  );
}

function AbaCategorias({ categorias, produtos }) {
  const [editando, setEditando] = useState(null);
  const contagem = (id) => produtos.filter((p) => p.categoria_id === id).length;

  return (
    <>
      {editando && !editando.id ? (
        <FormCategoria inicial={editando} aoFechar={() => setEditando(null)} />
      ) : (
        <button type="button" style={{ marginTop: 0, marginBottom: 16 }} onClick={() => setEditando(CATEGORIA_VAZIA)}>
          Nova categoria
        </button>
      )}
      <div className="card">
        {categorias.length === 0 ? (
          <p className="vazio">Nenhuma categoria. Sem categoria, os produtos aparecem em &quot;Outros&quot; na loja.</p>
        ) : (
          <ul className="lista">
            {categorias.map((c) =>
              editando?.id === c.id ? (
                <li key={c.id} className="editando">
                  <FormCategoria inicial={editando} aoFechar={() => setEditando(null)} embutido />
                </li>
              ) : (
                <li key={c.id} className="editavel" onClick={() => setEditando({ id: c.id, nome: c.nome, ordem: String(c.ordem), fotoUrl: c.foto_url ?? "", ativo: c.ativo })}>
                  <Miniatura url={c.foto_url} nome={c.nome} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="titulo">
                      {c.nome}
                      {!c.ativo && " (inativa)"}
                    </div>
                    <div className="sub">Ordem {c.ordem}</div>
                  </div>
                  <div className="valor">{contagem(c.id)} prod.</div>
                </li>
              ),
            )}
          </ul>
        )}
        <p className="info">Excluir uma categoria não apaga os produtos: eles passam para &quot;Outros&quot;.</p>
      </div>
    </>
  );
}

function Miniatura({ url, nome }) {
  if (!url)
    return (
      <span className="miniatura vazia" aria-hidden="true">
        {nome.trim()[0]?.toUpperCase() ?? "?"}
      </span>
    );
  // eslint-disable-next-line @next/next/no-img-element -- foto já reduzida no envio
  return <img src={url} alt="" className="miniatura" loading="lazy" />;
}

function FormContagem({ produtos }) {
  const { salvando, msg, enviar } = useEnvio();
  const [produtoId, setProdutoId] = useState("");
  const [quantidade, setQuantidade] = useState("");
  const [observacao, setObservacao] = useState("");
  const [data, setData] = useState("");
  useEffect(() => setData(hoje()), []);

  const produto = produtos.find((p) => p.id === produtoId);
  const diferenca = produto && preenchido(quantidade) ? numero(quantidade) - produto.saldo : null;

  return (
    <form
      className="card"
      onSubmit={(e) => {
        e.preventDefault();
        enviar(
          registrarContagem,
          { produtoId, quantidade, observacao, data },
          {
            textoOk: "Contagem registrada; estoque ajustado.",
            aoConcluir: () => {
              setProdutoId("");
              setQuantidade("");
              setObservacao("");
            },
          },
        );
      }}
    >
      <h2>Contagem de estoque</h2>
      <label htmlFor="cprod">Produto</label>
      <select id="cprod" value={produtoId} onChange={(e) => setProdutoId(e.target.value)} required>
        <option value="">Escolha...</option>
        {produtos.map((p) => (
          <option key={p.id} value={p.id}>
            {p.nome}
          </option>
        ))}
      </select>
      {produto && (
        <p className="info">
          O sistema calcula {qtd(produto.saldo)} {produto.unidade}.
        </p>
      )}
      <label htmlFor="cqtd">Quantidade contada</label>
      <input id="cqtd" type="number" inputMode="decimal" step="any" min="0" value={quantidade} onChange={(e) => setQuantidade(e.target.value)} required />
      {diferenca !== null && diferenca !== 0 && (
        <p className={diferenca < 0 ? "info negativo" : "info positivo"}>
          Diferença: {diferenca > 0 ? "+" : ""}
          {qtd(diferenca)} {produto.unidade} (o estoque será ajustado)
        </p>
      )}
      <label htmlFor="cobs">Observação</label>
      <input id="cobs" value={observacao} onChange={(e) => setObservacao(e.target.value)} />
      <label htmlFor="cdata">Data</label>
      <input id="cdata" type="date" value={data} onChange={(e) => setData(e.target.value)} required />
      <button type="submit" disabled={salvando}>
        {salvando ? "Salvando..." : "Registrar contagem"}
      </button>
      <Mensagem msg={msg} />
    </form>
  );
}

// Gerente corrige a contagem: muda a quantidade contada, a observação e a data (a diferença é recalculada)
function FormEditarContagem({ contagem, aoFechar }) {
  const { salvando, msg, enviar } = useEnvio();
  const [f, setF] = useState({
    quantidade: String(contagem.contada),
    observacao: contagem.observacao ?? "",
    data: contagem.data,
  });
  const set = (campo) => (e) => setF({ ...f, [campo]: e.target.value });
  const diferenca = preenchido(f.quantidade) ? numero(f.quantidade) - contagem.sistema : null;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        enviar(editarContagem, { id: contagem.id, ...f }, { textoOk: "Contagem atualizada!", aoConcluir: aoFechar });
      }}
    >
      <p className="info">O sistema calculava {qtd(contagem.sistema)} na hora da contagem.</p>
      <label htmlFor={`ecqtd-${contagem.id}`}>Quantidade contada</label>
      <input id={`ecqtd-${contagem.id}`} type="number" inputMode="decimal" step="any" min="0" value={f.quantidade} onChange={set("quantidade")} required />
      {diferenca !== null && (
        <p className={diferenca < 0 ? "info negativo" : diferenca > 0 ? "info positivo" : "info"}>
          Diferença: {diferenca > 0 ? "+" : ""}
          {qtd(diferenca)}
        </p>
      )}
      <label htmlFor={`ecobs-${contagem.id}`}>Observação</label>
      <input id={`ecobs-${contagem.id}`} value={f.observacao} onChange={set("observacao")} />
      <label htmlFor={`ecdata-${contagem.id}`}>Data</label>
      <input id={`ecdata-${contagem.id}`} type="date" value={f.data} onChange={set("data")} required />
      <div className="acoes-item">
        <button type="button" className="botao-secundario" onClick={aoFechar}>
          Cancelar
        </button>
        <button type="submit" disabled={salvando}>
          {salvando ? "Salvando..." : "Salvar"}
        </button>
      </div>
      <Mensagem msg={msg} />
    </form>
  );
}

export default function EstoqueClient({ produtos, categorias, contagens, compras, produtosCompra, gerente, veCompras, cartoes }) {
  const [aba, setAba] = useState("produtos");
  const [editando, setEditando] = useState(null);
  const [ocultarZerados, setOcultarZerados] = useState(false);
  useEffect(() => {
    try {
      setOcultarZerados(localStorage.getItem(CHAVE_OCULTAR_ZERADOS) === "1");
    } catch {}
  }, []);
  function alternarZerados() {
    const novo = !ocultarZerados;
    setOcultarZerados(novo);
    try {
      localStorage.setItem(CHAVE_OCULTAR_ZERADOS, novo ? "1" : "0");
    } catch {}
  }
  const visiveis = ocultarZerados ? produtos.filter((p) => p.saldo > 0 || editando?.id === p.id) : produtos;
  // sem nenhuma categoria cadastrada a lista continua corrida, como antes
  const grupos = categorias.length ? agruparPorCategoria(visiveis, categorias) : [{ id: null, nome: null, produtos: visiveis }];

  const itemProduto = (p) =>
    editando?.id === p.id ? (
      <li key={p.id} className="editando">
        <FormProduto key={p.id} inicial={editando} gerente={gerente} categorias={categorias} aoFechar={() => setEditando(null)} embutido />
      </li>
    ) : (
      <li
        key={p.id}
        className={gerente ? "editavel" : undefined}
        onClick={() =>
          gerente &&
          setEditando({
            id: p.id,
            nome: p.nome,
            unidade: p.unidade,
            custo: String(p.custo),
            preco: String(p.preco),
            ativo: p.ativo,
            categoriaId: p.categoria_id ?? "",
            fotoUrl: p.foto_url ?? "",
            descricao: p.descricao ?? "",
          })
        }
      >
        {p.foto_url && <Miniatura url={p.foto_url} nome={p.nome} />}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="titulo">
            {p.nome}
            {!p.ativo && " (inativo)"}
          </div>
          <div className="sub">
            Custo {brl(p.custo)} · Preço {brl(p.preco)}
          </div>
        </div>
        <div className={`valor ${p.saldo <= 0 ? "negativo" : ""}`}>
          {qtd(p.saldo)} {p.unidade}
        </div>
      </li>
    );

  return (
    <>
      <div className="titulo-linha">
        <h1>Estoque</h1>
        <button type="button" className={`filtro-chip ${ocultarZerados ? "ativo" : ""}`} aria-pressed={ocultarZerados} onClick={alternarZerados}>
          {ocultarZerados ? "Mostrar zerados" : "Ocultar zerados"}
        </button>
      </div>
      <div className="segmentos">
        <button type="button" className={aba === "produtos" ? "ativo" : ""} onClick={() => setAba("produtos")}>
          Estoque
        </button>
        {veCompras && (
          <button type="button" className={aba === "compras" ? "ativo" : ""} onClick={() => setAba("compras")}>
            Compras
          </button>
        )}
        {veCompras && (
          <button type="button" className={aba === "contagem" ? "ativo" : ""} onClick={() => setAba("contagem")}>
            Contagem
          </button>
        )}
        {gerente && (
          <button type="button" className={aba === "categorias" ? "ativo" : ""} onClick={() => setAba("categorias")}>
            Categorias
          </button>
        )}
      </div>

      {aba === "produtos" && (
        <>
          {editando && !editando.id ? (
            <FormProduto key={editando.id ?? "novo"} inicial={editando} gerente={gerente} categorias={categorias} aoFechar={() => setEditando(null)} />
          ) : gerente ? (
            <button type="button" style={{ marginTop: 0, marginBottom: 16 }} onClick={() => setEditando(VAZIO)}>
              Novo produto
            </button>
          ) : null}
          {visiveis.length === 0 ? (
            <div className="card">
              <p className="vazio">{produtos.length === 0 ? "Nenhum produto cadastrado." : "Nenhum produto com saldo."}</p>
            </div>
          ) : (
            grupos.map((g) =>
              g.nome === null ? (
                <div className="card" key="todos">
                  <ul className="lista">{g.produtos.map(itemProduto)}</ul>
                </div>
              ) : (
                // seção retrátil por categoria; o navegador lembra aberta/fechada enquanto a tela não recarrega
                <details className="card grupo-categoria" key={g.id ?? "outros"} open>
                  <summary>
                    <Miniatura url={g.foto_url} nome={g.nome} />
                    <span className="titulo">{g.nome}</span>
                    <span className="sub">{g.produtos.length}</span>
                  </summary>
                  <ul className="lista">{g.produtos.map(itemProduto)}</ul>
                </details>
              ),
            )
          )}
        </>
      )}

      {aba === "compras" && veCompras &&<AbaCompras produtos={produtosCompra} compras={compras} cartoes={cartoes} gerente={gerente} />}

      {aba === "categorias" && gerente && <AbaCategorias categorias={categorias} produtos={produtos} />}

      {aba === "contagem" && veCompras && (
        <>
          <FormContagem produtos={produtos.filter((p) => p.ativo)} />
          <div className="card">
            <h2>Últimas contagens</h2>
            {contagens.length === 0 ? (
              <p className="vazio">Nenhuma contagem ainda.</p>
            ) : gerente ? (
              <ListaExpansivel
                itens={contagens.map((c) => ({
                  id: c.id,
                  titulo: c.produto,
                  sub: `${dataBR(c.data)} · sistema ${qtd(c.sistema)} → contado ${qtd(c.contada)}`,
                  valor: (
                    <span className={c.diferenca < 0 ? "negativo" : c.diferenca > 0 ? "positivo" : ""}>
                      {c.diferenca > 0 ? "+" : ""}
                      {qtd(c.diferenca)}
                    </span>
                  ),
                  detalhes: ["Excluir desfaz o ajuste que esta contagem fez no estoque.", ...(c.observacao ? [`Obs.: ${c.observacao}`] : [])],
                  dados: c,
                }))}
                excluir={excluirContagem}
                renderEditar={(item, fechar) => <FormEditarContagem contagem={item.dados} aoFechar={fechar} />}
              />
            ) : (
              <ul className="lista">
                {contagens.map((c) => (
                  <li key={c.id}>
                    <div>
                      <div className="titulo">{c.produto}</div>
                      <div className="sub">
                        {dataBR(c.data)} · sistema {qtd(c.sistema)} → contado {qtd(c.contada)}
                      </div>
                    </div>
                    <div className={`valor ${c.diferenca < 0 ? "negativo" : c.diferenca > 0 ? "positivo" : ""}`}>
                      {c.diferenca > 0 ? "+" : ""}
                      {qtd(c.diferenca)}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </>
  );
}
