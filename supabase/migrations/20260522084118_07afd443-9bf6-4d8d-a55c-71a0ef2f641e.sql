
-- Menu items table
CREATE TABLE public.menu_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  price numeric(10,2),
  category text,
  photo_url text,
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_menu_items_restaurant ON public.menu_items(restaurant_id);

ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone reads active menu items"
  ON public.menu_items FOR SELECT
  TO public
  USING (active = true);

CREATE POLICY "owners manage own menu items"
  ON public.menu_items FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.restaurants r WHERE r.id = menu_items.restaurant_id AND r.owner_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.restaurants r WHERE r.id = menu_items.restaurant_id AND r.owner_id = auth.uid()));

CREATE POLICY "admins manage menu items"
  ON public.menu_items FOR ALL
  TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));

-- Storage bucket for menu photos
INSERT INTO storage.buckets (id, name, public) VALUES ('menu-photos', 'menu-photos', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "menu photos publicly readable"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'menu-photos');

CREATE POLICY "owners upload menu photos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'menu-photos'
    AND EXISTS (
      SELECT 1 FROM public.restaurants r
      WHERE r.owner_id = auth.uid()
      AND (storage.foldername(name))[1] = r.id::text
    )
  );

CREATE POLICY "owners update menu photos"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'menu-photos'
    AND EXISTS (
      SELECT 1 FROM public.restaurants r
      WHERE r.owner_id = auth.uid()
      AND (storage.foldername(name))[1] = r.id::text
    )
  );

CREATE POLICY "owners delete menu photos"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'menu-photos'
    AND EXISTS (
      SELECT 1 FROM public.restaurants r
      WHERE r.owner_id = auth.uid()
      AND (storage.foldername(name))[1] = r.id::text
    )
  );
