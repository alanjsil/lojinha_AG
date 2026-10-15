-- 025: a observação da venda (024) também é editável (junto das demais colunas editáveis).
grant
update (data, quantidade, preco_unit, pagamento, parcelas, obs) on vendas to authenticated;
