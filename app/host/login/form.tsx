"use client";

import { useState, type FormEvent } from "react";

export default function HostLoginForm() {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/host/session", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }), signal: AbortSignal.timeout(15000),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "登录未完成，请重试。");
      window.location.assign("/");
    } catch (error) {
      setError(error instanceof Error ? error.message : "登录未完成，请重试。");
      setBusy(false);
    }
  }
  return <form onSubmit={submit} className="host-login-form">
    <label htmlFor="host-password">主持人密码</label>
    <input id="host-password" type="password" autoComplete="current-password" required maxLength={256}
      value={password} onChange={event => setPassword(event.target.value)} disabled={busy} />
    {error && <p className="error" role="alert">{error}</p>}
    <button className="button ink" disabled={busy}>{busy ? "正在登录…" : "登录并创建房间"}</button>
  </form>;
}
