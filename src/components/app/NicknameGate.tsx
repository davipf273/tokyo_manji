import { useState } from "react";
import logo from "@/assets/tokyo-manji-logo.png";
import type { Member, Role } from "@/lib/chat-data";
import { joinWithNickname } from "@/lib/members.functions";

export function NicknameGate({ onReady }: { roles?: Role[]; onReady: (m: Member, token: string) => void }) {
  const [nick, setNick] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const enter = async (e: React.FormEvent) => {
    e.preventDefault();
    const nickname = nick.trim().slice(0, 24);
    if (!nickname) return;
    if (pw.length < 4) { setErr("A senha precisa ter pelo menos 4 caracteres."); return; }
    setBusy(true);
    setErr("");
    try {
      const r = await joinWithNickname({ data: { nickname, password: pw } });
      if (r.error || !r.member || !r.token) setErr(r.error ?? "Não deu para entrar.");
      else onReady(r.member, r.token);
    } catch {
      setErr("Não deu para entrar. Tente de novo.");
    }
    setBusy(false);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-rail px-4">
      <form onSubmit={enter} className="w-full max-w-sm rounded-2xl border border-border bg-card p-8 shadow-glow">
        <img src={logo} alt="Tokyo Manji" className="mb-6 h-16 w-16 rounded-lg" />
        <h1 className="text-3xl font-bold">Tokyo Manji</h1>
        <p className="mt-2 text-sm text-muted-foreground">Primeira vez? Escolha nickname e senha para criar sua conta. Já tem? Entre com eles.</p>
        <input
          autoFocus
          value={nick}
          onChange={(e) => setNick(e.target.value)}
          placeholder="Seu nickname"
          maxLength={24}
          className="mt-6 w-full rounded-lg border border-input bg-background px-4 py-3 outline-none focus:border-ring"
        />
        <input
          type="password"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          placeholder="Senha"
          maxLength={100}
          autoComplete="current-password"
          className="mt-3 w-full rounded-lg border border-input bg-background px-4 py-3 outline-none focus:border-ring"
        />
        {err && <p className="mt-2 text-sm text-destructive">{err}</p>}
        <button
          disabled={busy || !nick.trim() || !pw}
          className="mt-4 w-full rounded-lg bg-primary py-3 font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "Entrando..." : "Entrar"}
        </button>
      </form>
    </div>
  );
}
