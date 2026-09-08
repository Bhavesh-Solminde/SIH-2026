"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "./api.js";

export function useSession() {
  const router = useRouter();
  const [recycler, setRecycler] = useState(null);
  useEffect(() => {
    api
      .get("/auth/me")
      // /auth/me returns { id, name, email, role } — id/name are absent for
      // an admin account (see middleware/requireSession.js). Every
      // /recycler/* route now 403s an admin session (routes/recycler.js) —
      // correct, but without this redirect an admin who lands on a
      // recycler page (e.g. the session cookie from a previous admin login
      // is still active) saw a raw "Failed to load rates:
      // recycler_account_required" instead of just landing on their own
      // section.
      .then((r) => {
        if (r.role === "ADMIN") {
          router.push("/admin/queue");
          return;
        }
        setRecycler(r);
      })
      .catch(() => router.push("/login"));
  }, [router]);
  return recycler;
}

// Same session check, but for the admin pages: redirects anyone who isn't
// role: "ADMIN" to /rates rather than /login (they ARE signed in — they're
// just not looking at their own console section).
export function useAdminSession() {
  const router = useRouter();
  const [account, setAccount] = useState(null);
  useEffect(() => {
    api
      .get("/auth/me")
      .then((r) => {
        if (r.role !== "ADMIN") {
          router.push("/rates");
          return;
        }
        setAccount(r);
      })
      .catch(() => router.push("/login"));
  }, [router]);
  return account;
}
