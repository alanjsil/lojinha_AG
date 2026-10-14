// Foto tirada no celular tem 3–8 MB; antes de subir, reduz para no máximo LADO_MAX px e WebP,
// o que fica em ~50–150 KB e cabe no limite das Server Actions.
export const LADO_MAX = 800;

// novas dimensões mantendo a proporção; nunca aumenta
export function dimensoesReduzidas(largura, altura, max = LADO_MAX) {
  const escala = Math.min(1, max / Math.max(largura, altura));
  return { largura: Math.round(largura * escala), altura: Math.round(altura * escala) };
}

// só no navegador (canvas)
export async function reduzirImagem(arquivo, max = LADO_MAX) {
  const bitmap = await createImageBitmap(arquivo, { imageOrientation: "from-image" });
  const { largura, altura } = dimensoesReduzidas(bitmap.width, bitmap.height, max);
  const canvas = document.createElement("canvas");
  canvas.width = largura;
  canvas.height = altura;
  canvas.getContext("2d").drawImage(bitmap, 0, 0, largura, altura);
  bitmap.close();
  const blob = await new Promise((ok) => canvas.toBlob(ok, "image/webp", 0.8));
  // Safari antigo não gera WebP e devolve PNG: cai para JPEG
  if (blob?.type === "image/webp") return blob;
  return new Promise((ok) => canvas.toBlob(ok, "image/jpeg", 0.85));
}
