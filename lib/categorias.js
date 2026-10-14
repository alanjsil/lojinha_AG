// Agrupa produtos pelas categorias (ordem da categoria, depois nome); sem categoria vai para "Outros", no fim.
// Categoria sem produtos não aparece. Usado no Estoque e na vitrine.
export const SEM_CATEGORIA = { id: null, nome: "Outros", ordem: Infinity, foto_url: null };

export function agruparPorCategoria(produtos, categorias) {
  const porId = new Map(categorias.map((c) => [c.id, c]));
  const grupos = new Map();
  for (const p of produtos) {
    const cat = porId.get(p.categoria_id) ?? SEM_CATEGORIA;
    if (!grupos.has(cat.id)) grupos.set(cat.id, { ...cat, produtos: [] });
    grupos.get(cat.id).produtos.push(p);
  }
  return [...grupos.values()].sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome, "pt-BR"));
}
