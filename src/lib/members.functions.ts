import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const auth = z.object({ memberId: z.string().uuid(), token: z.string().min(10) });

async function admin() {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin;
}

async function verify(memberId: string, token: string) {
  const db = await admin();
  const { data } = await db.from("member_tokens").select("token").eq("member_id", memberId).maybeSingle();
  if (!data || data.token !== token) throw new Error("Sessão inválida");
  return db;
}

async function verifyOwner(memberId: string, token: string) {
  const db = await verify(memberId, token);
  const { data } = await db.from("app_owner").select("member_id").eq("id", true).maybeSingle();
  if (data?.member_id !== memberId) throw new Error("Só o dono pode fazer isso");
  return db;
}

async function hashPw(pw: string, salt?: string) {
  const sl = salt ?? crypto.randomUUID();
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pw), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: new TextEncoder().encode(sl), iterations: 100000, hash: "SHA-256" }, key, 256);
  return `${sl}$${[...new Uint8Array(bits)].map((x) => x.toString(16).padStart(2, "0")).join("")}`;
}

export const joinWithNickname = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ nickname: z.string().trim().min(1).max(24), password: z.string().min(4).max(100) }).parse(d))
  .handler(async ({ data }) => {
    const db = await admin();
    const token = crypto.randomUUID() + crypto.randomUUID();
    const fail = (error: string) => ({ error, member: null, token: null });
    const { data: existing } = await db.from("members").select("*").ilike("nickname", data.nickname.replace(/[%_\\]/g, "\\$&")).limit(1).maybeSingle();
    if (existing) {
      const { data: t } = await db.from("member_tokens").select("password_hash").eq("member_id", existing.id).maybeSingle();
      if (t?.password_hash) {
        const salt = t.password_hash.split("$")[0]!;
        if ((await hashPw(data.password, salt)) !== t.password_hash) return fail("Senha errada (ou esse nickname já é de outra pessoa).");
        await db.from("member_tokens").update({ token }).eq("member_id", existing.id);
        return { error: null, member: existing, token };
      }
      return fail("Esse nickname já está em uso. Escolha outro.");
    }
    const { data: def } = await db.from("roles").select("id").eq("name", "Membro").maybeSingle();
    const { data: m, error } = await db.from("members").insert({ nickname: data.nickname, role_id: def?.id ?? null }).select().single();
    if (error || !m) return fail("Não deu para entrar. Tente outro nickname.");
    await db.from("member_tokens").insert({ member_id: m.id, token, password_hash: await hashPw(data.password) });
    return { error: null, member: m, token };
  });

export const setAvatar = createServerFn({ method: "POST" })
  .inputValidator((d) => auth.extend({ url: z.string().url().max(2000) }).parse(d))
  .handler(async ({ data }) => {
    const db = await verify(data.memberId, data.token);
    await db.from("members").update({ avatar_url: data.url }).eq("id", data.memberId);
    return { ok: true };
  });

export const createAvatarUpload = createServerFn({ method: "POST" })
  .inputValidator((d) => auth.extend({ ext: z.string().regex(/^[a-zA-Z0-9]{1,5}$/) }).parse(d))
  .handler(async ({ data }) => {
    const db = await verify(data.memberId, data.token);
    const path = `${data.memberId}/${Date.now()}.${data.ext.toLowerCase()}`;
    const up = await db.storage.from("avatars").createSignedUploadUrl(path);
    if (up.error || !up.data) throw new Error("Falha no envio");
    const rd = await db.storage.from("avatars").createSignedUrl(path, 60 * 60 * 24 * 365 * 10);
    return { path, uploadToken: up.data.token, readUrl: rd.data?.signedUrl ?? null };
  });

export const setMemberRole = createServerFn({ method: "POST" })
  .inputValidator((d) => auth.extend({ targetId: z.string().uuid(), roleId: z.string().uuid().nullable() }).parse(d))
  .handler(async ({ data }) => {
    const db = await verifyOwner(data.memberId, data.token);
    await db.from("members").update({ role_id: data.roleId }).eq("id", data.targetId);
    return { ok: true };
  });

