"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
  async function logout() {
    await api.post("/auth/logout").catch(() => {});
    router.push("/login");
  }
  return (
    <nav>
      {TABS.map(([href, key]) => (
        <Link key={href} href={href}>
          {t(key)}
        </Link>
      ))}
      <button type="button" onClick={logout}>
        {t("logout")}
      </button>
    </nav>
  );
}
