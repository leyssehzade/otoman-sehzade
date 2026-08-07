# 🚀 GOOGLE ANTI-GRAVITY MASTER PROMPT: ANTIGRAVITY (ARAÇ TAKİP PWA)

Sevgili Anti-Gravity, geliştireceğimiz "ANTIGRAVITY - Araç Takip ve Akıllı Hatırlatıcı" Progressive Web App (PWA) projesinin tüm modülleri, mimarisi, mantığı ve veritabanı şeması aşağıda detaylandırılmıştır. Projeyi bu yapı ve adımlara %100 sadık kalarak geliştirmelisin.

---

## 📌 PROJE ADI & KONSEPT
- **Proje Adı:** ANTIGRAVITY
- **Motto:** "Aracınızın Tüm Bakım ve Takip Yükünü Hafifletin."
- **Tanım:** Araç sahiplerinin muayene, sigorta, kasko, MTV ve KM bazlı periyodik bakımlarını takip eden, günü/KM'si yaklaştığında kilit ekranına uzaktan bildirim gönderen akıllı PWA platformu.

---

## 🛠️ TEKNOLOJİ YIĞINI (TECH STACK)
- **Frontend:** Flutter Web (PWA yapılandırmalı, Ana Ekrana Ekleme destekli)
- **Veritabanı & Auth:** Supabase (PostgreSQL & Supabase Auth)
- **Bildirim Servisi:** Firebase Cloud Messaging (FCM - Web Push Notification)
- **Backend & Hosting:** Node.js (Vercel Serverless Functions) + GitHub + Vercel Cron Jobs

---

## 📋 ADIM ADIM UYGULAMA MODÜLLERİ

### 🔹 ADIM 1: Giriş, Şifre Sıfırlama (OTP) ve Kayıt Ol
1. **Giriş Yap (Login):**
   - E-posta veya şifre hatalı ise ekranın tam ortasında Popup göster: `"E-posta veya şifreniz hatalı"`.
2. **Şifremi Unuttum (OTP Doğrulama):**
   - Sayfa altındaki "Şifremi Unuttum" butonuna basılınca e-postaya 6 haneli kod gönderilir.
   - **1. Popup:** OTP Kodu girilir. Kod yanlışsa `"Girdiğiniz kod yanlış"` uyarısı verilir.
   - **2. Popup:** Kod doğruysa açılır. `Yeni Şifre` ve `Yeni Şifre (Tekrar)` alanları yer alır.
   - **Şifre Kuralları:** Min 8 karakter, min 1 büyük harf, min 1 küçük harf, min 1 rakam.
3. **Kayıt Ol (Register):**
   - Form alanları: İsim, Soyisim, E-posta, Şifre (güvenlik kuralları geçerli), Yaş, Cinsiyet (`Bay` / `Bayan`).
   - Veriler Supabase `auth.users` ve `profiles` tablosuna kaydedilir.

---

### 🔹 ADIM 2: Garaj (Araç Yönetimi)
1. **Araç Listesi (Ana Ekran):**
   - Kullanıcının eklediği araçlar kart (Card) tasarımında listelenir.
   - Kart üzerinde: Plaka, Marka/Model, Yıl ve Güncel KM görünür.
2. **Araç Ekleme / Düzenleme / Silme:**
   - Form alanları: Plaka, Marka, Model, Yıl, Güncel Kilometre (KM).
   - Kullanıcı dilediği zaman güncel kilometresini güncelleyebilir.

---

### 🔹 ADIM 3: Hatırlatıcı Yönetimi (Akıllı Ajanda)
1. **Tarih Bazlı Hatırlatıcılar:**
   - Muayene, Trafik Sigortası, Kasko, MTV bitiş tarihleri girilir.
2. **Kilometre (KM) Bazlı Hatırlatıcılar:**
   - Periyodik Yağ Bakımı, Triger Kayışı vb. için hedef KM belirlenir (Örn: Güncel KM: 100.000, Bakım KM: 110.000).
3. **Kart Durum Gör visuals:**
   - Yaklaşan tarihler/kilometreler (örn. 7 günden az kalanlar) **Sarı/Kırmızı** renk kodlarıyla vurgulanır.

---

### 🔹 ADIM 4: Masraf Takibi (Opsiyonel / Modüler)
1. **Masraf Ekleme:**
   - Yakıt, Bakım, Sigorta, Yıkama ve Diğer kategorilerinde harcama kaydı.
2. **Tutar ve KM Kaydı:**
   - Harcama tutarı, tarihi ve harcama yapıldığı andaki araç kilometresi girilir.
3. **Aylık Özet:**
   - Aracın aylık toplam masrafı basit bir grafik veya özet kart ile gösterilir.

---

### 🔹 ADIM 5: Web Push Bildirimleri & Otomasyon
1. **Service Worker Entegrasyonu:**
   - Uygulama açılışında kullanıcıdan bildirim izni istenir ve FCM Token alınarak Supabase `fcm_tokens` tablosuna kaydedilir.
2. **Arka Plan Bildirimleri:**
   - `firebase-messaging-sw.js` sayesinde tarayıcı kapalı olsa bile bildirim kilit ekranına düşer.
3. **Otomatik Zamanlayıcı (Vercel Cron Job):**
   - Her gece saat 09:00'da Vercel Cron Job tetiklenir (`/api/send-reminders`).
   - Günü veya KM'si yaklaşan araç sahiplerinin FCM token'ına bildirim gönderir (Örn: *"34 ABC 123 plakalı aracınızın muayenesine 5 gün kaldı!"*).

---

## 🗄️ SUPABASE VERİTABANI ŞEMASI (SQL)

```sql
-- 1. Profiles Tablosu (Kullanıcı Detayları)
CREATE TABLE profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  age INT,
  gender TEXT CHECK (gender IN ('Bay', 'Bayan')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Vehicles Tablosu (Garaj & Araçlar)
CREATE TABLE vehicles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  plate TEXT NOT NULL,
  brand TEXT NOT NULL,
  model TEXT NOT NULL,
  year INT,
  current_km INT DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Reminders Tablosu (Hatırlatıcılar & Ajanda)
CREATE TABLE reminders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  vehicle_id UUID REFERENCES vehicles(id) ON DELETE CASCADE,
  type TEXT CHECK (type IN ('muayene', 'kasko', 'sigorta', 'mtv', 'bakim', 'diger')),
  title TEXT NOT NULL,
  target_date DATE,
  target_km INT,
  is_completed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. FCM Tokens Tablosu (Web Push Bildirimleri İçin)
CREATE TABLE fcm_tokens (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```
