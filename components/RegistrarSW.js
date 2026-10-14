"use client";

import { useEffect } from "react";

// Instala o service worker (public/sw.js) só em produção: no dev ele atrapalharia o hot reload
export default function RegistrarSW() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return null;
}
