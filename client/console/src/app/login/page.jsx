"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "../../lib/api.js";
import { t } from "../../lib/labels.js";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api.post("/auth/login", { email, password });
      router.push("/rates");
    } catch {
      // The API returns the same body for a wrong email and a wrong password,
      // so this message must not distinguish them either.
      setError("Sign in failed. Check the email and password.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={{ maxWidth: 360, margin: "10vh auto", padding: 24 }}>
      <h1>Bhaav — {t("login")}</h1>
      <form onSubmit={submit}>
        <label htmlFor="email">Email</label>
        <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {error && <p role="alert">{error}</p>}
        <button type="submit" disabled={busy}>
          {t("login")}
        </button>
      </form>
    </main>
  );
}
