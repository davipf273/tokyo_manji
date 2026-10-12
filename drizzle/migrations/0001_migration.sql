alter table public.members add column avatar_url text;
create policy "avatars public read" on storage.objects for select to anon, authenticated using (bucket_id = 'avatars');
create policy "avatars upload" on storage.objects for insert to anon, authenticated with check (bucket_id = 'avatars');