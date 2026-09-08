"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { api } from "../lib/api.js";
import { t } from "../lib/labels.js";

// Two disjoint tab sets keyed by role, not one flat array — an admin account
// has no recycler-scoped data to show on /rates, /acceptances etc., and
// globals.css already documents that five tabs + Sign out overflow at 390px,
// so appending a sixth admin tab to every recycler's nav would make that
// worse for no reason. Default export's `role` prop is optional and unused
// by every existing recycler page, which keeps rendering exactly the tabs it
// always has.
const TABS_BY_ROLE = {
  RECYCLER: [
    ["/rates", "rates"],
    ["/acceptances", "acceptances"],
    ["/verify", "verify"],
    ["/history", "history"],
    ["/flags", "flags"],
  ],
  ADMIN: [
    ["/admin/queue", "admin_queue"],
    ["/admin/recyclers", "admin_recyclers"],
    ["/admin/reports", "admin_reports"],
    ["/admin/badges", "admin_badges"],
  ],
};

export default function Nav({ role = "RECYCLER" }) {
  const router = useRouter();
  const pathname = usePathname();
  const tabs = TABS_BY_ROLE[role] ?? TABS_BY_ROLE.RECYCLER;

  // Green "MPCB verified" badge — GET /auth/me returns mpcbVerified: null
  // for an admin session (no recycler to have a badge), so this is scoped to
  // the RECYCLER nav only. A small self-fetch here (rather than threading it
  // down from each of the five recycler pages' own useSession() call) keeps
  // this a one-file change; the extra /auth/me hit is cheap and every
  // recycler page already makes one of its own via useSession().
  const [mpcbVerified, setMpcbVerified] = useState(null);
  useEffect(() => {
    if (role !== "RECYCLER") return;
    api.get("/auth/me").then((r) => setMpcbVerified(r.mpcbVerified)).catch(() => {});
  }, [role]);

  async function logout() {
    await api.post("/auth/logout").catch(() => {});
    router.push("/login");
  }
  return (
    <nav>
      <div className="nav-links">
        {tabs.map(([href, key]) => (
          <Link key={href} href={href} aria-current={pathname?.startsWith(href) ? "page" : undefined}>
            {t(key)}
          </Link>
        ))}
        {mpcbVerified && <span className="badge badge-ok">{t("mpcb_verified_badge")}</span>}
      </div>
      <button type="button" onClick={logout}>
        {t("logout")}
      </button>
    </nav>
  );
}
