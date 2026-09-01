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
      .then((r) => setRecycler(r.recycler))
      .catch(() => router.push("/login"));
  }, [router]);
  return recycler;
}
