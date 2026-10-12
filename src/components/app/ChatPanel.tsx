import { useEffect, useRef, useState } from "react";
import { History, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { sendMessage, deleteMessage } from "@/lib/members.functions";
import { supabase } from "@/integrations/supabase/client";
import { Avatar } from "./Avatar";
import { useMessages, type Member, type Role } from "@/lib/chat-data";

export function ChatPanel({
  channelId,
  me,
  members,
  roles,
  compact,
  auth,
  canModerate,
  canHistory,
  canSend,
}: {
  auth?: { memberId: string; token: string } | undefined;
  canModerate?: boolean | undefined;
  canHistory?: boolean | undefined;
  canSend?: boolean | undefined;
  channelId: string;
  me: Member;
  members: Member[];
  roles: Role[];
  compact?: boolean | undefined;
}) {
  const [full, setFull] = useState(false);
  const messages = useMessages(channelId, auth ?? null, full && !!canHistory);
  const del = async (id: string) => {
    if (!auth) return;
    try { await deleteMessage({ data: { ...auth, messageId: id } }); } catch { toast.error("Sem permissão para apagar."); }
  };
  const [text, setText] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  const colorFor = (memberId: string | null) => {
    const m = members.find((x) => x.id === memberId);
    return roles.find((r) => r.id === m?.role_id)?.color;
  };

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const content = text.trim();
    if (!content) return;
    setText("");
    if (!auth) return;
    try { await sendMessage({ data: { ...auth, channelId, content } }); } catch { toast.error("Seu cargo não pode mandar mensagens."); }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {canHistory && (
          <button onClick={() => setFull((f) => !f)} className="mx-auto flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1 text-xs text-muted-foreground hover:text-foreground">
            <History className="h-3.5 w-3.5" /> {full ? "Mostrar só recentes" : "Ver histórico completo"}
          </button>
        )}
        {messages.length === 0 && (
          <p className="pt-8 text-center text-sm text-muted-foreground">Nenhuma mensagem ainda. Diga oi!</p>
        )}
        {messages.map((m) => (
          <div key={m.id} className="group relative flex gap-3 rounded-md px-1 hover:bg-secondary/40">
            {canModerate && (
              <button onClick={() => del(m.id)} aria-label="Apagar mensagem" title="Apagar mensagem" className="absolute right-1 top-0 hidden rounded p-1 text-muted-foreground hover:text-destructive group-hover:block">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
            {!compact && (
              <Avatar url={members.find((x) => x.id === m.member_id)?.avatar_url} name={m.nickname} color={colorFor(m.member_id)} />
            )}
            <div className="min-w-0">
              <div className="flex items-baseline gap-2">
                <span className="font-semibold" style={{ color: colorFor(m.member_id) }}>
                  {m.nickname}
                </span>
                <span className="text-xs text-muted-foreground">
                  {new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
              <p className="whitespace-pre-wrap break-words text-sm">{m.content}</p>
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>
      {canSend === false ? <p className="border-t border-border p-3 text-center text-sm text-muted-foreground">Seu cargo não pode mandar mensagens.</p> :
      <form onSubmit={send} className="flex gap-2 border-t border-border p-3">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={2000}
          placeholder="Escreva uma mensagem..."
          className="min-w-0 flex-1 rounded-lg bg-secondary px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
        <button aria-label="Enviar" className="rounded-lg bg-primary px-3 text-primary-foreground hover:opacity-90">
          <Send className="h-4 w-4" />
        </button>
      </form>}
    </div>
  );
}
