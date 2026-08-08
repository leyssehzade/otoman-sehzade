// ================================================================
// OTOMAN - Araç Takip PWA  |  app.js
// ================================================================

const SUPABASE_URL     = "https://steqbfkehyighifaeavq.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_DHglJW9GOwYPrgpqyF0q6A_S11NIuXo";
const VAPID_PUBLIC_KEY = "BH_RHFvS8_EfrJmEHyCdrYz7r9cVYziyUY3lx5r_Td5B16F0p1AgM46L1cN2iEMP5SvhwNKc1czqR3TQ7IXgNhw";

// Supabase yalnızca gerçek URL girildiğinde başlatılır
let sb = null;
try {
  if (window.supabase && SUPABASE_URL && SUPABASE_ANON_KEY) {
    sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
} catch (e) { console.warn("Supabase init error:", e); }

// ── STATE ─────────────────────────────────────────────────────
let currentUser    = null;
let currentProfile = null;
let vehicles       = [];
let reminders      = [];
let expenses       = [];
let expChart       = null;

// ── PENDING VERIFICATION STATE ────────────────────────────────
let pendingVerificationEmail = "";
let pendingProfileData       = null;

// ── LOCAL STORAGE (DATA ONLY — NO PASSWORDS) ──────────────────
function saveLocalData() {
  if (!sb && currentUser) {
    localStorage.setItem(`otoman_vehicles_${currentUser.id}`, JSON.stringify(vehicles));
    localStorage.setItem(`otoman_reminders_${currentUser.id}`, JSON.stringify(reminders));
    localStorage.setItem(`otoman_expenses_${currentUser.id}`, JSON.stringify(expenses));
  }
}

// ── INIT ──────────────────────────────────────────────────────
function initApp() {
  const forgotBtn = document.getElementById("forgotLink");
  if (forgotBtn) {
    forgotBtn.onclick = (e) => {
      e.preventDefault();
      openForgotPassword();
    };
  }

  // OTP input setup
  setupOtpInputs();

  // Masraf tarihi varsayılan
  const d = document.getElementById("expDate");
  if (d) d.value = new Date().toISOString().slice(0, 10);

  // E-postadaki "Reset password" bağlantısına tıklandığında otomatik açılma kontrolü
  if (window.location.hash.includes("type=recovery") || window.location.hash.includes("access_token")) {
    setTimeout(() => {
      document.getElementById("newPasswordInput").value = "";
      document.getElementById("confirmNewPasswordInput").value = "";
      openModal("modalNewPassword");
      showPopup("Lütfen yeni şifrenizi belirleyin.", true);
      history.replaceState(null, "", window.location.pathname + window.location.search);
    }, 600);
  }

  if (sb) {
    sb.auth.getSession().then(({ data: { session } }) => {
      if (session && session.user) {
        // E-posta doğrulanmış mı kontrol et
        if (session.user.email_confirmed_at) {
          currentUser = session.user;
          afterLogin();
        } else {
          // Doğrulanmamış kullanıcı — oturumu kapat ve auth ekranını göster
          sb.auth.signOut();
          showAuth();
        }
      } else {
        showAuth();
      }
    });
    sb.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") {
        currentUser = session?.user || null;
        document.getElementById("newPasswordInput").value = "";
        document.getElementById("confirmNewPasswordInput").value = "";
        openModal("modalNewPassword");
        showPopup("Lütfen yeni şifrenizi belirleyin.", true);
        history.replaceState(null, "", window.location.pathname + window.location.search);
        return;
      }
      if (session && session.user) {
        // E-posta doğrulanmış mı kontrol et
        if (session.user.email_confirmed_at) {
          currentUser = session.user;
          afterLogin();
        }
        // Doğrulanmamışsa hiçbir şey yapma (verify sayfasında kalacak)
      } else {
        currentUser = null;
        currentProfile = null;
        // Verify sayfasındaysa onu gizle
        hideVerifyEmail();
        showAuth();
      }
    });
  } else {
    // Supabase olmadan uygulama çalışamaz
    showAuth();
    showPopup("Supabase bağlantısı kurulamadı. Lütfen internet bağlantınızı kontrol edin.");
  }
}

if (document.readyState === "loading") {
  window.addEventListener("DOMContentLoaded", initApp);
} else {
  initApp();
}

// ── AUTH GÖSTER / GİZLE ───────────────────────────────────────
function showAuth() {
  document.getElementById("authView").style.display = "flex";
  document.getElementById("appView").style.display  = "none";
  document.getElementById("userInfoHeader").style.display = "none";
  const verifyView = document.getElementById("verifyEmailView");
  if (verifyView) verifyView.style.display = "none";
}

