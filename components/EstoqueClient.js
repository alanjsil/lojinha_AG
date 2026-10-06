"use client";

import { useEffect, useState } from "react";
import { registrarContagem, salvarProduto } from "../app/actions";
import { brl, dataBR, hoje, numero, preenchido, qtd } from "../lib/formato";
import useEnvio, { Mensagem } from "./useEnvio";

const VAZIO = {
  id: null,
  nome: "",
  unidade: "un",
  custo: "",
  preco: "",
  ativo: true,
};

function FormProduto({ inicial, aoFechar, gerente, embutido = false }) {
  const { salvando, msg, enviar } = useEnvio();
  const [f, setF] = useState(inicial);
  const set = (campo) => (e) => setF({ ...f, [campo]: e.target.value });

  const custo = numero(f.custo);
  const preco = numero(f.preco);
  const pronto =
    f.nome.trim() &&
    preenchido(f.custo) &&
    preenchido(f.preco) &&
    preco > 0 &&
    custo >= 0;

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
      <input
        id="unidade"
        value={f.unidade}
        onChange={set("unidade")}
        placeholder="un, kg, cx..."
      />
      <div className="linha-2">
        <div>
          <label htmlFor="custo">Custo (R$) *</label>
          <input
            id="custo"
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            value={f.custo}
            onChange={set("custo")}
            disabled={!gerente}
            required
          />
          {gerente && f.id && (
            <p className="sub">
              Vale só até a 1ª compra; depois o custo passa a ser a média
              ponderada das compras, calculada automaticamente.
            </p>
          )}
        </div>
        <div>
          <label htmlFor="preco">Preço (R$) *</label>
          <input
            id="preco"
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            value={f.preco}
            onChange={set("preco")}
            disabled={!gerente}
            required
          />
        </div>
      </div>
      {pronto && (
        <p className={preco < custo ? "info negativo" : "info"}>
          {preco < custo ? "Atenção: preço abaixo do custo. " : ""}Lucro por
          unidade: {brl(preco - custo)}
        </p>
      )}
      {f.id && (
        <label className="chk">
          <input
            type="checkbox"
            checked={f.ativo}
            onChange={(e) => setF({ ...f, ativo: e.target.checked })}
          />
          Ativo (aparece nas vendas)
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

function FormContagem({ produtos }) {
  const { salvando, msg, enviar } = useEnvio();
  const [produtoId, setProdutoId] = useState("");
  const [quantidade, setQuantidade] = useState("");
  const [observacao, setObservacao] = useState("");
  const [data, setData] = useState("");
  useEffect(() => setData(hoje()), []);

  const produto = produtos.find((p) => p.id === produtoId);
  const diferenca =
    produto && preenchido(quantidade)
      ? numero(quantidade) - produto.saldo
      : null;

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
      <select
        id="cprod"
        value={produtoId}
        onChange={(e) => setProdutoId(e.target.value)}
        required
      >
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
      <input
        id="cqtd"
        type="number"
        inputMode="decimal"
        step="any"
        min="0"
        value={quantidade}
        onChange={(e) => setQuantidade(e.target.value)}
        required
      />
      {diferenca !== null && diferenca !== 0 && (
        <p className={diferenca < 0 ? "info negativo" : "info positivo"}>
          Diferença: {diferenca > 0 ? "+" : ""}
          {qtd(diferenca)} {produto.unidade} (o estoque será ajustado)
        </p>
      )}
      <label htmlFor="cobs">Observação</label>
      <input
        id="cobs"
        value={observacao}
        onChange={(e) => setObservacao(e.target.value)}
      />
      <label htmlFor="cdata">Data</label>
      <input
        id="cdata"
        type="date"
        value={data}
        onChange={(e) => setData(e.target.value)}
        required
      />
      <button type="submit" disabled={salvando}>
        {salvando ? "Salvando..." : "Registrar contagem"}
      </button>
      <Mensagem msg={msg} />
    </form>
  );
}

export default function EstoqueClient({ produtos, contagens, gerente }) {
  const [aba, setAba] = useState("produtos");
  const [editando, setEditando] = useState(null);

  return (
    <>
      <div className="segmentos">
        <button
          type="button"
          className={aba === "produtos" ? "ativo" : ""}
          onClick={() => setAba("produtos")}
        >
          Produtos
        </button>
        <button
          type="button"
          className={aba === "contagem" ? "ativo" : ""}
          onClick={() => setAba("contagem")}
        >
          Contagem
        </button>
      </div>

      {aba === "produtos" && (
        <>
          {editando && !editando.id ? (
            <FormProduto
              key={editando.id ?? "novo"}
              inicial={editando}
              gerente={gerente}
              aoFechar={() => setEditando(null)}
            />
          ) : gerente ? (
            <button
              type="button"
              style={{ marginTop: 0, marginBottom: 16 }}
              onClick={() => setEditando(VAZIO)}
            >
              Novo produto
            </button>
          ) : null}
          <div className="card">
            {produtos.length === 0 ? (
              <p className="vazio">Nenhum produto cadastrado.</p>
            ) : (
              <ul className="lista">
                {produtos.map((p) =>
                  editando?.id === p.id ? (
                    <li key={p.id} className="editando">
                      <FormProduto
                        key={p.id}
                        inicial={editando}
                        gerente={gerente}
                        aoFechar={() => setEditando(null)}
                        embutido
                      />
                    </li>
                  ) : (
                    <li
                      key={p.id}
                      className="editavel"
                      onClick={() =>
                        setEditando({
                          id: p.id,
                          nome: p.nome,
                          unidade: p.unidade,
                          custo: String(p.custo),
                          preco: String(p.preco),
                          ativo: p.ativo,
                        })
                      }
                    >
                      <div>
                        <div className="titulo">
                          {p.nome}
                          {!p.ativo && " (inativo)"}
                        </div>
                        <div className="sub">
                          Custo {brl(p.custo)} · Preço {brl(p.preco)}
                        </div>
                      </div>
                      <div
                        className={`valor ${p.saldo <= 0 ? "negativo" : ""}`}
                      >
                        {qtd(p.saldo)} {p.unidade}
                      </div>
                    </li>
                  ),
                )}
              </ul>
            )}
          </div>
        </>
      )}

      {aba === "contagem" && (
        <>
          <FormContagem produtos={produtos.filter((p) => p.ativo)} />
          <div className="card">
            <h2>Últimas contagens</h2>
            {contagens.length === 0 ? (
              <p className="vazio">Nenhuma contagem ainda.</p>
            ) : (
              <ul className="lista">
                {contagens.map((c) => (
                  <li key={c.id}>
                    <div>
                      <div className="titulo">{c.produto}</div>
                      <div className="sub">
                        {dataBR(c.data)} · sistema {qtd(c.sistema)} → contado{" "}
                        {qtd(c.contada)}
                      </div>
                    </div>
                    <div
                      className={`valor ${c.diferenca < 0 ? "negativo" : c.diferenca > 0 ? "positivo" : ""}`}
                    >
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
