
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL DEFAULT 'user',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own role" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  email TEXT NOT NULL,
  display_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own profile" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL, name TEXT NOT NULL, phone TEXT, email TEXT, address TEXT, city TEXT,
  opening_balance NUMERIC DEFAULT 0, current_balance NUMERIC DEFAULT 0, notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can CRUD contacts" ON public.contacts FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.product_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name TEXT NOT NULL, description TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.product_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can CRUD product_categories" ON public.product_categories FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name TEXT NOT NULL, sku TEXT,
  category_id UUID REFERENCES public.product_categories(id),
  purchase_price NUMERIC DEFAULT 0, selling_price NUMERIC DEFAULT 0,
  quantity NUMERIC DEFAULT 0, unit TEXT, alert_threshold NUMERIC DEFAULT 5,
  brand TEXT, description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can CRUD products" ON public.products FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.sale_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES public.contacts(id),
  date DATE NOT NULL DEFAULT CURRENT_DATE, invoice_no TEXT, subtotal NUMERIC DEFAULT 0,
  discount NUMERIC DEFAULT 0, total NUMERIC DEFAULT 0, payment_method TEXT,
  payment_status TEXT DEFAULT 'paid', customer_type TEXT, notes TEXT,
  paid_amount NUMERIC DEFAULT 0,
  created_by UUID REFERENCES auth.users(id), created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.sale_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can CRUD sale_transactions" ON public.sale_transactions FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.sale_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id UUID REFERENCES public.sale_transactions(id) ON DELETE CASCADE NOT NULL,
  product_id UUID REFERENCES public.products(id), product_name TEXT,
  quantity NUMERIC NOT NULL DEFAULT 1, unit_price NUMERIC NOT NULL DEFAULT 0, subtotal NUMERIC NOT NULL DEFAULT 0
);
ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can CRUD sale_items" ON public.sale_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID REFERENCES public.contacts(id),
  date DATE NOT NULL DEFAULT CURRENT_DATE, reference_no TEXT, total NUMERIC DEFAULT 0,
  discount NUMERIC DEFAULT 0, payment_status TEXT DEFAULT 'paid', payment_method TEXT,
  notes TEXT, created_by UUID REFERENCES auth.users(id), created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can CRUD purchases" ON public.purchases FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.purchase_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id UUID REFERENCES public.purchases(id) ON DELETE CASCADE NOT NULL,
  product_id UUID REFERENCES public.products(id),
  quantity NUMERIC NOT NULL DEFAULT 1, unit_price NUMERIC NOT NULL DEFAULT 0, subtotal NUMERIC NOT NULL DEFAULT 0
);
ALTER TABLE public.purchase_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can CRUD purchase_items" ON public.purchase_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.expense_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.expense_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can CRUD expense_categories" ON public.expense_categories FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID REFERENCES public.expense_categories(id),
  amount NUMERIC NOT NULL, date DATE NOT NULL DEFAULT CURRENT_DATE, description TEXT,
  payment_method TEXT, reference_no TEXT, created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can CRUD expenses" ON public.expenses FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.ledger_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID REFERENCES public.contacts(id) ON DELETE CASCADE NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE, description TEXT NOT NULL,
  debit NUMERIC DEFAULT 0, credit NUMERIC DEFAULT 0, balance NUMERIC DEFAULT 0,
  reference_type TEXT, reference_id UUID, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.ledger_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can CRUD ledger_entries" ON public.ledger_entries FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID, user_email TEXT, action TEXT NOT NULL, entity_type TEXT NOT NULL,
  entity_id TEXT, description TEXT, details JSONB, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can read audit_logs" ON public.audit_logs FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Authenticated can insert audit_logs" ON public.audit_logs FOR INSERT TO authenticated WITH CHECK (true);

CREATE TABLE public.daily_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL UNIQUE, total_sales NUMERIC DEFAULT 0, total_purchases NUMERIC DEFAULT 0,
  total_expenses NUMERIC DEFAULT 0, net_profit NUMERIC DEFAULT 0,
  sales_count INT DEFAULT 0, purchases_count INT DEFAULT 0, expenses_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.daily_summaries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can CRUD daily_summaries" ON public.daily_summaries FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.receivable_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id UUID REFERENCES public.sale_transactions(id) ON DELETE CASCADE NOT NULL,
  amount NUMERIC NOT NULL, payment_method TEXT, date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT, created_by UUID REFERENCES auth.users(id), created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.receivable_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can CRUD receivable_payments" ON public.receivable_payments FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.login_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier TEXT NOT NULL, attempted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.login_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can manage login_attempts" ON public.login_attempts FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE public.price_lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL, description TEXT, is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.price_lists ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can CRUD price_lists" ON public.price_lists FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.price_list_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  price_list_id UUID REFERENCES public.price_lists(id) ON DELETE CASCADE NOT NULL,
  product_id UUID REFERENCES public.products(id) ON DELETE CASCADE NOT NULL,
  custom_price NUMERIC NOT NULL DEFAULT 0, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.price_list_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can CRUD price_list_items" ON public.price_list_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.backup_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  file_name TEXT NOT NULL, file_id TEXT, status TEXT DEFAULT 'completed',
  type TEXT DEFAULT 'manual', error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.backup_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own backups" ON public.backup_history FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.cash_register (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  opening_balance NUMERIC NOT NULL DEFAULT 0, cash_in NUMERIC DEFAULT 0,
  cash_out NUMERIC DEFAULT 0, expected_balance NUMERIC DEFAULT 0,
  actual_balance NUMERIC, discrepancy NUMERIC, notes TEXT,
  status TEXT DEFAULT 'open', opened_by UUID, closed_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.cash_register ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can CRUD cash_register" ON public.cash_register FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.app_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE, value TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can CRUD app_settings" ON public.app_settings FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.google_drive_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  access_token TEXT NOT NULL, refresh_token TEXT NOT NULL,
  expiry_date BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.google_drive_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own tokens" ON public.google_drive_tokens FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can read all profiles" ON public.profiles FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can read all roles" ON public.user_roles FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can manage roles" ON public.user_roles FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TABLE public.returns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id UUID REFERENCES public.sale_transactions(id) ON DELETE SET NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  total_refund NUMERIC NOT NULL DEFAULT 0,
  refund_method TEXT, reason TEXT, notes TEXT,
  created_by UUID, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.returns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can CRUD returns" ON public.returns FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.return_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  return_id UUID NOT NULL REFERENCES public.returns(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  product_name TEXT, quantity NUMERIC NOT NULL DEFAULT 1,
  unit_price NUMERIC NOT NULL DEFAULT 0, subtotal NUMERIC NOT NULL DEFAULT 0
);
ALTER TABLE public.return_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can CRUD return_items" ON public.return_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL, title TEXT NOT NULL, message TEXT,
  type TEXT NOT NULL DEFAULT 'info', is_read BOOLEAN NOT NULL DEFAULT false,
  link TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own notifications" ON public.notifications FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own notifications" ON public.notifications FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own notifications" ON public.notifications FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own notifications" ON public.notifications FOR DELETE TO authenticated USING (auth.uid() = user_id);