function hideVerifyEmail() {
  const verifyView = document.getElementById("verifyEmailView");
  if (verifyView) verifyView.style.display = "none";
}

function showVerifyEmail(email) {
  pendingVerificationEmail = email;
  document.getElementById("authView").style.display = "none";
  document.getElementById("appView").style.display  = "none";
  document.getElementById("userInfoHeader").style.display = "none";

  const verifyView = document.getElementById("verifyEmailView");
  verifyView.style.display = "flex";

  // E-posta adresini göster
  const emailDisplay = document.getElementById("verifyEmailAddress");
  if (emailDisplay) emailDisplay.textContent = email;

  // OTP input alanlarını temizle
  const otpInputs = document.querySelectorAll(".otp-box");
  otpInputs.forEach(input => { input.value = ""; });
  if (otpInputs.length > 0) otpInputs[0].focus();

  // Resend butonunu etkinleştir
  const resendBtn = document.getElementById("btnResendVerification");
  if (resendBtn) {
    resendBtn.disabled = false;
    resendBtn.textContent = "Kodu Tekrar Gönder";
  }
}

async function afterLogin() {
  if (sb) {
    const { data } = await sb.from("profiles").select("*").eq("id", currentUser.id).single();
    if (data) currentProfile = data;
  }
  hideVerifyEmail();
  document.getElementById("authView").style.display = "none";
  document.getElementById("appView").style.display  = "block";
  document.getElementById("userInfoHeader").style.display = "flex";
  if (currentProfile) {
    document.getElementById("userDisplayName").textContent =
      `${currentProfile.first_name} ${currentProfile.last_name}`;
  }
  loadData();
  askNotificationPermission();
  subscribeToPush();
}

async function handleLogout() {
  if (sb) await sb.auth.signOut();
  currentUser = null; currentProfile = null;
  vehicles = []; reminders = []; expenses = [];
  pendingVerificationEmail = "";
  pendingProfileData = null;
  showAuth();
}

// ── AUTH SEKME ─────────────────────────────────────────────────
function showAuthTab(tab) {
  const isLogin = (tab === "login");
  document.getElementById("panelLogin").style.display    = isLogin ? "block" : "none";
  document.getElementById("panelRegister").style.display = isLogin ? "none"  : "block";
  document.getElementById("tabLogin").classList.toggle("active",    isLogin);
  document.getElementById("tabRegister").classList.toggle("active", !isLogin);
}

// ── GİRİŞ ─────────────────────────────────────────────────────
async function handleLogin() {
  const email = document.getElementById("loginEmail").value.trim().toLowerCase();
  const pass  = document.getElementById("loginPassword").value;

  if (!email || !pass) { showPopup("Lütfen e-posta ve şifrenizi giriniz."); return; }

  if (!sb) {
    showPopup("Supabase bağlantısı kurulamadı. Lütfen internet bağlantınızı kontrol edin.");
    return;
  }

  const { data, error } = await sb.auth.signInWithPassword({ email, password: pass });
  if (error) {
    showPopup("E-posta veya şifreniz hatalı.");
    return;
  }

  // E-posta doğrulanmış mı kontrol et
  if (!data.user.email_confirmed_at) {
    // Oturumu kapat — doğrulanmamış kullanıcı giriş yapamaz
    await sb.auth.signOut();
    // Profil verisini sessionStorage'dan oku (varsa)
    const storedProfile = sessionStorage.getItem("otoman_pending_profile");
    if (storedProfile) {
      try { pendingProfileData = JSON.parse(storedProfile); } catch(e) {}
    }
    showPopup("Lütfen giriş yapmadan önce e-posta adresinizi doğrulayın.");
    pendingVerificationEmail = email;
    setTimeout(() => showVerifyEmail(email), 1500);
    return;
  }

  currentUser = data.user;
  afterLogin();
}