export const createRole = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    auth.extend({ name: z.string().trim().min(1).max(30), color: z.string().regex(/^#[0-9a-fA-F]{6}$/) }).parse(d),
  )
  .handler(async ({ data }) => {
    const db = await verifyOwner(data.memberId, data.token);
    await db.from("roles").insert({ name: data.name, color: data.color });
    return { ok: true };
  });

export const deleteRole = createServerFn({ method: "POST" })
  .inputValidator((d) => auth.extend({ roleId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const db = await verifyOwner(data.memberId, data.token);
    await db.from("members").update({ role_id: null }).eq("role_id", data.roleId);
    await db.from("roles").delete().eq("id", data.roleId);
    return { ok: true };
  });

export type Perm = "kick" | "delete_messages" | "view_history" | "rename" | "send_messages";
async function verifyStaff(memberId: string, token: string, perm: Perm) {
  const db = await verify(memberId, token);
  const { data: o } = await db.from("app_owner").select("member_id").eq("id", true).maybeSingle();
  if (o?.member_id === memberId) return db;
  const { data: m } = await db.from("members").select("role_id").eq("id", memberId).maybeSingle();
  const { data: r } = m?.role_id ? await db.from("roles").select("permissions").eq("id", m.role_id).maybeSingle() : { data: null };
  if (!r?.permissions?.includes(perm)) throw new Error("Sem permissão");
  return db;
}

export const deleteMessage = createServerFn({ method: "POST" })
  .inputValidator((d) => auth.extend({ messageId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const db = await verifyStaff(data.memberId, data.token, "delete_messages");
    await db.from("messages").delete().eq("id", data.messageId);
    return { ok: true };
  });

export const renameMember = createServerFn({ method: "POST" })
  .inputValidator((d) => auth.extend({ targetId: z.string().uuid(), nickname: z.string().trim().min(1).max(24) }).parse(d))
  .handler(async ({ data }) => {
    const db = data.targetId === data.memberId ? await verify(data.memberId, data.token) : await verifyStaff(data.memberId, data.token, "rename");
    const { data: taken } = await db.from("members").select("id").ilike("nickname", data.nickname).neq("id", data.targetId).limit(1).maybeSingle();
    if (taken) return { ok: false, error: "Esse apelido já está em uso." };
    const { error } = await db.from("members").update({ nickname: data.nickname }).eq("id", data.targetId);
    if (error) return { ok: false, error: "Esse apelido já está em uso." };
    return { ok: true, error: null as string | null };
  });

export const setRoleLevel = createServerFn({ method: "POST" })
  .inputValidator((d) => auth.extend({ roleId: z.string().uuid(), level: z.number().int().min(0).max(100) }).parse(d))
  .handler(async ({ data }) => {
    const db = await verifyOwner(data.memberId, data.token);
    await db.from("roles").update({ level: data.level }).eq("id", data.roleId);
    return { ok: true };
  });

export const setRolePermissions = createServerFn({ method: "POST" })
  .inputValidator((d) => auth.extend({ roleId: z.string().uuid(), permissions: z.array(z.enum(["kick", "delete_messages", "view_history", "rename", "send_messages"])) }).parse(d))
  .handler(async ({ data }) => {
    const db = await verifyOwner(data.memberId, data.token);
    await db.from("roles").update({ permissions: data.permissions }).eq("id", data.roleId);
    return { ok: true };
  });

export const sendMessage = createServerFn({ method: "POST" })
  .inputValidator((d) => auth.extend({ channelId: z.string().uuid(), content: z.string().trim().min(1).max(2000) }).parse(d))
  .handler(async ({ data }) => {
    const db = await verifyStaff(data.memberId, data.token, "send_messages");
    const { data: m } = await db.from("members").select("nickname").eq("id", data.memberId).single();
    await db.from("messages").insert({ channel_id: data.channelId, member_id: data.memberId, nickname: m!.nickname, content: data.content });
    return { ok: true };
  });

export const setRoleColor = createServerFn({ method: "POST" })
  .inputValidator((d) => auth.extend({ roleId: z.string().uuid(), color: z.string().regex(/^#[0-9a-fA-F]{6}$/) }).parse(d))
  .handler(async ({ data }) => {
    const db = await verifyOwner(data.memberId, data.token);
    await db.from("roles").update({ color: data.color }).eq("id", data.roleId);
    return { ok: true };
  });

export const createChannel = createServerFn({ method: "POST" })
  .inputValidator((d) => auth.extend({ name: z.string().trim().min(1).max(40), kind: z.enum(["text", "voice"]) }).parse(d))
  .handler(async ({ data }) => {
    const db = await verifyOwner(data.memberId, data.token);
    await db.from("channels").insert({ name: data.name, kind: data.kind });
    return { ok: true };
  });

export const loadAppData = createServerFn({ method: "POST" })
  .inputValidator((d) => auth.parse(d))
  .handler(async ({ data }) => {
    const db = await verify(data.memberId, data.token);
    const [roles, members, channels, owner] = await Promise.all([
      db.from("roles").select("*").order("created_at"),
      db.from("members").select("*").order("created_at"),
      db.from("channels").select("*").order("created_at"),
      db.from("app_owner").select("member_id").eq("id", true).maybeSingle(),
    ]);
    return {
      roles: roles.data ?? [],
      members: members.data ?? [],
      channels: channels.data ?? [],
      ownerId: owner.data?.member_id ?? null,
    };
  });

export const loadMessages = createServerFn({ method: "POST" })
  .inputValidator((d) => auth.extend({ channelId: z.string().uuid(), full: z.boolean() }).parse(d))
  .handler(async ({ data }) => {
    const db = data.full ? await verifyStaff(data.memberId, data.token, "view_history") : await verify(data.memberId, data.token);
    const { data: rows } = await db
      .from("messages")
      .select("*")
      .eq("channel_id", data.channelId)
      .order("created_at", { ascending: false })
      .limit(data.full ? 5000 : 100);
    return (rows ?? []).reverse();
  });
