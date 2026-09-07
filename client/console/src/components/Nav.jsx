"use client";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { api } from "../lib/api.js";
import { t } from "../lib/labels.js";

const TABS = [
  ["/rates", "rates"],
  ["/acceptances", "acceptances"],
  ["/verify", "verify"],
  ["/history", "history"],
  ["/flags", "flags"],
];

export default function Nav() {
  const router = useRouter();
  const pathname = usePathname();
  async function logout() {
    await api.post("/auth/logout").catch(() => {});
    router.push("/login");
  }
  return (
    <nav>
      <div className="nav-links">
        {TABS.map(([href, key]) => (
          <Link key={href} href={href} aria-current={pathname?.startsWith(href) ? "page" : undefined}>
            {t(key)}
          </Link>
        ))}
      </div>
      <button type="button" onClick={logout}>
        {t("logout")}
      </button>
    </nav>
  );
}
