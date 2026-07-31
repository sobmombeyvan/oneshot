-- Professional cash register: per-cashier sessions, split payments, tender/change.
-- Run in Supabase SQL Editor after 006_accounting_on_payment.sql

-- ── Types ──────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE public.cash_session_status AS ENUM ('open', 'closed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.cash_movement_type AS ENUM (
    'opening_float',
    'cash_sale',
    'change_out',
    'cash_in',
    'cash_out',
    'closing'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── Tables ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.cash_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cashier_id UUID NOT NULL REFERENCES public.profiles(id),
  status public.cash_session_status NOT NULL DEFAULT 'open',
  opening_float DECIMAL(12,2) NOT NULL DEFAULT 0,
  expected_cash DECIMAL(12,2) NOT NULL DEFAULT 0,
  counted_cash DECIMAL(12,2),
  variance DECIMAL(12,2),
  opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_cash_sessions_one_open_per_cashier
  ON public.cash_sessions (cashier_id)
  WHERE status = 'open';

CREATE TABLE IF NOT EXISTS public.invoice_payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  method public.payment_method NOT NULL,
  amount DECIMAL(12,2) NOT NULL CHECK (amount > 0),
  amount_received DECIMAL(12,2),
  change_due DECIMAL(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.cash_movements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES public.cash_sessions(id) ON DELETE CASCADE,
  type public.cash_movement_type NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  reason TEXT,
  invoice_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Invoice cash fields
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS cash_session_id UUID REFERENCES public.cash_sessions(id),
  ADD COLUMN IF NOT EXISTS amount_received DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS change_due DECIMAL(12,2) DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_cash_sessions_cashier ON public.cash_sessions(cashier_id);
CREATE INDEX IF NOT EXISTS idx_cash_sessions_status ON public.cash_sessions(status);
CREATE INDEX IF NOT EXISTS idx_invoice_payments_invoice ON public.invoice_payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_cash_movements_session ON public.cash_movements(session_id);

-- ── RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE public.cash_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_movements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff read cash sessions" ON public.cash_sessions;
CREATE POLICY "Staff read cash sessions"
  ON public.cash_sessions FOR SELECT TO authenticated
  USING (
    cashier_id = auth.uid()
    OR public.get_user_role() IN ('administrator', 'manager')
  );

DROP POLICY IF EXISTS "Cashiers insert own sessions" ON public.cash_sessions;
CREATE POLICY "Cashiers insert own sessions"
  ON public.cash_sessions FOR INSERT TO authenticated
  WITH CHECK (
    cashier_id = auth.uid()
    AND public.get_user_role() IN ('administrator', 'manager', 'cashier')
  );

DROP POLICY IF EXISTS "Cashiers update own sessions" ON public.cash_sessions;
CREATE POLICY "Cashiers update own sessions"
  ON public.cash_sessions FOR UPDATE TO authenticated
  USING (
    cashier_id = auth.uid()
    OR public.get_user_role() IN ('administrator', 'manager')
  );

DROP POLICY IF EXISTS "Staff read invoice payments" ON public.invoice_payments;
CREATE POLICY "Staff read invoice payments"
  ON public.invoice_payments FOR SELECT TO authenticated
  USING (public.get_user_role() IN ('administrator', 'manager', 'cashier'));

DROP POLICY IF EXISTS "Staff insert invoice payments" ON public.invoice_payments;
CREATE POLICY "Staff insert invoice payments"
  ON public.invoice_payments FOR INSERT TO authenticated
  WITH CHECK (public.get_user_role() IN ('administrator', 'manager', 'cashier'));

DROP POLICY IF EXISTS "Staff read cash movements" ON public.cash_movements;
CREATE POLICY "Staff read cash movements"
  ON public.cash_movements FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.cash_sessions s
      WHERE s.id = session_id
        AND (s.cashier_id = auth.uid() OR public.get_user_role() IN ('administrator', 'manager'))
    )
  );

DROP POLICY IF EXISTS "Staff insert cash movements" ON public.cash_movements;
CREATE POLICY "Staff insert cash movements"
  ON public.cash_movements FOR INSERT TO authenticated
  WITH CHECK (
    public.get_user_role() IN ('administrator', 'manager', 'cashier')
    AND EXISTS (
      SELECT 1 FROM public.cash_sessions s
      WHERE s.id = session_id
        AND s.status = 'open'
        AND (s.cashier_id = auth.uid() OR public.get_user_role() IN ('administrator', 'manager'))
    )
  );

