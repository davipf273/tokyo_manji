CREATE TABLE public.member_tokens (member_id uuid PRIMARY KEY REFERENCES public.members(id) ON DELETE CASCADE, token text NOT NULL);
GRANT ALL ON public.member_tokens TO service_role;
ALTER TABLE public.member_tokens ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.app_owner (id boolean PRIMARY KEY DEFAULT true, member_id uuid REFERENCES public.members(id) ON DELETE SET NULL);
GRANT SELECT ON public.app_owner TO anon, authenticated;
GRANT ALL ON public.app_owner TO service_role;
ALTER TABLE public.app_owner ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read owner" ON public.app_owner FOR SELECT TO anon, authenticated USING (true);

DROP POLICY "open members" ON public.members;
CREATE POLICY "read members" ON public.members FOR SELECT TO anon, authenticated USING (true);
DROP POLICY "open roles" ON public.roles;
CREATE POLICY "read roles" ON public.roles FOR SELECT TO anon, authenticated USING (true);
GRANT ALL ON public.members, public.roles TO service_role;
CREATE UNIQUE INDEX IF NOT EXISTS members_nick_lower ON public.members (lower(nickname)) WHERE nickname <> 'shadow';