// ── KAYIT ─────────────────────────────────────────────────────
async function handleRegister() {
  const firstName = document.getElementById("regFirstName").value.trim();
  const lastName  = document.getElementById("regLastName").value.trim();
  const email     = document.getElementById("regEmail").value.trim().toLowerCase();
  const pass      = document.getElementById("regPassword").value;
  const age       = parseInt(document.getElementById("regAge").value) || 0;
  const gender    = document.getElementById("regGender").value;

  if (!firstName || !lastName || !email || !pass) {
    showPopup("Lütfen ad, soyad, e-posta ve şifre alanlarını doldurun."); return;
  }

  if (pass.length < 8 || !/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(pass)) {
    showPopup("Şifre en az 8 karakter, 1 büyük harf, 1 küçük harf ve 1 rakam içermelidir.");
    return;
  }

  if (!sb) {
    showPopup("Supabase bağlantısı kurulamadı. Lütfen internet bağlantınızı kontrol edin.");
    return;
  }

  const { data, error } = await sb.auth.signUp({
    email, password: pass,
    options: { data: { first_name: firstName, last_name: lastName } }
    // emailRedirectTo is intentionally omitted — we use OTP code flow, not magic link
  });

  // Safe debug — no passwords/tokens logged
  console.log("[OTOMAN] SIGNUP RESULT", {
    hasUser: !!data?.user,
    hasSession: !!data?.session,
    emailConfirmedAt: data?.user?.email_confirmed_at ?? null,
    error: error?.message ?? null
  });

  if (error) {
    if (error.message.includes("email rate limit exceeded") || error.status === 429) {
      // Rate limit — BYPASS YAPMA, sadece hata göster
      showPopup("Çok fazla doğrulama isteği gönderildi. Lütfen bir süre bekleyip tekrar deneyin.");
      return;
    }
    let msg = error.message;
    if (msg.includes("User already registered")) {
      msg = "Bu e-posta adresi ile zaten kayıtlı bir kullanıcı var.";
    }
    showPopup(msg);
    return;
  }

  if (data.user) {
    // Profil verilerini sessionStorage'a kaydet (şifre DEĞİL)
    // Profil, e-posta doğrulamasından SONRA oluşturulacak
    pendingProfileData = {
      id: data.user.id,
      first_name: firstName,
      last_name: lastName,
      email: email,
      age: age,
      gender: gender
    };
    sessionStorage.setItem("otoman_pending_profile", JSON.stringify(pendingProfileData));

    // Kayıt formunu temizle
    document.getElementById("regFirstName").value = "";
    document.getElementById("regLastName").value = "";
    document.getElementById("regEmail").value = "";
    document.getElementById("regPassword").value = "";
    document.getElementById("regAge").value = "";

    // E-posta doğrulama sayfasına yönlendir
    showPopup("Mail adresinize şifre yenileme linki gönderildi.", true);
    setTimeout(() => showVerifyEmail(email), 1500);
  }
}

// ── E-POSTA DOĞRULAMA (OTP) ───────────────────────────────────
function getOtpValue() {
  const inputs = document.querySelectorAll(".otp-box");
  let code = "";
  inputs.forEach(input => { code += input.value; });
  return code;
}

async function handleVerifyEmailOTP() {
  const token = getOtpValue();

  if (!token || token.length !== 6 || !/^\d{6}$/.test(token)) {
    showPopup("Lütfen 6 haneli doğrulama kodunu eksiksiz giriniz.");
    return;
  }

  if (!sb || !pendingVerificationEmail) {
    showPopup("Bir hata oluştu. Lütfen sayfayı yenileyip tekrar deneyin.");
    return;
  }

  const { data, error } = await sb.auth.verifyOtp({
    email: pendingVerificationEmail,
    token: token,
    type: 'email'
  });

  if (error) {
    showPopup("Geçersiz veya süresi dolmuş doğrulama kodu.");
    return;
  }

  if (data.session && data.user) {
    currentUser = data.user;

    // Profili oluştur (e-posta doğrulaması sonrasında)
    if (pendingProfileData) {
      try {
        // Önce profil var mı kontrol et (duplicate önleme)
        const { data: existingProfile } = await sb.from("profiles")
          .select("id").eq("id", currentUser.id).single();

        if (!existingProfile) {
          await sb.from("profiles").insert([{
            id: pendingProfileData.id || currentUser.id,
            first_name: pendingProfileData.first_name,
            last_name: pendingProfileData.last_name,
            email: pendingProfileData.email,
            age: pendingProfileData.age,
            gender: pendingProfileData.gender
          }]);
        }
      } catch (e) {
        console.warn("Profil oluşturma hatası:", e);
      }
      // Temizle
      pendingProfileData = null;
      sessionStorage.removeItem("otoman_pending_profile");
    }

    showPopup("E-posta adresiniz başarıyla doğrulandı!", true);
    setTimeout(() => afterLogin(), 800);
  } else {
    showPopup("Doğrulama başarısız oldu. Lütfen tekrar deneyin.");
  }
}

