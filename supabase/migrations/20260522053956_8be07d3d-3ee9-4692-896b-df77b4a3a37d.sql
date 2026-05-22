
CREATE TABLE public.branch_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  requested_by uuid NOT NULL,
  request_type text NOT NULL DEFAULT 'new' CHECK (request_type IN ('new','reissue')),
  branch_label text NOT NULL,
  staff_email text,
  staff_password text,
  staff_full_name text,
  existing_staff_id uuid REFERENCES public.restaurant_staff(id) ON DELETE SET NULL,
  fee_amount integer NOT NULL DEFAULT 1000,
  currency text NOT NULL DEFAULT 'EGP',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','shipped','delivered','rejected')),
  resulting_staff_id uuid REFERENCES public.restaurant_staff(id) ON DELETE SET NULL,
  reject_reason text,
  shipping_address text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  shipped_at timestamptz,
  delivered_at timestamptz,
  paid_at timestamptz
);

CREATE INDEX idx_branch_requests_restaurant ON public.branch_requests(restaurant_id);
CREATE INDEX idx_branch_requests_status ON public.branch_requests(status);
CREATE INDEX idx_branch_requests_requested_by ON public.branch_requests(requested_by);

ALTER TABLE public.branch_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner creates own branch requests" ON public.branch_requests
FOR INSERT TO authenticated
WITH CHECK (
  requested_by = auth.uid()
  AND EXISTS (SELECT 1 FROM public.restaurants r WHERE r.id = restaurant_id AND r.owner_id = auth.uid())
);

CREATE POLICY "owner reads own branch requests" ON public.branch_requests
FOR SELECT TO authenticated
USING (requested_by = auth.uid());

CREATE POLICY "admins manage branch requests" ON public.branch_requests
FOR ALL TO authenticated
USING (private.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));
