ALTER TABLE public.redemptions REPLICA IDENTITY FULL;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.redemptions;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;