async function handleResendVerification() {
  if (!sb || !pendingVerificationEmail) {
    showPopup("Bir hata oluştu. Lütfen sayfayı yenileyip tekrar deneyin.");
    return;
  }

  const resendBtn = document.getElementById("btnResendVerification");
  if (resendBtn) {
    resendBtn.disabled = true;
    resendBtn.textContent = "Gönderiliyor...";
  }

  try {
    const { error } = await sb.auth.resend({
      type: 'signup',
      email: pendingVerificationEmail
    });

    if (error) {
      if (error.message.includes("rate") || error.status === 429) {
        showPopup("Çok fazla doğrulama isteği gönderildi. Lütfen bir süre bekleyip tekrar deneyin.");
      } else {
        showPopup(error.message || "Kod gönderilirken bir hata oluştu.");
      }
    } else {
      showPopup("Doğrulama kodu tekrar gönderildi.", true);
    }
  } catch (e) {
    showPopup("Kod gönderilirken bir hata oluştu.");
  }

  // 60 saniye cooldown
  if (resendBtn) {
    let countdown = 60;
    resendBtn.textContent = `Tekrar Gönder (${countdown}s)`;
    const interval = setInterval(() => {
      countdown--;
      if (countdown <= 0) {
        clearInterval(interval);
        resendBtn.disabled = false;
        resendBtn.textContent = "Kodu Tekrar Gönder";
      } else {
        resendBtn.textContent = `Tekrar Gönder (${countdown}s)`;
      }
    }, 1000);
  }
}

function handleBackToLogin() {
  pendingVerificationEmail = "";
  pendingProfileData = null;
  sessionStorage.removeItem("otoman_pending_profile");
  showAuth();
  showAuthTab("login");
}

// ── OTP INPUT NAVIGATION ──────────────────────────────────────
function setupOtpInputs() {
  const inputs = document.querySelectorAll(".otp-box");
  inputs.forEach((input, index) => {
    input.addEventListener("input", (e) => {
      // Sadece rakam kabul et
      e.target.value = e.target.value.replace(/[^0-9]/g, "");
      if (e.target.value && index < inputs.length - 1) {
        inputs[index + 1].focus();
      }
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Backspace" && !e.target.value && index > 0) {
        inputs[index - 1].focus();
      }
    });
    input.addEventListener("paste", (e) => {
      e.preventDefault();
      const pastedData = (e.clipboardData || window.clipboardData).getData("text").replace(/[^0-9]/g, "");
      for (let i = 0; i < Math.min(pastedData.length, inputs.length); i++) {
        inputs[i].value = pastedData[i];
      }
      const focusIdx = Math.min(pastedData.length, inputs.length - 1);
      inputs[focusIdx].focus();
    });
  });
}

// ── ŞİFREMİ UNUTTUM (LİNK İLE SIFIRLAMA) ──────────────────────
let resetEmail = "";

function openForgotPassword() {
  document.getElementById("forgotEmailInput").value = "";
  openModal("modalForgotEmail");
}

async function handleSendOTP() {
  const email = document.getElementById("forgotEmailInput").value.trim().toLowerCase();
  if (!email) { showPopup("Lütfen e-posta adresinizi girin."); return; }
  resetEmail = email;

  if (!sb) {
    showPopup("Supabase bağlantısı kurulamadı.");
    return;
  }

  // Supabase üzerinden şifre sıfırlama e-postası gönder (bağlantı içerir)
  try {
    const { error } = await sb.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + window.location.pathname
    });
    closeModal("modalForgotEmail");
    if (error) {
      if (error.status === 429 || (error.message && error.message.includes("rate"))) {
        showPopup("Çok fazla istek gönderildi. Lütfen bir süre bekleyip tekrar deneyin.");
        return;
      }
      showPopup(error.message || "E-posta gönderilemedi.");
      return;
    }
  } catch (err) {
    closeModal("modalForgotEmail");
    console.warn("Supabase e-posta gönderme hatası:", err);
    showPopup("E-posta gönderilirken bir hata oluştu.");
    return;
  }

  showPopup("Mail adresinize şifre yenileme linki gönderildi.", true);
}

async function handleSetNewPassword() {
  if (!sb) { showPopup("Bağlantı kurulamadı."); return; }

  const np  = document.getElementById("newPasswordInput").value;
  const cnp = document.getElementById("confirmNewPasswordInput").value;

  if (!np || !cnp) { showPopup("Lütfen yeni şifreyi ve tekrarını giriniz."); return; }
  if (np !== cnp)  { showPopup("Şifreler eşleşmiyor."); return; }

  const pwRx = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
  if (!pwRx.test(np)) {
    showPopup("Şifre en az 8 karakter, 1 büyük harf, 1 küçük harf ve 1 rakam içermelidir.");
    return;
  }

  // Supabase session varsa (recovery token ile) direkt güncelle
  if (sb) {
    try {
      const { error } = await sb.auth.updateUser({ password: np });
      if (error) {
        showPopup("Şifre güncellenirken bir hata oluştu: " + error.message);
        return;
      }
    } catch (e) {
      showPopup("Şifre güncellenirken bir hata oluştu.");
      return;
    }
  }

  closeModal("modalNewPassword");
  showPopup("Şifreniz başarıyla güncellendi! Yeni şifrenizle giriş yapabilirsiniz.", true);

  // Oturumu kapat ve login'e yönlendir
  if (sb) await sb.auth.signOut();
  currentUser = null;

  if (resetEmail) {
    document.getElementById("loginEmail").value = resetEmail;
  }
  document.getElementById("loginPassword").value = "";
  setTimeout(() => {
    showAuth();
    showAuthTab("login");
  }, 1200);
}

