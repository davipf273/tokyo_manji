import { useState } from "react";
import { Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { createRole, deleteRole, setMemberRole, setRoleColor, setRolePermissions } from "@/lib/members.functions";
import type { Member, Role } from "@/lib/chat-data";

type Auth = { memberId: string; token: string };
type Perm = "kick" | "delete_messages" | "view_history" | "rename" | "send_messages";
const run = async (p: Promise<unknown>) => { try { await p; } catch { toast.error("Sem permissão. Saia e entre de novo."); } };

const PERMS: { key: Perm; label: string }[] = [
  { key: "send_messages", label: "Mandar mensagens" },
  { key: "kick", label: "Tirar da call / expulsar cargo" },
  { key: "delete_messages", label: "Apagar mensagens" },
  { key: "view_history", label: "Ver histórico de mensagens" },
  { key: "rename", label: "Trocar apelido dos outros" },
];

export function RolesDialog({ auth, roles, members, onClose }: { auth: Auth; roles: Role[]; members: Member[]; onClose: () => void }) {
  const [name, setName] = useState("");
  const [color, setColor] = useState("#7dcfff");

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    await run(createRole({ data: { ...auth, name: name.trim().slice(0, 30), color } }));
    setName("");
  };

  const toggle = (r: Role, p: Perm, on: boolean) => {
    const cur = (r.permissions ?? []) as Perm[];
    const next = on ? [...new Set([...cur, p])] : cur.filter((x) => x !== p);
    run(setRolePermissions({ data: { ...auth, roleId: r.id, permissions: next } }));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-rail/80 p-4" onClick={onClose}>
      <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-border bg-card p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-2xl font-bold">Cargos</h2>
          <button onClick={onClose} aria-label="Fechar" className="rounded p-1 hover:bg-accent"><X className="h-5 w-5" /></button>
        </div>

        <form onSubmit={create} className="flex gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome do novo cargo" className="flex-1 rounded-lg bg-secondary px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-10 w-12 rounded bg-transparent" />
          <button className="rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground">Criar</button>
        </form>

        <div className="mt-4 space-y-3">
          {roles.map((r) => (
            <div key={r.id} className="rounded-lg border border-border bg-secondary/40 p-3">
              <div className="mb-2 flex items-center gap-2">
                <input type="color" value={r.color} title="Trocar cor do cargo" onChange={(e) => run(setRoleColor({ data: { ...auth, roleId: r.id, color: e.target.value } }))} className="h-6 w-8 cursor-pointer rounded bg-transparent" />
                <span className="font-semibold" style={{ color: r.color }}>{r.name}</span>
                <button aria-label={`Apagar ${r.name}`} onClick={() => run(deleteRole({ data: { ...auth, roleId: r.id } }))} className="ml-auto text-muted-foreground hover:text-destructive">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <div className="grid gap-1.5 sm:grid-cols-2">
                {PERMS.map((p) => (
                  <label key={p.key} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={!!r.permissions?.includes(p.key)} onChange={(e) => toggle(r, p.key, e.target.checked)} />
                    {p.label}
                  </label>
                ))}
              </div>
              {!r.permissions?.length && <p className="mt-1 text-xs text-muted-foreground">Sem autoridades — só lê e entra em call.</p>}
            </div>
          ))}
        </div>

        <h3 className="mt-8 mb-3 text-lg font-semibold">Membros</h3>
        <div className="divide-y divide-border">
          {members.map((m) => (
            <div key={m.id} className="flex items-center justify-between py-2">
              <span className="font-medium" style={{ color: roles.find((r) => r.id === m.role_id)?.color }}>{m.nickname}</span>
              <select value={m.role_id ?? ""} onChange={(e) => run(setMemberRole({ data: { ...auth, targetId: m.id, roleId: e.target.value || null } }))} className="rounded-md bg-secondary px-2 py-1 text-sm">
                <option value="">Sem cargo</option>
                {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
