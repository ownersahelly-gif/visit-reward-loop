ALTER TABLE public.redemptions ADD COLUMN IF NOT EXISTS verified_by uuid;
CREATE INDEX IF NOT EXISTS idx_redemptions_verified_by ON public.redemptions(verified_by);