// ── POPUP ─────────────────────────────────────────────────────
function showPopup(msg, isSuccess = false) {
  const popup = document.getElementById("centerPopup");
  document.getElementById("popupIcon").textContent    = isSuccess ? "✅" : "❌";
  document.getElementById("popupMessage").textContent = msg;
  popup.classList.remove("is-success");
  if (isSuccess) popup.classList.add("is-success");
  popup.classList.add("show");
}

function closeCenterPopup() {
  document.getElementById("centerPopup").classList.remove("show");
}

// ── MODAL ─────────────────────────────────────────────────────
function openModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add("show");
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove("show");
}

// ── ANA SEKME GEÇİŞ ───────────────────────────────────────────
function switchMainTab(tab) {
  ["garage","reminders","expenses"].forEach(t => {
    document.getElementById(t + "Panel").style.display = "none";
    document.getElementById("tab" + t.charAt(0).toUpperCase() + t.slice(1)).classList.remove("active");
  });
  document.getElementById(tab + "Panel").style.display = "block";
  document.getElementById("tab" + tab.charAt(0).toUpperCase() + tab.slice(1)).classList.add("active");
  if (tab === "expenses") renderExpenseChart();
}

// ── VERİ YÜKLE ────────────────────────────────────────────────
async function loadData() {
  if (sb && currentUser) {
    const { data: v } = await sb.from("vehicles").select("*").eq("user_id", currentUser.id).order("created_at");
    const { data: r } = await sb.from("reminders").select("*").order("created_at");
    const { data: e } = await sb.from("expenses").select("*").order("date", { ascending: false });
    vehicles  = v || [];
    reminders = r || [];
    expenses  = e || [];
  } else if (currentUser) {
    const storedV = localStorage.getItem(`otoman_vehicles_${currentUser.id}`);
    const storedR = localStorage.getItem(`otoman_reminders_${currentUser.id}`);
    const storedE = localStorage.getItem(`otoman_expenses_${currentUser.id}`);

    vehicles  = storedV ? JSON.parse(storedV) : [];
    reminders = storedR ? JSON.parse(storedR) : [];
    expenses  = storedE ? JSON.parse(storedE) : [];
  }
  renderVehicles();
  renderReminders();
  renderExpenses();
}

