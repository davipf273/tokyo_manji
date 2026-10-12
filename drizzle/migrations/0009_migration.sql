DROP POLICY IF EXISTS "read members" ON public.members;
DROP POLICY IF EXISTS "read roles" ON public.roles;
DROP POLICY IF EXISTS "read messages" ON public.messages;
DROP POLICY IF EXISTS "read owner" ON public.app_owner;
DROP POLICY IF EXISTS "read channels" ON public.channels;
GRANT ALL ON public.members, public.roles, public.messages, public.app_owner, public.channels TO service_role;