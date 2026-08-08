-- ====================================================================
-- ANTIGRAVITY - ARAÇ TAKİP PWA: SUPABASE SCHEME & POLICIES (SQL)
-- ====================================================================

-- 1. Profiles Tablosu (Kullanıcı Detayları)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  age INT,
  gender TEXT CHECK (gender IN ('Bay', 'Bayan')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Vehicles Tablosu (Garaj & Araçlar)
CREATE TABLE IF NOT EXISTS public.vehicles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  plate TEXT NOT NULL,
  brand TEXT NOT NULL,
  model TEXT NOT NULL,
  year INT,
  current_km INT DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Reminders Tablosu (Hatırlatıcılar & Ajanda)
CREATE TABLE IF NOT EXISTS public.reminders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  vehicle_id UUID REFERENCES public.vehicles(id) ON DELETE CASCADE,
  type TEXT CHECK (type IN ('muayene', 'kasko', 'sigorta', 'mtv', 'bakim', 'diger')),
  title TEXT NOT NULL,
  target_date DATE,
  target_km INT,
  is_completed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. FCM Tokens Tablosu (Web Push Bildirimleri İçin)
CREATE TABLE IF NOT EXISTS public.fcm_tokens (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. Expenses Tablosu (Masraf Takibi)
CREATE TABLE IF NOT EXISTS public.expenses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  vehicle_id UUID REFERENCES public.vehicles(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  date DATE NOT NULL,
  km INT DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ====================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ====================================================================

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fcm_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

-- --------------------------------------------------------------------
-- Profiles Policies
-- --------------------------------------------------------------------
CREATE POLICY "Users can view own profile" 
  ON public.profiles FOR SELECT 
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "Anyone can insert profile during signup" ON public.profiles;
CREATE POLICY "Users can insert own profile" 
  ON public.profiles FOR INSERT 
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own profile" 
  ON public.profiles FOR UPDATE 
  USING (auth.uid() = id);

CREATE POLICY "Users can delete own profile" 
  ON public.profiles FOR DELETE 
  USING (auth.uid() = id);

-- --------------------------------------------------------------------
-- Vehicles Policies
-- --------------------------------------------------------------------
CREATE POLICY "Users can view own vehicles" 
  ON public.vehicles FOR SELECT 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own vehicles" 
  ON public.vehicles FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own vehicles" 
  ON public.vehicles FOR UPDATE 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own vehicles" 
  ON public.vehicles FOR DELETE 
  USING (auth.uid() = user_id);

-- --------------------------------------------------------------------
-- Reminders Policies
-- --------------------------------------------------------------------
CREATE POLICY "Users can view reminders for own vehicles" 
  ON public.reminders FOR SELECT 
  USING (
    EXISTS (
      SELECT 1 FROM public.vehicles 
      WHERE vehicles.id = reminders.vehicle_id 
      AND vehicles.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert reminders for own vehicles" 
  ON public.reminders FOR INSERT 
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.vehicles 
      WHERE vehicles.id = reminders.vehicle_id 
      AND vehicles.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update reminders for own vehicles" 
  ON public.reminders FOR UPDATE 
  USING (
    EXISTS (
      SELECT 1 FROM public.vehicles 
      WHERE vehicles.id = reminders.vehicle_id 
      AND vehicles.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete reminders for own vehicles" 
  ON public.reminders FOR DELETE 
  USING (
    EXISTS (
      SELECT 1 FROM public.vehicles 
      WHERE vehicles.id = reminders.vehicle_id 
      AND vehicles.user_id = auth.uid()
    )
  );

-- --------------------------------------------------------------------
-- FCM Tokens Policies
-- --------------------------------------------------------------------
CREATE POLICY "Users can manage own FCM tokens" 
  ON public.fcm_tokens FOR ALL 
  USING (auth.uid() = user_id);

-- --------------------------------------------------------------------
-- Expenses Policies
-- --------------------------------------------------------------------
CREATE POLICY "Users can view own expenses" 
  ON public.expenses FOR SELECT 
  USING (
    EXISTS (
      SELECT 1 FROM public.vehicles 
      WHERE vehicles.id = expenses.vehicle_id 
      AND vehicles.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own expenses" 
  ON public.expenses FOR INSERT 
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.vehicles 
      WHERE vehicles.id = expenses.vehicle_id 
      AND vehicles.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own expenses" 
  ON public.expenses FOR DELETE 
  USING (
    EXISTS (
      SELECT 1 FROM public.vehicles 
      WHERE vehicles.id = expenses.vehicle_id 
      AND vehicles.user_id = auth.uid()
    )
  );

-- ====================================================================
-- USEFUL INDEXES FOR PERFORMANCE
-- ====================================================================
CREATE INDEX IF NOT EXISTS idx_vehicles_user_id ON public.vehicles(user_id);
CREATE INDEX IF NOT EXISTS idx_reminders_vehicle_id ON public.reminders(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_fcm_tokens_user_id ON public.fcm_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_expenses_vehicle_id ON public.expenses(vehicle_id);
