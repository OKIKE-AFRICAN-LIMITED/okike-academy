"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowUpRight } from "lucide-react";

export function Navbar() {
  const pathname = usePathname();

  const navLink = (href: string, label: string) => {
    const active =
      href === "/" ? pathname === "/" : pathname.startsWith(href);
    return (
      <Link
        href={href}
        className={`px-3.5 py-2 text-sm font-medium transition-colors border-b-2 ${
          active
            ? "border-[#0e0e0e] text-[#0e0e0e]"
            : "border-transparent text-[#595954] hover:text-[#0e0e0e]"
        }`}
      >
        {label}
      </Link>
    );
  };

  return (
    <header className="sticky top-0 z-50 bg-[#ffffff] text-[#0e0e0e] border-b border-[#d9d9d4]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-3 group">
          <span className="inline-flex items-center justify-center w-9 h-9 bg-[#0e0e0e] p-1.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/okike-logo.png"
              alt="Okike Academy Logo"
              className="w-full h-full object-contain"
            />
          </span>
          <div className="leading-none">
            <span className="block font-extrabold text-base tracking-[-0.03em] uppercase text-[#0e0e0e]">
              Okike Academy
            </span>
            <span className="block font-mono text-[10px] uppercase tracking-widest text-[#595954] mt-0.5">
              Learning Studio
            </span>
          </div>
        </Link>

        <nav className="flex items-center gap-1 sm:gap-2">
          {navLink("/", "Courses")}
          {navLink("/video-studio", "Video Queue")}
          <Link
            href="/create"
            className="ml-2 inline-flex items-center gap-1.5 h-10 px-4 bg-[#e3ee32] hover:bg-[#d8e324] text-[#0e0e0e] text-xs sm:text-sm font-semibold tracking-tight border border-[#0e0e0e] transition-colors"
          >
            <span>Build Course</span>
            <ArrowUpRight className="w-4 h-4" />
          </Link>
        </nav>
      </div>
    </header>
  );
}
