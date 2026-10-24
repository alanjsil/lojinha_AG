// Só os serviços de push dos navegadores (FCM do Chrome/Android/Brave/Edge novo, Mozilla, Windows e Apple).
// Sem isso, qualquer cliente cadastrado registra um https:// dele ou de um serviço interno e o servidor faz
// um POST para lá a cada aviso (SSRF cega). Mesma lista da constraint push_inscricoes_endpoint_host (mig. 036).
const HOSTS = [/^fcm\.googleapis\.com$/, /(^|\.)push\.services\.mozilla\.com$/, /\.notify\.windows\.com$/, /(^|\.)push\.apple\.com$/];

export function endpointPushValido(texto) {
  let url;
  try {
    url = new URL(String(texto ?? ""));
  } catch {
    return false;
  }
  return url.protocol === "https:" && !url.username && !url.password && !url.port && HOSTS.some((h) => h.test(url.hostname));
}
