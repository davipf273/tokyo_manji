import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, MonitorUp, MonitorX, PhoneOff, UserX, Video, VideoOff } from "lucide-react";
import { toast } from "sonner";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Channel, Member, Role } from "@/lib/chat-data";
import { ChatPanel } from "./ChatPanel";
import { Avatar, useSpeaking } from "./Avatar";

const ICE = { iceServers: [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }] };

type Peer = { pc: RTCPeerConnection; makingOffer: boolean; ignoreOffer: boolean; polite: boolean };
type PresenceInfo = { memberId: string; nickname: string };

export function VoiceRoom({
  channel,
  me,
  members,
  roles,
  hidden,
  canKick,
  canDelete,
  canHistory,
  canSend,
  onLeave,
  auth,
  speakingIds,
  onSpeaking,
}: {
  auth: { memberId: string; token: string };
  speakingIds: Set<string>;
  onSpeaking: (s: boolean) => void;
  canKick: boolean;
  canDelete: boolean;
  canHistory: boolean;
  canSend: boolean;
  channel: Channel;
  me: Member;
  members: Member[];
  roles: Role[];
  hidden: boolean;
  onLeave: () => void;
}) {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remote, setRemote] = useState<Record<string, MediaStream>>({});
  const [people, setPeople] = useState<PresenceInfo[]>([]);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [sharing, setSharing] = useState(false);

  const peers = useRef(new Map<string, Peer>());
  const rt = useRef<RealtimeChannel | null>(null);
  const local = useRef<MediaStream | null>(null);
  const camTrack = useRef<MediaStreamTrack | null>(null);
  const screenTrack = useRef<MediaStreamTrack | null>(null);
  const meRef = useRef(me);
  meRef.current = me;
  const localSpeaking = useSpeaking(micOn ? localStream : null);
  useEffect(() => { onSpeaking(localSpeaking); }, [localSpeaking, onSpeaking]);
  const leaveRef = useRef(onLeave);
  leaveRef.current = onLeave;

  useEffect(() => {
    let cancelled = false;
    const myId = me.id;

    const send = (to: string, data: Record<string, unknown>) =>
      rt.current?.send({ type: "broadcast", event: "signal", payload: { from: myId, to, ...data } });

    const createPeer = (id: string): Peer => {
      const pc = new RTCPeerConnection(ICE);
      const peer: Peer = { pc, makingOffer: false, ignoreOffer: false, polite: myId > id };
      peers.current.set(id, peer);
      local.current?.getTracks().forEach((t) => pc.addTrack(t, local.current!));
      pc.onnegotiationneeded = async () => {
        try {
          peer.makingOffer = true;
          await pc.setLocalDescription();
          send(id, { description: pc.localDescription?.toJSON() });
        } catch (e) {
          console.error(e);
        } finally {
          peer.makingOffer = false;
        }
      };
      pc.onicecandidate = ({ candidate }) => candidate && send(id, { candidate: candidate.toJSON() });
      pc.ontrack = ({ track, streams }) => {
        const stream = streams[0] ?? new MediaStream([track]);
        setRemote((r) => ({ ...r, [id]: stream }));
        track.onunmute = () => setRemote((r) => ({ ...r, [id]: stream }));
      };
      return peer;
    };

    const dropPeer = (id: string) => {
      peers.current.get(id)?.pc.close();
      peers.current.delete(id);
      setRemote((r) => {
        const n = { ...r };
        delete n[id];
        return n;
      });
    };

    const start = async () => {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      } catch {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          setCamOn(false);
        } catch {
          stream = new MediaStream();
          setMicOn(false);
          setCamOn(false);
          toast("Sem acesso ao microfone/câmera — você entrou só para ver e ouvir.");
        }
      }
      if (cancelled) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      local.current = stream;
      camTrack.current = stream.getVideoTracks()[0] ?? null;
      setLocalStream(stream);

      const ch = supabase.channel(`call-${channel.id}`, { config: { presence: { key: myId }, broadcast: { self: false } } });
      rt.current = ch;

      ch.on("broadcast", { event: "signal" }, async ({ payload }) => {
        if (payload.to !== myId) return;
        const from = payload.from as string;
        const peer = peers.current.get(from) ?? createPeer(from);
        const { pc } = peer;
        try {
          if (payload.description) {
            const desc = payload.description as RTCSessionDescriptionInit;
            const collision = desc.type === "offer" && (peer.makingOffer || pc.signalingState !== "stable");
            peer.ignoreOffer = !peer.polite && collision;
            if (peer.ignoreOffer) return;
            await pc.setRemoteDescription(desc);
            if (desc.type === "offer") {
              await pc.setLocalDescription();
              send(from, { description: pc.localDescription?.toJSON() });
            }
          } else if (payload.candidate) {
            try {
              await pc.addIceCandidate(payload.candidate);
            } catch (e) {
              if (!peer.ignoreOffer) throw e;
            }
          }
        } catch (e) {
          console.error(e);
        }
      });

      ch.on("broadcast", { event: "kick" }, ({ payload }) => {
        if (payload.memberId && payload.memberId === meRef.current.id) {
          toast.error(`Você foi tirado da call por ${payload.by}.`);
          leaveRef.current();
          return;
        }
        if (payload.roleId && payload.roleId === meRef.current.role_id) {
          toast.error(`Você foi expulso da call por ${payload.by} (cargo ${payload.roleName}).`);
          leaveRef.current();
        }
      });

      ch.on("presence", { event: "sync" }, () => {
        const state = ch.presenceState<PresenceInfo>();
        const list = Object.values(state).map((v) => v[0]).filter((x): x is NonNullable<typeof x> => !!x);
        setPeople(list);
        const ids = new Set(Object.keys(state));
        ids.forEach((id) => {
          if (id !== myId && !peers.current.has(id)) createPeer(id);
        });
        [...peers.current.keys()].forEach((id) => !ids.has(id) && dropPeer(id));
      });

      ch.subscribe(async (status) => {
        if (status === "SUBSCRIBED") await ch.track({ memberId: myId, nickname: me.nickname });
      });
    };

    start();

    return () => {
      cancelled = true;
      peers.current.forEach((p) => p.pc.close());
      peers.current.clear();
      local.current?.getTracks().forEach((t) => t.stop());
      screenTrack.current?.stop();
      if (rt.current) supabase.removeChannel(rt.current);
      rt.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel.id, me.id]);

  const toggleMic = () => {
    const t = local.current?.getAudioTracks()[0];
    if (!t) {
      toast("Microfone indisponível");
      return;
    }
    t.enabled = !t.enabled;
    setMicOn(t.enabled);
  };

  const toggleCam = () => {
    const t = camTrack.current;
    if (!t) {
      toast("Câmera indisponível");
      return;
    }
    t.enabled = !t.enabled;
    setCamOn(t.enabled);
  };

  const setOutgoingVideo = (track: MediaStreamTrack | null) => {
    peers.current.forEach(({ pc }) => {
      const sender = pc.getSenders().find((s) => s.track?.kind === "video" || (s.track === null && track));
      if (sender) sender.replaceTrack(track);
      else if (track && local.current) pc.addTrack(track, local.current);
    });
  };

  const stopShare = () => {
    const st = screenTrack.current;
    if (!st || !local.current) return;
    st.stop();
    local.current.removeTrack(st);
    screenTrack.current = null;
    if (camTrack.current) local.current.addTrack(camTrack.current);
    setOutgoingVideo(camTrack.current);
    setLocalStream(new MediaStream(local.current.getTracks()));
    setSharing(false);
  };

  const startShare = async () => {
    try {
      const display = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      const st = display.getVideoTracks()[0];
      if (!st || !local.current) return;
      screenTrack.current = st;
      if (camTrack.current) local.current.removeTrack(camTrack.current);
      local.current.addTrack(st);
      setOutgoingVideo(st);
      st.onended = stopShare;
      setLocalStream(new MediaStream(local.current.getTracks()));
      setSharing(true);
    } catch {
      toast("Transmissão de tela cancelada");
    }
  };

  const kickRole = (role: Role) => {
    rt.current?.send({
      type: "broadcast",
      event: "kick",
      payload: { roleId: role.id, roleName: role.name, by: me.nickname },
    });
    toast.success(`Todos com o cargo ${role.name} foram expulsos da call.`);
  };

  const kickMember = (id: string) => {
    rt.current?.send({ type: "broadcast", event: "kick", payload: { memberId: id, by: me.nickname } });
    toast.success(`${nameOf(id)} foi tirado da call.`);
  };

  const nameOf = (id: string) => people.find((p) => p.memberId === id)?.nickname ?? members.find((m) => m.id === id)?.nickname ?? "...";
  const roleOf = (id: string) => roles.find((r) => r.id === members.find((m) => m.id === id)?.role_id);
  const others = people.filter((p) => p.memberId !== me.id);

  return (
    <div className={hidden ? "hidden" : "flex h-full min-h-0 flex-1"}>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-border px-5 py-3">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 animate-pulse rounded-full bg-live" />
            <h2 className="font-semibold">{channel.name}</h2>
            <span className="text-sm text-muted-foreground">· {people.length} na call</span>
          </div>
        </header>

        <div className="grid flex-1 content-start gap-3 overflow-y-auto p-4 md:grid-cols-2">
          <Tile stream={localStream} avatarUrl={me.avatar_url} name={`${me.nickname} (você)`} muted mirror={!sharing} color={roleOf(me.id)?.color} sharing={sharing} />
          {others.map((p) => (
            <Tile key={p.memberId} avatarUrl={members.find((m) => m.id === p.memberId)?.avatar_url} stream={remote[p.memberId] ?? null} name={nameOf(p.memberId)} color={roleOf(p.memberId)?.color} />
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2 border-t border-border bg-panel p-3">
          <CtrlBtn on={micOn} onClick={toggleMic} label={micOn ? "Mutar" : "Desmutar"}>
            {micOn ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
          </CtrlBtn>
          <CtrlBtn on={camOn} onClick={toggleCam} label={camOn ? "Desligar câmera" : "Ligar câmera"}>
            {camOn ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
          </CtrlBtn>
          <button
            onClick={sharing ? stopShare : startShare}
            className={`flex items-center gap-2 rounded-full px-4 py-3 text-sm font-semibold transition ${sharing ? "bg-primary text-primary-foreground" : "bg-secondary hover:bg-accent"}`}
          >
            {sharing ? <MonitorX className="h-5 w-5" /> : <MonitorUp className="h-5 w-5" />}
            {sharing ? "Parar transmissão" : "Transmitir tela"}
          </button>
          <button
            onClick={onLeave}
            aria-label="Sair da call"
            className="rounded-full bg-destructive px-4 py-3 text-destructive-foreground hover:opacity-90"
          >
            <PhoneOff className="h-5 w-5" />
          </button>
        </div>
      </div>

      <aside className="hidden w-80 shrink-0 flex-col border-l border-border bg-panel lg:flex">
        <div className="border-b border-border p-4">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Na call ({people.length})</h3>
          <div className="space-y-1.5">
            {people.map((p) => (
              <div key={p.memberId} className="flex items-center gap-2 text-sm">
                <Avatar url={members.find((m) => m.id === p.memberId)?.avatar_url} name={nameOf(p.memberId)} color={roleOf(p.memberId)?.color} size={24} speaking={speakingIds.has(p.memberId)} />
                <span className="truncate" style={{ color: roleOf(p.memberId)?.color }}>{nameOf(p.memberId)}</span>
                {speakingIds.has(p.memberId) && <Mic className="h-3.5 w-3.5 shrink-0 text-speaking" />}
                <span className="ml-auto text-xs text-muted-foreground">{roleOf(p.memberId)?.name}</span>
                {canKick && p.memberId !== me.id && (
                  <button onClick={() => kickMember(p.memberId)} aria-label="Tirar da call" title="Tirar da call" className="text-muted-foreground hover:text-destructive">
                    <UserX className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
        {canKick && <div className="border-b border-border p-4">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Expulsar cargo da call</h3>
          {roles.find((r) => r.name.toLowerCase() === "gordo") && (
            <button onClick={() => kickRole(roles.find((r) => r.name.toLowerCase() === "gordo")!)} className="mb-2 flex w-full items-center justify-center gap-2 rounded-md bg-destructive px-3 py-2 text-sm font-bold text-destructive-foreground">
              <UserX className="h-4 w-4" /> Expulsar Gordo
            </button>
          )}
          <div className="flex flex-wrap gap-2">
            {roles.map((r) => (
              <button
                key={r.id}
                onClick={() => kickRole(r)}
                className="flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs hover:border-destructive hover:text-destructive"
              >
                <UserX className="h-3.5 w-3.5" />
                <span className="h-2 w-2 rounded-full" style={{ background: r.color }} />
                {r.name}
              </button>
            ))}
          </div>
        </div>}
        <h3 className="px-4 pt-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Chat da call</h3>
        <div className="min-h-0 flex-1">
          <ChatPanel channelId={channel.id} me={me} members={members} roles={roles} compact auth={auth} canModerate={canDelete} canHistory={canHistory} canSend={canSend} />
        </div>
      </aside>
    </div>
  );
}

function CtrlBtn({ on, onClick, label, children }: { on: boolean; onClick: () => void; label: string; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className={`rounded-full p-3 transition ${on ? "bg-secondary hover:bg-accent" : "bg-destructive text-destructive-foreground"}`}
    >
      {children}
    </button>
  );
}

function Tile({
  stream,
  name,
  muted,
  mirror,
  color,
  sharing,
  avatarUrl,
}: {
  avatarUrl?: string | null | undefined;
  stream: MediaStream | null;
  name: string;
  muted?: boolean | undefined;
  mirror?: boolean | undefined;
  color?: string | undefined;
  sharing?: boolean | undefined;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const [hasVideo, setHasVideo] = useState(false);
  const speaking = useSpeaking(stream);
  useEffect(() => {
    if (ref.current && ref.current.srcObject !== stream) ref.current.srcObject = stream;
    const check = () => setHasVideo(!!stream?.getVideoTracks().some((t) => t.readyState === "live" && t.enabled && !t.muted));
    check();
    const iv = setInterval(check, 1000);
    return () => clearInterval(iv);
  }, [stream]);

  return (
    <div className={`relative aspect-video overflow-hidden rounded-xl border bg-card transition-shadow ${speaking ? "speaking-border" : "border-border"}`}>
      <video ref={ref} autoPlay playsInline muted={muted} className={`h-full w-full object-contain ${mirror ? "-scale-x-100" : ""} ${hasVideo ? "" : "invisible"}`} />
      {!hasVideo && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Avatar url={avatarUrl} name={name} speaking={speaking} size={88} color={color} />
        </div>
      )}
      <div className="absolute bottom-2 left-2 flex items-center gap-2 rounded-md bg-rail/80 px-2 py-1 text-xs font-medium">
        {speaking && <Mic className="h-3.5 w-3.5 text-speaking" />}
        {sharing && <MonitorUp className="h-3.5 w-3.5 text-primary" />}
        <span style={{ color }}>{name}</span>
      </div>
    </div>
  );
}
