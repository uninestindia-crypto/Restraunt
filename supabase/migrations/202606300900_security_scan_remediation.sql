DROP POLICY IF EXISTS "Allow staff to manage menu images" ON storage.objects;
CREATE POLICY "Allow staff to manage menu images" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'menu-images' AND EXISTS (
    SELECT 1 FROM public.staff_memberships sm
    WHERE sm.auth_user_id = (SELECT auth.uid()) AND sm.is_active = TRUE
  ))
  WITH CHECK (bucket_id = 'menu-images' AND EXISTS (
    SELECT 1 FROM public.staff_memberships sm
    WHERE sm.auth_user_id = (SELECT auth.uid()) AND sm.is_active = TRUE
  ));

REVOKE ALL ON FUNCTION public.emulate_stripe_webhook(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.consume_public_order_attempt(target_store_id TEXT, target_ip_hash TEXT, max_attempts INTEGER, window_minutes INTEGER)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE attempt_count INTEGER;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(target_store_id || ':' || target_ip_hash, 0));
  DELETE FROM public.public_order_rate_limits WHERE created_at < now() - make_interval(mins => window_minutes);
  SELECT count(*) INTO attempt_count FROM public.public_order_rate_limits
   WHERE store_id = target_store_id AND ip_hash = target_ip_hash AND created_at >= now() - make_interval(mins => window_minutes);
  IF attempt_count >= max_attempts THEN RETURN false; END IF;
  INSERT INTO public.public_order_rate_limits(store_id, ip_hash) VALUES (target_store_id, target_ip_hash);
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.consume_public_order_attempt(TEXT, TEXT, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_public_order_attempt(TEXT, TEXT, INTEGER, INTEGER) TO service_role;

CREATE TABLE IF NOT EXISTS public.staff_pin_rate_limits (id BIGSERIAL PRIMARY KEY, store_id TEXT NOT NULL, ip_hash TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
ALTER TABLE public.staff_pin_rate_limits ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.consume_staff_pin_attempt(target_store_id TEXT, target_ip_hash TEXT, max_attempts INTEGER, window_minutes INTEGER)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE attempt_count INTEGER;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(target_store_id || ':' || target_ip_hash, 0));
  DELETE FROM public.staff_pin_rate_limits WHERE created_at < now() - make_interval(mins => window_minutes);
  SELECT count(*) INTO attempt_count FROM public.staff_pin_rate_limits
   WHERE store_id = target_store_id AND ip_hash = target_ip_hash AND created_at >= now() - make_interval(mins => window_minutes);
  IF attempt_count >= max_attempts THEN RETURN false; END IF;
  INSERT INTO public.staff_pin_rate_limits(store_id, ip_hash) VALUES (target_store_id, target_ip_hash);
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.consume_staff_pin_attempt(TEXT, TEXT, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_staff_pin_attempt(TEXT, TEXT, INTEGER, INTEGER) TO service_role;
