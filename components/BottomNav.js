"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Icone from "./Icone";
import { rotaCliente, rotaPublica } from "../lib/rotas";

const icone = (d) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
);

const links = [
  {
    href: "/vendas",
    label: "Vendas",
    icone: <Icone nome="caixa" />,
  },
  {
    href: "/estoque",
    label: "Estoque",
    icone: <Icone nome="estoque" />,
  },
  { href: "/saidas", label: "Saídas", icone: <Icone nome="entrada" />, soGerente: true }, // despesas e lançamentos
  {
    href: "/resumos",
    label: "Resumos",
    icone: <Icone nome="relatorios" />,
  },
  // só no PC (classe so-pc); vendedor que abrir cai no Resumos
  {
    href: "/painel",
    label: "Painel",
    icone: icone("M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z"),
    className: "so-pc",
  },
];

// Navegação em abas fixas no rodapé: é onde o polegar alcança no celular
export default function BottomNav({ gerente = false }) {
  const pathname = usePathname();
  if (rotaPublica(pathname) || rotaCliente(pathname)) return null; // vitrine/login/offline: não tem para onde navegar

  return (
    <nav className="bottom-nav">
      {links.filter((link) => gerente || !link.soGerente).map((link) => (
        <Link key={link.href} href={link.href} className={[link.className, pathname.startsWith(link.href) ? "active" : ""].filter(Boolean).join(" ")}>
          {link.icone}
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
