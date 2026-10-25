// O PostgREST corta cada resposta no max_rows do projeto (padrão 1000) sem avisar: um .limit(5000) volta com 1000.
// todas() busca página a página até vir uma página incompleta. A consulta precisa de ordem estável (ex.: .order("id")).
export const PAGINA = 1000;

// fazer(de, ate) monta a consulta do zero a cada página: (de, ate) => supabase.from(...).select(...).order("id").range(de, ate)
export async function todas(fazer, { pagina = PAGINA, maximo = 100000 } = {}) {
  const linhas = [];
  for (let de = 0; de < maximo; de += pagina) {
    const { data, error } = await fazer(de, de + pagina - 1);
    if (error) return { data: linhas.length ? linhas : null, error };
    linhas.push(...(data ?? []));
    if ((data ?? []).length < pagina) break;
  }
  return { data: linhas, error: null };
}
