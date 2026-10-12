import { useEffect, useState } from "react";
import { Crown, Hash, LogOut, Mic, Plus, Shield, Users, Volume2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAppData, useVoicePresence, type Member } from "@/lib/chat-data";
import { createAvatarUpload, createChannel, renameMember, setAvatar } from "@/lib/members.functions";
import { NicknameGate } from "./NicknameGate";
import { ChatPanel } from "./ChatPanel";
import { VoiceRoom } from "./VoiceRoom";
import { RolesDialog } from "./RolesDialog";
import { Avatar } from "./Avatar";
import { toast } from "sonner";
import logo from "@/assets/tokyo-manji-logo.png";

const KEY = "tokyo-manji-member-id";
const TKEY = "tokyo-manji-token";

export function ChatApp() {
  const [myId, setMyId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [view, setView] = useState<string | null>(null);
  const [callId, setCallId] = useState<string | null>(null);
  const [rolesOpen, setRolesOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const [speaking, setSpeaking] = useState(false);

  const [token, setToken] = useState<string | null>(null);
  const { roles, members, channels, ownerId } = useAppData(myId && token ? { memberId: myId, token } : null, () => {
    localStorage.removeItem(KEY);
    localStorage.removeItem(TKEY);
    setCallId(null);
    setToken(null);
    setMyId(null);
  });
  const { list: presence, tab } = useVoicePresence(myId && token ? myId : null, callId, speaking);

  useEffect(() => {
    const t = localStorage.getItem(TKEY);
    setToken(t);
    setMyId(t ? localStorage.getItem(KEY) : null);
    setLoaded(true);
  }, []);

  const me = members.find((m) => m.id === myId) ?? null;
  const text = channels.filter((c) => c.kind === "text");
  const voice = channels.filter((c) => c.kind === "voice");
  const current = channels.find((c) => c.id === view) ?? text[0];
  const call = channels.find((c) => c.id === callId);

  if (!loaded) return null;
  if (!myId || (members.length > 0 && !me)) {
    return (
      <NicknameGate
        roles={roles}
        onReady={(m: Member, t: string) => {
          localStorage.setItem(KEY, m.id);
          localStorage.setItem(TKEY, t);
          setToken(t);
          setMyId(m.id);
        }}
      />
    );
  }
  if (!me) return <div className="min-h-screen bg-background" />;

  const myRole = roles.find((r) => r.id === me.role_id);
  const isOwner = ownerId === me.id;
  const auth = { memberId: me.id, token: token ?? "" };
  const can = (p: string) => isOwner || !!myRole?.permissions?.includes(p);
  const isStaff = can("rename");
  const speakingIds = new Set(presence.filter((p) => p.speaking).map((p) => p.memberId));
  const rename = async (targetId: string, current: string) => {
    const nick = prompt("Novo apelido", current)?.trim();
    if (!nick || nick === current) return;
    try {
      const r = await renameMember({ data: { ...auth, targetId, nickname: nick.slice(0, 24) } });
      if (r.ok) toast.success("Apelido alterado!"); else toast.error(r.error ?? "Erro");
    } catch { toast.error("Sem permissão."); }
  };

  const joinCall = (id: string) => {
    if (presence.some((p) => p.memberId === me.id && p.channelId && p.tab !== tab)) {
      toast.error("Você já está em uma call em outra aba ou aparelho.");
      return;
    }
    setCallId(id);
  };

  const addChannel = async (kind: "text" | "voice") => {
    const name = prompt(kind === "text" ? "Nome do canal de texto" : "Nome do canal de voz");
    if (name?.trim()) { try { await createChannel({ data: { ...auth, name: name.trim().slice(0, 40), kind } }); } catch { toast.error("Só o dono pode criar canais."); } }
  };

  const uploadAvatar = async (file?: File) => {
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) { toast.error("Arquivo muito grande (máx. 8MB)"); return; }
    const ext = file.name.split(".").pop() ?? "png";
    const t = toast.loading("Enviando foto...");
    let up;
    try { up = await createAvatarUpload({ data: { ...auth, ext: ext.replace(/[^a-zA-Z0-9]/g, "").slice(0, 5) || "png" } }); } catch { toast.error("Falha no envio", { id: t }); return; }
    const { error } = await supabase.storage.from("avatars").uploadToSignedUrl(up.path, up.uploadToken, file, { contentType: file.type });
    if (error || !up.readUrl) { toast.error("Falha no envio", { id: t }); return; }
    const data = { signedUrl: up.readUrl };
    if (data?.signedUrl) await setAvatar({ data: { ...auth, url: data.signedUrl } });
    toast.success("Foto atualizada!", { id: t });
  };

  const openChannel = (id: string, kind: string) => {
    setView(id);
    if (kind === "voice" && callId !== id) joinCall(id);
  };

  const showingCall = !!call && current?.id === call.id;

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <nav className="flex w-[72px] shrink-0 flex-col items-center gap-3 bg-rail py-3">
        <img src={logo} alt="Tokyo Manji" className="h-12 w-12 rounded-xl shadow-glow" />
      </nav>

      <aside className="flex w-60 shrink-0 flex-col bg-panel">
        <div className="border-b border-border px-4 py-4">
          <h1 className="text-lg font-bold uppercase tracking-widest">Tokyo Manji</h1>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          <Section title="Canais de texto" onAdd={() => addChannel("text")} />
          {text.map((c) => (
            <ChanBtn key={c.id} active={current?.id === c.id} onClick={() => openChannel(c.id, c.kind)}>
              <Hash className="h-4 w-4" /> {c.name}
            </ChanBtn>
          ))}
          <Section title="Canais de voz" onAdd={() => addChannel("voice")} />
          {voice.map((c) => (
            <div key={c.id}>
            <ChanBtn active={current?.id === c.id} onClick={() => openChannel(c.id, c.kind)}>
              <Volume2 className="h-4 w-4" /> {c.name}
              {callId === c.id && <span className="ml-auto h-2 w-2 rounded-full bg-live" />}
            </ChanBtn>
            {[...new Set(presence.filter((p) => p.channelId === c.id).map((p) => p.memberId))].map((id) => {
              const m = members.find((x) => x.id === id);
              if (!m) return null;
              const rc = roles.find((r) => r.id === m.role_id)?.color;
              return (
                <div key={id} className="ml-6 mr-1 flex min-w-0 items-center gap-2 overflow-hidden px-2 py-1 text-xs text-muted-foreground">
                  <Avatar url={m.avatar_url} name={m.nickname} color={rc} size={20} speaking={speakingIds.has(id)} />
                  <span className="min-w-0 flex-1 truncate" style={{ color: rc }}>{m.nickname}</span>
                  {id === ownerId && <Crown className="h-3 w-3 shrink-0" />}
                  {speakingIds.has(id) && <Mic className="h-3 w-3 shrink-0 text-speaking" />}
                </div>
              );
            })}
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2 border-t border-border bg-rail p-3">
          <label className="group relative cursor-pointer" title="Trocar foto de perfil">
            <Avatar url={me.avatar_url} name={me.nickname} color={myRole?.color} />
            <span className="absolute inset-0 flex items-center justify-center rounded-full bg-rail/70 text-[9px] font-bold opacity-0 group-hover:opacity-100">
              FOTO
            </span>
            <input type="file" accept="image/*" className="hidden" onChange={(e) => uploadAvatar(e.target.files?.[0])} />
          </label>
          <div className="min-w-0 flex-1">
            <button onClick={() => rename(me.id, me.nickname)} title="Trocar apelido" className="block max-w-full truncate text-sm font-semibold hover:underline">{me.nickname}</button>
            <p className="truncate text-xs" style={{ color: myRole?.color }}>
              {myRole?.name ?? "Sem cargo"}
            </p>
          </div>
          {isStaff && (
            <button onClick={() => setMembersOpen(true)} aria-label="Membros" title="Membros" className="rounded p-1.5 hover:bg-accent">
              <Users className="h-4 w-4" />
            </button>
          )}
          {isOwner && (
            <button onClick={() => setRolesOpen(true)} aria-label="Gerenciar cargos" className="rounded p-1.5 hover:bg-accent">
              <Shield className="h-4 w-4" />
            </button>
          )}
          <button
            onClick={() => {
              localStorage.removeItem(KEY);
              localStorage.removeItem(TKEY);
              setCallId(null);
              setMyId(null);
            }}
            aria-label="Sair"
            className="rounded p-1.5 hover:bg-accent"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        {call && (
          <VoiceRoom
            key={call.id}
            channel={call}
            me={me}
            members={members}
            roles={roles}
            canKick={can("kick")}
            canDelete={can("delete_messages")}
            canHistory={can("view_history")}
            canSend={can("send_messages")}
            auth={auth}
            speakingIds={speakingIds}
            onSpeaking={setSpeaking}
            hidden={!showingCall}
            onLeave={() => {
              setCallId(null);
              setSpeaking(false);
              if (current?.id === call.id) setView(text[0]?.id ?? null);
            }}
          />
        )}
        {!showingCall && current && current.kind === "voice" && (
          <div className="flex flex-1 flex-col items-center justify-center gap-4">
            <Volume2 className="h-12 w-12 text-muted-foreground" />
            <h2 className="text-2xl font-bold">{current.name}</h2>
            <button onClick={() => joinCall(current.id)} className="rounded-lg bg-primary px-6 py-3 font-semibold text-primary-foreground">
              Entrar na call
            </button>
          </div>
        )}
        {!showingCall && current && current.kind === "text" && (
          <>
            <header className="flex items-center gap-2 border-b border-border px-5 py-3">
              <Hash className="h-5 w-5 text-muted-foreground" />
              <h2 className="font-semibold">{current.name}</h2>
              {call && (
                <button onClick={() => setView(call.id)} className="ml-auto flex items-center gap-2 rounded-full bg-secondary px-3 py-1 text-xs">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-live" /> Em call: {call.name}
                </button>
              )}
            </header>
            <div className="min-h-0 flex-1">
              <ChatPanel channelId={current.id} me={me} members={members} roles={roles} auth={auth} canModerate={can("delete_messages")} canHistory={can("view_history")} canSend={can("send_messages")} />
            </div>
          </>
        )}
      </main>

      {membersOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-rail/80 p-4" onClick={() => setMembersOpen(false)}>
          <div className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl border border-border bg-card p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-4 text-2xl font-bold">Membros</h2>
            <div className="divide-y divide-border">
              {members.map((m) => {
                const r = roles.find((x) => x.id === m.role_id);
                return (
                  <div key={m.id} className="flex items-center gap-3 py-2">
                    <Avatar url={m.avatar_url} name={m.nickname} color={r?.color} size={28} />
                    <span className="truncate font-medium" style={{ color: r?.color }}>{m.nickname}</span>
                    {m.id === ownerId && <Crown className="h-3.5 w-3.5" />}
                    <span className="ml-auto text-xs text-muted-foreground">{r?.name ?? "Sem cargo"}</span>
                    {(isOwner || m.id !== ownerId) && (
                      <button onClick={() => rename(m.id, m.nickname)} className="rounded-md bg-secondary px-2 py-1 text-xs hover:bg-accent">Apelido</button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
      {rolesOpen && <RolesDialog auth={auth} roles={roles} members={members} onClose={() => setRolesOpen(false)} />}
    </div>
  );
}

function Section({ title, onAdd }: { title: string; onAdd: () => void }) {
  return (
    <div className="mt-4 mb-1 flex items-center justify-between px-2 first:mt-1">
      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</span>
      <button onClick={onAdd} aria-label={`Adicionar ${title}`} className="text-muted-foreground hover:text-foreground">
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );
}

function ChanBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition ${active ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-secondary hover:text-foreground"}`}
    >
      {children}
    </button>
  );
}
