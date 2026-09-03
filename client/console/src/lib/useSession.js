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
      // /auth/me returns { id, name, email } directly (req.recycler shape)
      .then((r) => setRecycler(r))
      .catch(() => router.push("/login"));
  }, [router]);
  return recycler;
}
