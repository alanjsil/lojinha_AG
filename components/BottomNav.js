"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const icone = (d) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
);

const links = [
  {
    href: "/vendas",
    label: "Vendas",
    icone: icone("M6 6h15l-1.5 9h-12zM6 6L5 3H2M9 20a1 1 0 100-2 1 1 0 000 2zM18 20a1 1 0 100-2 1 1 0 000 2z"),
  },
  {
    href: "/estoque",
    label: "Estoque",
    icone: icone("M3 7l9-4 9 4v10l-9 4-9-4V7zM3 7l9 4 9-4M12 11v10"),
  },
  { href: "/saidas", label: "Saídas", icone: icone("M12 5v14M19 12l-7 7-7-7") },
  {
    href: "/resumos",
    label: "Resumos",
    icone: icone("M4 20V10M10 20V4M16 20v-7M22 20H2"),
  },
];

// Navegação em abas fixas no rodapé: é onde o polegar alcança no celular
export default function BottomNav() {
  const pathname = usePathname();
  if (pathname === "/login") return null; // antes do login não tem para onde navegar

  return (
    <nav className="bottom-nav">
      {links.map((link) => (
        <Link key={link.href} href={link.href} className={pathname.startsWith(link.href) ? "active" : ""}>
          {link.icone}
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
