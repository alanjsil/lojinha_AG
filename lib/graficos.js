// Geometria dos gráficos SVG do Painel (sem biblioteca).

// teto "redondo" do eixo y e as marcas: 1, 2, 2.5 ou 5 × 10^n, com `n` divisões
export function escalaY(maximo, n = 4) {
  if (!(maximo > 0)) return { teto: 1, marcas: Array.from({ length: n + 1 }, (_, i) => i / n) };
  const passoBruto = maximo / n;
  const ordem = 10 ** Math.floor(Math.log10(passoBruto));
  const passo = [1, 2, 2.5, 5, 10].map((f) => f * ordem).find((p) => p >= passoBruto);
  return { teto: passo * n, marcas: Array.from({ length: n + 1 }, (_, i) => i * passo) };
}

// x de cada um dos `total` pontos, distribuídos de `inicio` a `fim`
export function posicaoX(i, total, inicio, fim) {
  if (total <= 1) return (inicio + fim) / 2;
  return inicio + ((fim - inicio) * i) / (total - 1);
}

// "M x,y L x,y ..." de uma série, com y=0 na base (alturaUtil) e y=teto no topo
export function caminhoLinha(valores, { inicio, fim, topo, base, teto }) {
  return valores
    .map((v, i) => {
      const x = posicaoX(i, valores.length, inicio, fim);
      const y = base - ((base - topo) * Math.max(v, 0)) / teto;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

// fatias de rosca: ângulos acumulados (0 a 2π) a partir dos valores
export function fatias(valores) {
  const total = valores.reduce((s, v) => s + Math.max(v, 0), 0);
  let ang = 0;
  return valores.map((v) => {
    const fracao = total > 0 ? Math.max(v, 0) / total : 0;
    const inicio = ang;
    ang += fracao * 2 * Math.PI;
    return { inicio, fim: ang, fracao };
  });
}

// arco de anel (rosca) em SVG, do ângulo a0 ao a1 (0 = topo, sentido horário)
export function arcoRosca(cx, cy, rFora, rDentro, a0, a1) {
  // anel completo: dois meios arcos (um arco só de 360° não desenha)
  if (a1 - a0 >= 2 * Math.PI - 1e-6) return `${arcoRosca(cx, cy, rFora, rDentro, a0, a0 + Math.PI)} ${arcoRosca(cx, cy, rFora, rDentro, a0 + Math.PI, a1)}`;
  const p = (r, a) => `${(cx + r * Math.sin(a)).toFixed(2)},${(cy - r * Math.cos(a)).toFixed(2)}`;
  const grande = a1 - a0 > Math.PI ? 1 : 0;
  return `M${p(rFora, a0)} A${rFora},${rFora} 0 ${grande} 1 ${p(rFora, a1)} L${p(rDentro, a1)} A${rDentro},${rDentro} 0 ${grande} 0 ${p(rDentro, a0)} Z`;
}
