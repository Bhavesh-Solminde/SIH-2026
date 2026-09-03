"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "../../lib/api.js";
import { t } from "../../lib/labels.js";
import { clog } from "../../lib/logger.js";

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
    clog.auth.info("login attempt", { email });
    try {
      const result = await api.post("/auth/login", { email, password });
      clog.auth.info("login success", { name: result.name });
      router.push("/rates");
    } catch (err) {
      clog.auth.warn("login failed", { email, error: err.message });
      setError("Sign in failed. Check the email and password.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-wrap">
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
        {error && <p role="alert" style={{ marginTop: ".75rem" }}>{error}</p>}
        <button type="submit" disabled={busy} style={{ marginTop: "1rem", width: "100%" }}>
          {t("login")}
        </button>
      </form>
    </main>
  );
}
