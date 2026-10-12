DROP POLICY IF EXISTS "open channels" ON public.channels;
CREATE POLICY "read channels" ON public.channels FOR SELECT TO anon, authenticated USING (true);
GRANT ALL ON public.channels TO service_role;