// ── ARAÇLAR ───────────────────────────────────────────────────
function renderVehicles() {
  const grid = document.getElementById("vehicleGrid");
  grid.innerHTML = "";
  if (!vehicles.length) {
    grid.innerHTML = emptyCard('Henüz araç eklemediniz. "+ Yeni Araç Ekle" butonunu kullanın.');
    return;
  }
  vehicles.forEach(v => {
    const card = document.createElement("div");
    card.className = "vehicle-card glass";
    card.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px;">
        <div class="plate-badge">🇹🇷 ${esc(v.plate)}</div>
        <div style="display:flex;gap:6px;">
          <button class="btn-secondary" style="padding:5px 10px;font-size:0.8rem;" onclick="openVehicleModal('${v.id}')">✏️</button>
          <button class="btn-danger" onclick="deleteVehicle('${v.id}')">🗑️</button>
        </div>
      </div>
      <div style="font-size:1.2rem;font-weight:700;margin-bottom:3px;">${esc(v.brand)} ${esc(v.model)}</div>
      <div style="color:var(--text-muted);font-size:0.88rem;margin-bottom:14px;">Model Yılı: ${v.year}</div>
      <div style="display:flex;justify-content:space-between;align-items:center;border-top:1px solid var(--glass-border);padding-top:12px;">
        <div style="font-size:1.05rem;font-weight:700;color:var(--secondary);">⚡ ${v.current_km.toLocaleString("tr-TR")} KM</div>
        <button class="btn-primary" style="padding:7px 14px;font-size:0.82rem;" onclick="openUpdateKm('${v.id}')">KM Güncelle</button>
      </div>`;
    grid.appendChild(card);
  });
}

function openVehicleModal(id = null) {
  document.getElementById("vehicleEditId").value = id || "";
  document.getElementById("vehicleModalTitle").textContent = id ? "✏️ Araç Düzenle" : "🚗 Araç Ekle";
  const v = id ? vehicles.find(x => x.id === id) : {};
  document.getElementById("vehPlate").value  = v?.plate  || "";
  document.getElementById("vehBrand").value  = v?.brand  || "";
  document.getElementById("vehModel").value  = v?.model  || "";
  document.getElementById("vehYear").value   = v?.year   || "";
  document.getElementById("vehKm").value     = v?.current_km || "";
  openModal("modalVehicle");
}

async function handleSaveVehicle() {
  const id    = document.getElementById("vehicleEditId").value;
  const plate = document.getElementById("vehPlate").value.trim().toUpperCase();
  const brand = document.getElementById("vehBrand").value.trim();
  const model = document.getElementById("vehModel").value.trim();
  const year  = parseInt(document.getElementById("vehYear").value)  || 0;
  const km    = parseInt(document.getElementById("vehKm").value)    || 0;
  if (!plate || !brand || !model) { showPopup("Lütfen zorunlu alanları doldurun."); return; }

  if (id) {
    if (sb) await sb.from("vehicles").update({plate,brand,model,year,current_km:km}).eq("id",id);
    const i = vehicles.findIndex(v => v.id === id);
    if (i !== -1) vehicles[i] = {...vehicles[i], plate, brand, model, year, current_km: km};
  } else {
    const nv = { id:"v-"+Date.now(), user_id: currentUser?.id, plate, brand, model, year, current_km: km };
    if (sb && currentUser) {
      const { data } = await sb.from("vehicles").insert([{user_id:currentUser.id,plate,brand,model,year,current_km:km}]).select().single();
      if (data) nv.id = data.id;
    }
    vehicles.push(nv);
  }
  saveLocalData();
  closeModal("modalVehicle");
  renderVehicles();
  showPopup("Araç bilgileri kaydedildi!", true);
}

async function deleteVehicle(id) {
  if (!confirm("Bu aracı silmek istediğinize emin misiniz?")) return;
  if (sb) await sb.from("vehicles").delete().eq("id", id);
  vehicles   = vehicles.filter(v => v.id !== id);
  reminders  = reminders.filter(r => r.vehicle_id !== id);
  saveLocalData();
  renderVehicles();
  renderReminders();
}

function openUpdateKm(id) {
  const v = vehicles.find(x => x.id === id);
  document.getElementById("updateKmVehicleId").value = id;
  document.getElementById("newKmInput").value = v?.current_km || 0;
  openModal("modalUpdateKm");
}

async function handleUpdateKm() {
  const id  = document.getElementById("updateKmVehicleId").value;
  const km  = parseInt(document.getElementById("newKmInput").value) || 0;
  if (sb) await sb.from("vehicles").update({current_km: km}).eq("id", id);
  const v = vehicles.find(x => x.id === id);
  if (v) v.current_km = km;
  saveLocalData();
  closeModal("modalUpdateKm");
  renderVehicles();
  renderReminders();
  showPopup("Kilometre güncellendi!", true);
}

// ── HATIRLATICILAR ────────────────────────────────────────────
function renderReminders() {
  const grid = document.getElementById("remindersGrid");
  grid.innerHTML = "";
  const today = new Date();
  if (!reminders.length) {
    grid.innerHTML = emptyCard('Aktif hatırlatıcınız yok. "+ Yeni Ekle" butonundan ekleyebilirsiniz.');
    return;
  }
  reminders.forEach(r => {
    const v = vehicles.find(x => x.id === r.vehicle_id);
    const plate = v?.plate || "—";
    let statusClass = "status-ok", statusLabel = "✅ Normal", detail = "";

    if (r.target_date) {
      const [yy, mm, dd] = r.target_date.split("-").map(Number);
      const target = new Date(yy, mm - 1, dd);
      const diff = Math.ceil((target - today) / 86400000);
      detail = `${r.target_date} · ${diff > 0 ? diff + " gün kaldı" : "⚠️ Süresi Doldu!"}`;
      if (diff <= 0)  { statusClass = "status-danger"; statusLabel = "🚨 Süresi Doldu!"; }
      else if (diff <= 7) { statusClass = "status-warn"; statusLabel = "⚠️ Yaklaşıyor!"; }
    } else if (r.target_km) {
      const diff = r.target_km - (v?.current_km || 0);
      detail = `Hedef: ${r.target_km.toLocaleString("tr-TR")} KM · ${diff > 0 ? diff.toLocaleString("tr-TR") + " KM kaldı" : "KM Doldu!"}`;
      if (diff <= 0)   { statusClass = "status-danger"; statusLabel = "🚨 KM Doldu!"; }
      else if (diff <= 500) { statusClass = "status-warn"; statusLabel = "⚠️ Az Kaldı!"; }
    }

    const card = document.createElement("div");
    card.className = `reminder-card glass ${statusClass}`;
    card.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <span style="font-size:0.77rem;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--secondary);">${esc(r.type)} · ${esc(plate)}</span>
        <span style="font-size:0.77rem;font-weight:700;background:rgba(255,255,255,0.1);padding:2px 8px;border-radius:6px;">${statusLabel}</span>
      </div>
      <div style="font-size:1.05rem;font-weight:700;margin-bottom:5px;">${esc(r.title)}</div>
      <div style="font-size:0.85rem;color:var(--text-muted);margin-bottom:14px;">${detail}</div>
      <button class="btn-danger" style="width:100%;" onclick="deleteReminder('${r.id}')">Tamamlandı / Sil</button>`;
    grid.appendChild(card);
  });
}

