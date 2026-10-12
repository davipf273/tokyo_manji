ALTER TABLE public.roles ADD COLUMN IF NOT EXISTS level integer NOT NULL DEFAULT 0;
UPDATE public.roles SET level = 100 WHERE name = 'Admin';

UPDATE public.messages SET member_id = NULL WHERE member_id IS DISTINCT FROM (SELECT member_id FROM public.app_owner WHERE id = true);
DELETE FROM public.members WHERE id IS DISTINCT FROM (SELECT member_id FROM public.app_owner WHERE id = true);

DROP INDEX IF EXISTS public.members_nick_lower;
CREATE UNIQUE INDEX members_nick_lower ON public.members (lower(nickname));

DROP POLICY IF EXISTS "open messages" ON public.messages;
CREATE POLICY "read messages" ON public.messages FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "send messages" ON public.messages FOR INSERT TO anon, authenticated WITH CHECK (length(content) BETWEEN 1 AND 2000);
GRANT ALL ON public.messages TO service_role;