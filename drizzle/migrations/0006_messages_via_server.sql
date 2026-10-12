DROP POLICY IF EXISTS "send messages" ON public.messages;
GRANT ALL ON public.messages TO service_role;