-- ── Helpers ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.recalc_session_expected(p_session_id UUID)
RETURNS DECIMAL
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_expected DECIMAL(12,2);
BEGIN
  SELECT COALESCE(SUM(
    CASE
      WHEN type IN ('opening_float', 'cash_sale', 'cash_in') THEN amount
      WHEN type IN ('change_out', 'cash_out') THEN -amount
      ELSE 0
    END
  ), 0)
  INTO v_expected
  FROM public.cash_movements
  WHERE session_id = p_session_id
    AND type <> 'closing';

  UPDATE public.cash_sessions
  SET expected_cash = v_expected
  WHERE id = p_session_id;

  RETURN v_expected;
END;
$$;

CREATE OR REPLACE FUNCTION public.open_cash_session(p_opening_float DECIMAL)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_role public.user_role;
  v_session_id UUID;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;

  SELECT role INTO v_role FROM public.profiles WHERE id = v_uid;
  IF v_role IS NULL OR v_role NOT IN ('administrator', 'manager', 'cashier') THEN
    RAISE EXCEPTION 'Rôle non autorisé pour ouvrir la caisse';
  END IF;

  IF p_opening_float IS NULL OR p_opening_float < 0 THEN
    RAISE EXCEPTION 'Fond de caisse invalide';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.cash_sessions
    WHERE cashier_id = v_uid AND status = 'open'
  ) THEN
    RAISE EXCEPTION 'Une caisse est déjà ouverte pour ce caissier';
  END IF;

  INSERT INTO public.cash_sessions (cashier_id, opening_float, expected_cash, status)
  VALUES (v_uid, p_opening_float, p_opening_float, 'open')
  RETURNING id INTO v_session_id;

  INSERT INTO public.cash_movements (session_id, type, amount, reason, created_by)
  VALUES (v_session_id, 'opening_float', p_opening_float, 'Fond d''ouverture', v_uid);

  RETURN v_session_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.add_cash_movement(
  p_session_id UUID,
  p_type TEXT,
  p_amount DECIMAL,
  p_reason TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_role public.user_role;
  v_session public.cash_sessions%ROWTYPE;
  v_id UUID;
  v_mov_type public.cash_movement_type;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Non authentifié'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'Montant invalide'; END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 2 THEN
    RAISE EXCEPTION 'Motif obligatoire';
  END IF;

  IF p_type NOT IN ('cash_in', 'cash_out') THEN
    RAISE EXCEPTION 'Type de mouvement invalide';
  END IF;
  v_mov_type := p_type::public.cash_movement_type;

  SELECT role INTO v_role FROM public.profiles WHERE id = v_uid;
  SELECT * INTO v_session FROM public.cash_sessions WHERE id = p_session_id FOR UPDATE;

  IF v_session.id IS NULL THEN RAISE EXCEPTION 'Session introuvable'; END IF;
  IF v_session.status <> 'open' THEN RAISE EXCEPTION 'Caisse déjà clôturée'; END IF;
  IF v_session.cashier_id <> v_uid AND v_role NOT IN ('administrator', 'manager') THEN
    RAISE EXCEPTION 'Accès refusé à cette caisse';
  END IF;

  INSERT INTO public.cash_movements (session_id, type, amount, reason, created_by)
  VALUES (p_session_id, v_mov_type, p_amount, trim(p_reason), v_uid)
  RETURNING id INTO v_id;

  PERFORM public.recalc_session_expected(p_session_id);
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.close_cash_session(
  p_session_id UUID,
  p_counted_cash DECIMAL,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_role public.user_role;
  v_session public.cash_sessions%ROWTYPE;
  v_expected DECIMAL(12,2);
  v_variance DECIMAL(12,2);
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Non authentifié'; END IF;
  IF p_counted_cash IS NULL OR p_counted_cash < 0 THEN
    RAISE EXCEPTION 'Montant compté invalide';
  END IF;

  SELECT role INTO v_role FROM public.profiles WHERE id = v_uid;
  SELECT * INTO v_session FROM public.cash_sessions WHERE id = p_session_id FOR UPDATE;

  IF v_session.id IS NULL THEN RAISE EXCEPTION 'Session introuvable'; END IF;
  IF v_session.status <> 'open' THEN RAISE EXCEPTION 'Caisse déjà clôturée'; END IF;
  IF v_session.cashier_id <> v_uid AND v_role NOT IN ('administrator', 'manager') THEN
    RAISE EXCEPTION 'Accès refusé à cette caisse';
  END IF;

  v_expected := public.recalc_session_expected(p_session_id);
  v_variance := p_counted_cash - v_expected;

  INSERT INTO public.cash_movements (session_id, type, amount, reason, created_by)
  VALUES (p_session_id, 'closing', p_counted_cash, COALESCE(p_notes, 'Clôture de caisse'), v_uid);

  UPDATE public.cash_sessions
  SET
    status = 'closed',
    counted_cash = p_counted_cash,
    expected_cash = v_expected,
    variance = v_variance,
    closed_at = NOW(),
    notes = p_notes
  WHERE id = p_session_id;

  RETURN json_build_object(
    'session_id', p_session_id,
    'expected_cash', v_expected,
    'counted_cash', p_counted_cash,
    'variance', v_variance
  );
END;
$$;

-- Atomic payment validation
CREATE OR REPLACE FUNCTION public.settle_order_payment(
  p_order_id UUID,
  p_payments JSONB,
  p_cash_received DECIMAL DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_role public.user_role;
  v_order public.orders%ROWTYPE;
  v_session public.cash_sessions%ROWTYPE;
  v_session_id UUID;
  v_invoice_id UUID;
  v_invoice_number TEXT;
  v_pay JSONB;
  v_method TEXT;
  v_amount DECIMAL(12,2);
  v_sum DECIMAL(12,2) := 0;
  v_cash_amount DECIMAL(12,2) := 0;
  v_cash_received DECIMAL(12,2) := 0;
  v_change DECIMAL(12,2) := 0;
  v_primary_method public.payment_method;
  v_method_count INT := 0;
  v_item RECORD;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Non authentifié'; END IF;

  SELECT role INTO v_role FROM public.profiles WHERE id = v_uid;
  IF v_role IS NULL OR v_role NOT IN ('administrator', 'manager', 'cashier') THEN
    RAISE EXCEPTION 'Rôle non autorisé';
  END IF;

  IF p_payments IS NULL OR jsonb_typeof(p_payments) <> 'array' OR jsonb_array_length(p_payments) = 0 THEN
    RAISE EXCEPTION 'Aucun paiement fourni';
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF v_order.id IS NULL THEN RAISE EXCEPTION 'Commande introuvable'; END IF;
  IF v_order.status = 'cancelled' THEN RAISE EXCEPTION 'Commande déjà annulée'; END IF;
  IF v_order.status = 'completed' AND v_order.payment_method IS NOT NULL THEN
    RAISE EXCEPTION 'Commande déjà encaissée';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.invoices WHERE order_id = p_order_id AND status = 'paid'
  ) THEN
    RAISE EXCEPTION 'Facture déjà émise pour cette commande';
  END IF;

  -- Sum & validate payment lines
  FOR v_pay IN SELECT * FROM jsonb_array_elements(p_payments)
  LOOP
    v_method := v_pay ->> 'method';
    v_amount := COALESCE((v_pay ->> 'amount')::DECIMAL, 0);

    IF v_method IS NULL OR v_method NOT IN ('cash', 'orange_money', 'mtn_momo', 'bank_card') THEN
      RAISE EXCEPTION 'Mode de paiement invalide: %', COALESCE(v_method, '?');
    END IF;
    IF v_amount <= 0 THEN
      RAISE EXCEPTION 'Montant de paiement invalide';
    END IF;

    v_sum := v_sum + v_amount;
    v_method_count := v_method_count + 1;

    IF v_method = 'cash' THEN
      v_cash_amount := v_cash_amount + v_amount;
    END IF;
  END LOOP;

  IF ABS(v_sum - v_order.total) > 0.01 THEN
    RAISE EXCEPTION 'La somme des paiements (%) doit égaler le total (%)', v_sum, v_order.total;
  END IF;

  -- Cash tender / change
  IF v_cash_amount > 0 THEN
    v_cash_received := COALESCE(p_cash_received, v_cash_amount);
    IF v_cash_received < v_cash_amount THEN
      RAISE EXCEPTION 'Espèces reçues insuffisantes (reçu %, dû %)', v_cash_received, v_cash_amount;
    END IF;
    v_change := v_cash_received - v_cash_amount;

    SELECT * INTO v_session
    FROM public.cash_sessions
    WHERE cashier_id = v_uid AND status = 'open'
    FOR UPDATE;

    IF v_session.id IS NULL THEN
      RAISE EXCEPTION 'Ouvrez votre caisse avant d''encaisser des espèces';
    END IF;
    v_session_id := v_session.id;
  ELSE
    -- Non-cash: attach open session if any (optional)
    SELECT id INTO v_session_id
    FROM public.cash_sessions
    WHERE cashier_id = v_uid AND status = 'open'
    LIMIT 1;
  END IF;

  v_primary_method := CASE
    WHEN v_method_count > 1 THEN 'mixed'::public.payment_method
    ELSE (p_payments -> 0 ->> 'method')::public.payment_method
  END;

  -- Invoice number
  v_invoice_number := public.generate_invoice_number();

  INSERT INTO public.invoices (
    invoice_number, order_id, subtotal, discount, tax, total,
    payment_method, status, cashier_id,
    cash_session_id, amount_received, change_due
  ) VALUES (
    v_invoice_number, p_order_id, v_order.subtotal, v_order.discount, v_order.tax, v_order.total,
    v_primary_method, 'paid', v_uid,
    v_session_id,
    CASE WHEN v_cash_amount > 0 THEN v_cash_received ELSE NULL END,
    v_change
  )
  RETURNING id INTO v_invoice_id;

  -- Payment lines
  FOR v_pay IN SELECT * FROM jsonb_array_elements(p_payments)
  LOOP
    v_method := v_pay ->> 'method';
    v_amount := (v_pay ->> 'amount')::DECIMAL;

    INSERT INTO public.invoice_payments (
      invoice_id, method, amount, amount_received, change_due
    ) VALUES (
      v_invoice_id,
      v_method::public.payment_method,
      v_amount,
      CASE WHEN v_method = 'cash' THEN v_cash_received ELSE NULL END,
      CASE WHEN v_method = 'cash' THEN v_change ELSE 0 END
    );
  END LOOP;

  -- Cash movements
  IF v_cash_amount > 0 AND v_session_id IS NOT NULL THEN
    INSERT INTO public.cash_movements (session_id, type, amount, reason, invoice_id, created_by)
    VALUES (
      v_session_id, 'cash_sale', v_cash_received,
      'Espèces reçues #' || left(p_order_id::text, 8),
      v_invoice_id, v_uid
    );

    IF v_change > 0 THEN
      INSERT INTO public.cash_movements (session_id, type, amount, reason, invoice_id, created_by)
      VALUES (
        v_session_id, 'change_out', v_change,
        'Monnaie rendue #' || left(p_order_id::text, 8),
        v_invoice_id, v_uid
      );
    END IF;

    PERFORM public.recalc_session_expected(v_session_id);
  END IF;

  -- Complete order
  UPDATE public.orders
  SET status = 'completed', payment_method = v_primary_method, updated_at = NOW()
  WHERE id = p_order_id;

  -- Stock OUT
  FOR v_item IN
    SELECT product_id, quantity FROM public.order_items WHERE order_id = p_order_id
  LOOP
    INSERT INTO public.stock_movements (product_id, type, quantity, reason, user_id)
    VALUES (
      v_item.product_id, 'OUT', v_item.quantity,
      'Paiement validé #' || left(p_order_id::text, 8),
      v_uid
    );
  END LOOP;

  IF v_order.table_id IS NOT NULL THEN
    UPDATE public.restaurant_tables
    SET status = 'cleaning'
    WHERE id = v_order.table_id;
  END IF;

  RETURN json_build_object(
    'invoice_id', v_invoice_id,
    'invoice_number', v_invoice_number,
    'payment_method', v_primary_method,
    'amount_received', CASE WHEN v_cash_amount > 0 THEN v_cash_received ELSE NULL END,
    'change_due', v_change,
    'cash_session_id', v_session_id,
    'has_cash', v_cash_amount > 0
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.open_cash_session(DECIMAL) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_cash_movement(UUID, TEXT, DECIMAL, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.close_cash_session(UUID, DECIMAL, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.settle_order_payment(UUID, JSONB, DECIMAL) TO authenticated;
GRANT EXECUTE ON FUNCTION public.recalc_session_expected(UUID) TO authenticated;

GRANT SELECT, INSERT, UPDATE ON public.cash_sessions TO authenticated;
GRANT SELECT, INSERT ON public.invoice_payments TO authenticated;
GRANT SELECT, INSERT ON public.cash_movements TO authenticated;
