import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { loadAppData, loadMessages } from "@/lib/members.functions";
import type { Tables } from "@/integrations/supabase/types";

export type Role = Tables<"roles">;
export type Member = Tables<"members">;
export type Channel = Tables<"channels">;
export type Message = Tables<"messages">;

export type Auth = { memberId: string; token: string } | null;

type AppData = { roles: Role[]; members: Member[]; channels: Channel[]; ownerId: string | null };
const empty: AppData = { roles: [], members: [], channels: [], ownerId: null };

/** Polls members/roles/channels/owner through an authenticated server function. */
export function useAppData(auth: Auth, onInvalid?: () => void) {
  const [d, setD] = useState<AppData>(empty);
  const id = auth?.memberId;
  const tk = auth?.token;
  useEffect(() => {
    if (!id || !tk) { setD(empty); return; }
    let alive = true;
    const load = async () => {
      try {
        const r = await loadAppData({ data: { memberId: id, token: tk } });
        if (alive) setD(r as AppData);
      } catch (e) { if (alive && e instanceof Error && e.message.includes("Sessão inválida")) onInvalid?.(); }
    };
    load();
    const iv = setInterval(load, 3000);
    return () => { alive = false; clearInterval(iv); };
  }, [id, tk]);
  return d;
}

export function useMessages(channelId: string, auth: Auth, full = false) {
  const [messages, setMessages] = useState<Message[]>([]);
  const id = auth?.memberId;
  const tk = auth?.token;
  useEffect(() => {
    if (!id || !tk) return;
    let alive = true;
    setMessages([]);
    const load = async () => {
      try {
        const r = await loadMessages({ data: { memberId: id, token: tk, channelId, full } });
        if (!alive) return;
        setMessages((prev) => (prev.length === r.length && prev[prev.length - 1]?.id === r[r.length - 1]?.id && prev[0]?.id === r[0]?.id ? prev : (r as Message[])));
      } catch { /* ignore */ }
    };
    load();
    const iv = setInterval(load, 2000);
    return () => { alive = false; clearInterval(iv); };
  }, [channelId, full, id, tk]);
  return messages;
}

export type VoicePresence = { memberId: string; channelId: string | null; tab: string; speaking?: boolean };

/** Global presence: who is in which voice call. */
export function useVoicePresence(memberId: string | null, channelId: string | null, speaking = false) {
  const [list, setList] = useState<VoicePresence[]>([]);
  const [tab] = useState(() => crypto.randomUUID());
  const [held, setHeld] = useState(false);
  const [ch, setCh] = useState<ReturnType<typeof supabase.channel> | null>(null);
  useEffect(() => {
    if (!memberId) return;
    const c = supabase.channel("voice-presence", { config: { presence: { key: tab } } });
    c.on("presence", { event: "sync" }, () => {
      setList(Object.values(c.presenceState<VoicePresence>()).map((v) => v[0]).filter((x): x is VoicePresence & { presence_ref: string } => !!x));
    });
    c.subscribe((s) => { if (s === "SUBSCRIBED") setCh(c); });
    return () => { setCh(null); supabase.removeChannel(c); };
  }, [memberId, tab]);
  useEffect(() => {
    if (!ch || !memberId) return;
    const want = !!channelId && speaking;
    if (want) { setHeld(true); return; }
    const t = setTimeout(() => setHeld(false), 700);
    return () => clearTimeout(t);
  }, [ch, memberId, channelId, speaking]);
  useEffect(() => {
    if (ch && memberId) ch.track({ memberId, channelId, tab, speaking: !!channelId && held });
  }, [ch, memberId, channelId, tab, held]);
  return { list, tab };
}
