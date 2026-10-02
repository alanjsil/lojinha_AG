/** @type {import('next').NextConfig} */

// Cabeçalhos de segurança que valem para toda requisição. A CSP é a exceção: ela precisa de
// um nonce diferente em cada resposta, então é montada no middleware.js.
const cabecalhos = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  // clickjacking: impede que outra página ponha uma tela invisível por cima e clique nas
  // ações do app no lugar do usuário. O app guarda dado financeiro, então não vai embutido.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // o app não usa câmera, microfone nem GPS: fechar evita prompt inútil no celular
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

// Só em produção. Em http://localhost o HSTS faria o navegador tentar https e o dev pararia.
if (process.env.NODE_ENV === "production") {
  cabecalhos.push({ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" });
}

const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [{ source: "/:path*", headers: cabecalhos }];
  },
};

module.exports = nextConfig;
