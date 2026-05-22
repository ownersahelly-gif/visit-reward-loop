
-- Redemptions: one row per completed+verified cycle
CREATE TABLE public.redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  offer_id uuid NOT NULL REFERENCES public.offers(id) ON DELETE CASCADE,
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  redeemed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_redemptions_user_offer ON public.redemptions(user_id, offer_id, redeemed_at DESC);
ALTER TABLE public.redemptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users read own redemptions" ON public.redemptions
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "owners read restaurant redemptions" ON public.redemptions
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.restaurants r WHERE r.id = redemptions.restaurant_id AND r.owner_id = auth.uid())
  );
CREATE POLICY "owners insert restaurant redemptions" ON public.redemptions
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM public.restaurants r WHERE r.id = redemptions.restaurant_id AND r.owner_id = auth.uid())
  );
CREATE POLICY "admins manage redemptions" ON public.redemptions
  FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));

-- Short-lived 6-digit codes shown by customer to restaurant
CREATE TABLE public.redemption_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  offer_id uuid NOT NULL REFERENCES public.offers(id) ON DELETE CASCADE,
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  code text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_codes_lookup ON public.redemption_codes(restaurant_id, code) WHERE used_at IS NULL;
ALTER TABLE public.redemption_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users manage own codes" ON public.redemption_codes
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "owners read restaurant codes" ON public.redemption_codes
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.restaurants r WHERE r.id = redemption_codes.restaurant_id AND r.owner_id = auth.uid())
  );
CREATE POLICY "owners update restaurant codes" ON public.redemption_codes
  FOR UPDATE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.restaurants r WHERE r.id = redemption_codes.restaurant_id AND r.owner_id = auth.uid())
  );
CREATE POLICY "admins manage codes" ON public.redemption_codes
  FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));