function openReminderModal() {
  if (!vehicles.length) { showPopup("Önce Garaj sayfasından araç eklemelisiniz."); return; }
  const sel = document.getElementById("remVehicleSelect");
  sel.innerHTML = vehicles.map(v => `<option value="${v.id}">${esc(v.plate)} – ${esc(v.brand)} ${esc(v.model)}</option>`).join("");
  document.getElementById("remTitle").value = "";
  document.getElementById("remTargetDate").value = "";
  document.getElementById("remTargetKm").value = "";
  toggleReminderFields();
  openModal("modalReminder");
}

function toggleReminderFields() {
  const isKm = document.getElementById("remType").value === "bakim";
  document.getElementById("remDateField").style.display = isKm ? "none"  : "block";
  document.getElementById("remKmField").style.display   = isKm ? "block" : "none";
}

async function handleSaveReminder() {
  const vehicle_id  = document.getElementById("remVehicleSelect").value;
  const type        = document.getElementById("remType").value;
  const title       = document.getElementById("remTitle").value.trim();
  const target_date = type !== "bakim" ? (document.getElementById("remTargetDate").value || null) : null;
  const target_km   = type === "bakim"  ? (parseInt(document.getElementById("remTargetKm").value) || null) : null;
  if (!title) { showPopup("Başlık alanını doldurun."); return; }

  const nr = { vehicle_id, type, title, target_date, target_km, is_completed:false };
  if (sb) {
    const { data, error } = await sb.from("reminders").insert([nr]).select().single();
    if (error) { showPopup("Hatırlatıcı kaydedilemedi: " + error.message); return; }
    nr.id = data.id;
  } else {
    nr.id = "r-" + Date.now();
  }
  reminders.push(nr);
  saveLocalData();
  closeModal("modalReminder");
  renderReminders();
  showPopup("Hatırlatıcı eklendi!", true);
}

async function deleteReminder(id) {
  if (sb) await sb.from("reminders").delete().eq("id", id);
  reminders = reminders.filter(r => r.id !== id);
  saveLocalData();
  renderReminders();
}

// ── MASRAFLAR ─────────────────────────────────────────────────
function renderExpenses() {
  const list = document.getElementById("expensesList");
  list.innerHTML = "";
  if (!expenses.length) {
    list.innerHTML = emptyCard("Henüz masraf kaydı yok.");
    return;
  }
  expenses.forEach(e => {
    const v = vehicles.find(x => x.id === e.vehicle_id);
    const el = document.createElement("div");
    el.className = "glass";
    el.style.cssText = "padding:16px 20px;border-radius:var(--radius-md);display:flex;justify-content:space-between;align-items:center;";
    el.innerHTML = `
      <div>
        <div style="font-weight:700;">${esc(e.category)} <span style="font-size:0.8rem;color:var(--text-muted);">${esc(v?.plate || "")}</span></div>
        <div style="font-size:0.82rem;color:var(--text-muted);">${e.date} · ${(e.km||0).toLocaleString("tr-TR")} KM</div>
      </div>
      <div style="font-size:1.15rem;font-weight:800;color:var(--secondary);">₺${parseFloat(e.amount).toLocaleString("tr-TR")}</div>`;
    list.appendChild(el);
  });
}

function openExpenseModal() {
  if (!vehicles.length) { showPopup("Önce Garaj sayfasından araç eklemelisiniz."); return; }
  const sel = document.getElementById("expVehicleSelect");
  sel.innerHTML = vehicles.map(v => `<option value="${v.id}">${esc(v.plate)} – ${esc(v.brand)} ${esc(v.model)}</option>`).join("");
  document.getElementById("expAmount").value = "";
  document.getElementById("expKm").value = "";
  openModal("modalExpense");
}

