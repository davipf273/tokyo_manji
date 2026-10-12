ALTER TABLE public.roles ADD COLUMN permissions text[] NOT NULL DEFAULT '{}';
UPDATE public.roles SET permissions = ARRAY['kick','delete_messages','view_history','rename'] WHERE level >= 100;
COMMENT ON COLUMN public.roles.level IS 'DEPRECATED: replaced by permissions';