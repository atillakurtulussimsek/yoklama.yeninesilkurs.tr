"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { logout } from "@/app/giris/actions";

type NavLink = { href: string; label: string; admin?: boolean };
type NavGroup = { key: string; label: string; links: NavLink[]; admin?: boolean };

const HOME: NavLink = { href: "/", label: "Özet" };

const GROUPS: NavGroup[] = [
  {
    key: "yoklama",
    label: "Yoklama",
    links: [
      { href: "/yoklama", label: "Yoklama Al" },
      { href: "/gunluk-devamsizlik", label: "Günlük Devamsızlık" },
      { href: "/veli-bilgilendirme", label: "Veli Bilgilendirme" },
      { href: "/yoklama-fisleri", label: "Yoklama Fişleri" },
    ],
  },
  {
    key: "kisiler",
    label: "Öğrenciler",
    links: [
      { href: "/ogrenciler", label: "Öğrenci Listesi" },
      { href: "/ogrenciler/ice-aktar", label: "Excel'den Aktar" },
      { href: "/ogretmenler", label: "Öğretmenler", admin: true },
    ],
  },
  {
    key: "raporlar",
    label: "Raporlar",
    links: [
      { href: "/raporlar", label: "Devamsızlık Raporu" },
      { href: "/raporlar/surekli-devamsiz", label: "Sürekli Devamsızlar" },
    ],
  },
  {
    key: "ayarlar",
    label: "Ayarlar",
    admin: true,
    links: [
      { href: "/ayarlar", label: "Yoklama Ayarları" },
      { href: "/ayarlar/kurumlar", label: "Kurumlar ve Yıllar" },
      { href: "/ayarlar/kullanicilar", label: "Kullanıcılar" },
    ],
  },
];

const STORAGE_KEY = "yoklama.nav.open";

function isActive(href: string, pathname: string, all: string[]) {
  if (href === "/") return pathname === "/";
  if (!pathname.startsWith(href)) return false;
  // Daha uzun eşleşen bir bağlantı varsa o aktif sayılır
  return !all.some((other) => other !== href && other.length > href.length && pathname.startsWith(other));
}

export default function NavLinks({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  const groups = GROUPS.filter((group) => isAdmin || !group.admin).map((group) => ({
    ...group,
    links: group.links.filter((link) => isAdmin || !link.admin),
  }));
  const allHrefs = [HOME.href, ...groups.flatMap((group) => group.links.map((link) => link.href))];
  const activeGroup = groups.find((group) => group.links.some((link) => isActive(link.href, pathname, allHrefs)))?.key;

  // Açık/kapalı durumu tarayıcıda hatırlanır; sunucu ile uyumsuzluk olmasın diye ilk çizimde boş, sonra yüklenir
  const [open, setOpen] = useState<Record<string, boolean>>({});
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      try {
        setOpen(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as Record<string, boolean>);
      } catch {
        /* yok say */
      }
    });
    return () => cancelAnimationFrame(id);
  }, []);

  function toggle(key: string) {
    setOpen((current) => {
      const next = { ...current, [key]: !(current[key] ?? key === activeGroup) };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* yok say */
      }
      return next;
    });
  }

  const linkClass = (active: boolean, nested = false) =>
    `block rounded-lg px-3 py-1.5 text-sm whitespace-nowrap ${nested ? "ml-3" : ""} ${
      active ? "bg-indigo-50 font-medium text-indigo-700" : "text-gray-600 hover:bg-gray-100"
    }`;

  return (
    <>
      {/* Masaüstü: açılır gruplar */}
      <nav className="hidden flex-1 flex-col gap-0.5 overflow-y-auto px-2 md:flex">
        <Link href={HOME.href} className={linkClass(isActive("/", pathname, allHrefs))}>
          {HOME.label}
        </Link>
        {groups.map((group) => {
          const expanded = open[group.key] ?? group.key === activeGroup;
          const groupActive = group.key === activeGroup;
          return (
            <div key={group.key} className="mt-1">
              <button
                type="button"
                onClick={() => toggle(group.key)}
                className={`flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-sm font-medium ${
                  groupActive && !expanded ? "text-indigo-700" : "text-gray-800"
                } hover:bg-gray-100`}
                aria-expanded={expanded}
              >
                {group.label}
                <span className={`text-xs text-gray-400 transition-transform ${expanded ? "rotate-90" : ""}`}>›</span>
              </button>
              {expanded && (
                <div className="mt-0.5 space-y-0.5">
                  {group.links.map((link) => (
                    <Link key={link.href} href={link.href} className={linkClass(isActive(link.href, pathname, allHrefs), true)}>
                      {link.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* Mobil: yatay kaydırılabilir düz liste */}
      <nav className="flex gap-1 overflow-x-auto px-2 pb-2 md:hidden">
        {[HOME, ...groups.flatMap((group) => group.links)].map((link) => (
          <Link key={link.href} href={link.href} className={linkClass(isActive(link.href, pathname, allHrefs))}>
            {link.label}
          </Link>
        ))}
        <form action={logout}>
          <button className="rounded-lg px-3 py-1.5 text-sm whitespace-nowrap text-gray-500">Çıkış</button>
        </form>
      </nav>
    </>
  );
}