async function handleSaveExpense() {
  const vehicle_id = document.getElementById("expVehicleSelect").value;
  const category   = document.getElementById("expCategory").value;
  const amount     = parseFloat(document.getElementById("expAmount").value) || 0;
  const date       = document.getElementById("expDate").value;
  const km         = parseInt(document.getElementById("expKm").value) || 0;
  if (!amount || !date) { showPopup("Tutar ve tarih zorunludur."); return; }

  const ne = { vehicle_id, category, amount, date, km };
  if (sb) {
    const { data, error } = await sb.from("expenses").insert([ne]).select().single();
    if (error) { showPopup("Masraf kaydedilemedi: " + error.message); return; }
    ne.id = data.id;
  } else {
    ne.id = "e-" + Date.now();
  }
  expenses.push(ne);
  saveLocalData();
  closeModal("modalExpense");
  renderExpenses();
  renderExpenseChart();
  showPopup("Masraf eklendi!", true);
}

function renderExpenseChart() {
  const ctx = document.getElementById("expenseChart");
  if (!ctx) return;
  const cats = ["Yakıt","Bakım","Sigorta","Yıkama","Diğer"];
  const vals = cats.map(c => expenses.filter(e => e.category === c).reduce((s,e) => s + e.amount, 0));
  if (expChart) expChart.destroy();
  expChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: cats,
      datasets: [{ label:"Toplam (TL)", data: vals, borderRadius: 8,
        backgroundColor: ["rgba(99,102,241,0.8)","rgba(6,182,212,0.8)","rgba(245,158,11,0.8)","rgba(16,185,129,0.8)","rgba(139,92,246,0.8)"] }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { labels: { color:"#f8fafc", font: { family:"Plus Jakarta Sans" } } } },
      scales: {
        x: { ticks:{ color:"#94a3b8" }, grid:{ color:"rgba(255,255,255,0.05)" } },
        y: { ticks:{ color:"#94a3b8" }, grid:{ color:"rgba(255,255,255,0.05)" } }
      }
    }
  });
}

// ── BİLDİRİM ─────────────────────────────────────────────────
async function askNotificationPermission() {
  if ("Notification" in window) {
    const p = await Notification.requestPermission();
    if (p === "granted") console.log("Bildirim izni verildi.");
  }
}

async function subscribeToPush() {
  if (!sb || !currentUser) return;
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
  if (Notification.permission !== "granted") return;
  if (!VAPID_PUBLIC_KEY || VAPID_PUBLIC_KEY.startsWith("YOUR_")) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const existing = await reg.pushManager.getSubscription();
    const sub = existing || await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
    });
    await sb.from("fcm_tokens").upsert(
      { user_id: currentUser.id, token: JSON.stringify(sub) },
      { onConflict: "token" }
    );
  } catch (e) {
    console.warn("Push aboneliği kurulamadı:", e);
  }
}

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

async function sendTestNotification() {
  if (!("Notification" in window)) {
    showPopup("Bu cihaz yerel bildirimleri desteklemiyor.");
    return;
  }
  
  if (Notification.permission !== "granted") {
    const perm = await Notification.requestPermission();
    if (perm !== "granted") {
      showPopup("Bildirim izni reddedildi. Lütfen tarayıcı ayarlarından izin verin.");
      return;
    }
  }

  if (navigator.serviceWorker && navigator.serviceWorker.ready) {
    const reg = await navigator.serviceWorker.ready;
    reg.showNotification("🚗 OTOMAN Araç Hatırlatıcısı", {
      body: "34 OTO 01 plakalı aracınızın Trafik Sigortası süresine 3 gün kaldı!",
      icon: "https://cdn-icons-png.flaticon.com/512/3202/3202926.png",
      badge: "https://cdn-icons-png.flaticon.com/512/3202/3202926.png",
      vibrate: [200, 100, 200],
      tag: "test-notification"
    });
  } else {
    new Notification("🚗 OTOMAN Araç Hatırlatıcısı", {
      body: "34 OTO 01 plakalı aracınızın Trafik Sigortası süresine 3 gün kaldı!",
      icon: "https://cdn-icons-png.flaticon.com/512/3202/3202926.png"
    });
  }
  showPopup("Test bildirimi telefona/cihaza gönderildi!", true);
}

// ── YARDIMCI ─────────────────────────────────────────────────
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));
}

function emptyCard(msg) {
  return `<div class="glass" style="padding:28px;text-align:center;grid-column:1/-1;border-radius:var(--radius-lg);color:var(--text-muted);">${msg}</div>`;
}
