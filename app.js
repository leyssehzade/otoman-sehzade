// ================================================================
// OTOMAN - Araç Takip PWA  |  app.js
// ================================================================

const SUPABASE_URL     = "https://steqbfkehyighifaeavq.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_DHglJW9GOwYPrgpqyF0q6A_S11NIuXo";

// Supabase yalnızca gerçek URL girildiğinde başlatılır
let sb = null;
try {
  if (window.supabase && SUPABASE_URL && SUPABASE_ANON_KEY) {
    sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
} catch (e) { console.warn("Supabase demo mode:", e); }

// ── STATE ─────────────────────────────────────────────────────
let currentUser    = null;
let currentProfile = null;
let vehicles       = [];
let reminders      = [];
let expenses       = [];
let expChart       = null;

// ── LOCAL STORAGE YARDIMCILARI ─────────────────────────────────
function getLocalUsers() {
  const users = localStorage.getItem("otoman_users");
  if (!users) {
    const defaultUsers = [{
      id: "demo",
      email: "demo@otoman.com",
      password: "Demo1234",
      first_name: "Demo",
      last_name: "Sürücü",
      age: 30,
      gender: "Bay"
    }];
    localStorage.setItem("otoman_users", JSON.stringify(defaultUsers));
    return defaultUsers;
  }
  try {
    return JSON.parse(users);
  } catch (e) {
    return [];
  }
}

function saveLocalUser(user) {
  const users = getLocalUsers();
  users.push(user);
  localStorage.setItem("otoman_users", JSON.stringify(users));
}

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
      if (session) { currentUser = session.user; afterLogin(); }
      else showAuth();
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
      if (session) { currentUser = session.user; afterLogin(); }
      else { currentUser = null; showAuth(); }
    });
  } else {
    // Otomatik oturum açma (Local Mode)
    const savedSession = localStorage.getItem("otoman_active_session");
    if (savedSession) {
      try {
        const { user, profile } = JSON.parse(savedSession);
        currentUser = user;
        currentProfile = profile;
        afterLogin();
        return;
      } catch (e) {}
    }
    showAuth();
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
}

async function afterLogin() {
  if (sb) {
    const { data } = await sb.from("profiles").select("*").eq("id", currentUser.id).single();
    if (data) currentProfile = data;
  }
  document.getElementById("authView").style.display = "none";
  document.getElementById("appView").style.display  = "block";
  document.getElementById("userInfoHeader").style.display = "flex";
  if (currentProfile) {
    document.getElementById("userDisplayName").textContent =
      `${currentProfile.first_name} ${currentProfile.last_name}`;
  }
  loadData();
  askNotificationPermission();
}

async function handleLogout() {
  if (sb) await sb.auth.signOut();
  localStorage.removeItem("otoman_active_session");
  currentUser = null; currentProfile = null;
  vehicles = []; reminders = []; expenses = [];
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

  if (sb) {
    const { data, error } = await sb.auth.signInWithPassword({ email, password: pass });
    if (error) {
      // Yerel kullanıcı kontrolü (Fallback)
      const users = getLocalUsers();
      const user = users.find(u => u.email.toLowerCase() === email && u.password === pass);
      if (user) {
        currentUser    = { id: user.id, email: user.email };
        currentProfile = { first_name: user.first_name, last_name: user.last_name, age: user.age, gender: user.gender };
        localStorage.setItem("otoman_active_session", JSON.stringify({ user: currentUser, profile: currentProfile }));
        afterLogin();
        return;
      }
      showPopup("E-posta veya şifreniz hatalı");
      return;
    }
    currentUser = data.user;
    afterLogin();
  } else {
    // Yerel Mod Giriş
    const users = getLocalUsers();
    const user = users.find(u => u.email.toLowerCase() === email && u.password === pass);
    if (user) {
      currentUser    = { id: user.id, email: user.email };
      currentProfile = { first_name: user.first_name, last_name: user.last_name, age: user.age, gender: user.gender };
      localStorage.setItem("otoman_active_session", JSON.stringify({ user: currentUser, profile: currentProfile }));
      afterLogin();
    } else {
      showPopup("E-posta veya şifreniz hatalı");
    }
  }
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

  if (pass.length < 4) {
    showPopup("Şifre en az 4 karakter olmalıdır.");
    return;
  }

  if (sb) {
    const { data, error } = await sb.auth.signUp({
      email, password: pass,
      options: { data: { first_name: firstName, last_name: lastName } }
    });
    if (error) {
      if (error.message.includes("email rate limit exceeded") || error.status === 429) {
        // Limit aşıldığında yerel modda kaydet (Kullanıcı engellenmesin)
        const newUser = { id: "usr_" + Date.now(), email, password: pass, first_name: firstName, last_name: lastName, age, gender };
        saveLocalUser(newUser);

        document.getElementById("loginEmail").value = email;
        document.getElementById("loginPassword").value = pass;
        showPopup("Kayıt başarılı! Giriş ekranına yönlendiriliyorsunuz.", true);

        document.getElementById("regFirstName").value = "";
        document.getElementById("regLastName").value = "";
        document.getElementById("regEmail").value = "";
        document.getElementById("regPassword").value = "";
        document.getElementById("regAge").value = "";

        setTimeout(() => showAuthTab("login"), 1200);
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
      await sb.from("profiles").insert([{
        id: data.user.id, first_name: firstName, last_name: lastName,
        email, age, gender
      }]).catch(console.error);

      // Supabase kaydı başarılı → yerel depoya da kaydet (şifre sıfırlama için)
      const existingLocal = getLocalUsers().find(u => u.email.toLowerCase() === email);
      if (!existingLocal) {
        saveLocalUser({ id: data.user.id, email, password: pass, first_name: firstName, last_name: lastName, age, gender });
      }

      // Kayıt başarılı -> Giriş sekmesine yönlendir
      document.getElementById("loginEmail").value = email;
      document.getElementById("loginPassword").value = pass;
      showPopup("Kayıt başarılı! Giriş ekranına yönlendiriliyorsunuz.", true);

      // Kayıt formunu temizle
      document.getElementById("regFirstName").value = "";
      document.getElementById("regLastName").value = "";
      document.getElementById("regEmail").value = "";
      document.getElementById("regPassword").value = "";
      document.getElementById("regAge").value = "";

      setTimeout(() => showAuthTab("login"), 1200);
    }
  } else {
    // Yerel Mod Kayıt
    const users = getLocalUsers();
    const existing = users.find(u => u.email.toLowerCase() === email);
    if (existing) {
      showPopup("Bu e-posta adresi ile zaten kayıtlı bir hesap var.");
      return;
    }

    const newUser = {
      id: "usr_" + Date.now(),
      email,
      password: pass,
      first_name: firstName,
      last_name: lastName,
      age,
      gender
    };
    saveLocalUser(newUser);

    // Kayıt başarılı -> Giriş alanlarını doldur ve Giriş sekmesine yönlendir
    document.getElementById("loginEmail").value = email;
    document.getElementById("loginPassword").value = pass;
    showPopup("Kayıt başarılı! Giriş ekranına yönlendiriliyorsunuz.", true);

    // Kayıt formunu temizle
    document.getElementById("regFirstName").value = "";
    document.getElementById("regLastName").value = "";
    document.getElementById("regEmail").value = "";
    document.getElementById("regPassword").value = "";
    document.getElementById("regAge").value = "";

    setTimeout(() => showAuthTab("login"), 1200);
  }
}

// ── ŞİFREMİ UNUTTUM (OTP DOĞRULAMA) ───────────────────────────
let resetEmail = "";

function openForgotPassword() {
  document.getElementById("forgotEmailInput").value = "";
  openModal("modalForgotEmail");
}

async function handleSendOTP() {
  const email = document.getElementById("forgotEmailInput").value.trim().toLowerCase();
  if (!email) { showPopup("Lütfen e-posta adresinizi girin."); return; }
  resetEmail = email;

  // Önce yerel kullanıcılarda ara
  const localUsers = getLocalUsers();
  const localUser  = localUsers.find(u => u.email.toLowerCase() === email);

  let userExists = !!localUser;

  if (!userExists && sb) {
    // Supabase'de bu e-posta var mı? Yanlış şifreyle deneyerek kontrol et
    const { error: loginErr } = await sb.auth.signInWithPassword({ email, password: "__check_only__" });
    userExists = loginErr?.message?.includes("Invalid login credentials") ||
                 loginErr?.message?.includes("invalid_credentials") ||
                 loginErr?.status === 400;
    if (userExists) {
      // Supabase kullanıcısını yerel depoya ekle (şifresiz, sonra güncellenecek)
      saveLocalUser({ id: "sb_" + Date.now(), email, password: "__sb__", first_name: "", last_name: "", age: 0, gender: "" });
    }
  }

  if (!userExists) {
    showPopup("Bu e-posta adresiyle kayıtlı hesap bulunamadı.");
    return;
  }

  // Supabase üzerinden şifre sıfırlama e-postası gönder
  if (sb) {
    try {
      await sb.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + window.location.pathname
      });
    } catch (err) {
      console.warn("Supabase e-posta gönderme hatası:", err);
    }
  }

  // Doğrulama kodlu modal'a yönlendir (Yeni şifre ekranına değil)
  closeModal("modalForgotEmail");
  closeModal("modalNewPassword");
  document.getElementById("otpCodeInput").value = "";
  openModal("modalOTP");
  showPopup("Doğrulama kodu e-posta adresinize gönderildi.", true);
}

async function handleVerifyOTP() {
  const code = document.getElementById("otpCodeInput").value.trim();

  if (!code) {
    showPopup("Lütfen e-postanıza gönderilen doğrulama kodunu giriniz.");
    return;
  }

  if (sb && resetEmail) {
    const { data, error } = await sb.auth.verifyOtp({
      email: resetEmail,
      token: code,
      type: 'recovery'
    });
    if (!error && (data?.session || data?.user)) {
      if (data?.session) currentUser = data.session.user;

      // Kod başarıyla doğrulandı -> OTP ekranını kapat ve Yeni Şifre ekranını aç
      closeModal("modalOTP");
      document.getElementById("newPasswordInput").value = "";
      document.getElementById("confirmNewPasswordInput").value = "";
      openModal("modalNewPassword");
      showPopup("Kod başarıyla doğrulandı. Yeni şifrenizi belirleyin.", true);
      return;
    }
  }

  showPopup("Girdiğiniz doğrulama kodu hatalı veya süresi dolmuş.");
}

async function handleSetNewPassword() {
  const np  = document.getElementById("newPasswordInput").value;
  const cnp = document.getElementById("confirmNewPasswordInput").value;

  if (!np || !cnp) { showPopup("Lütfen yeni şifreyi ve tekrarını giriniz."); return; }
  if (np !== cnp)  { showPopup("Şifreler eşleşmiyor."); return; }

  const pwRx = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
  if (!pwRx.test(np)) {
    showPopup("Şifre en az 8 karakter, 1 büyük harf, 1 küçük harf ve 1 rakam içermelidir.");
    return;
  }

  const emailToUpdate = resetEmail || document.getElementById("loginEmail").value.trim().toLowerCase();

  // Yerel şifreyi güncelle
  if (emailToUpdate) {
    const users = getLocalUsers();
    const idx = users.findIndex(u => u.email.toLowerCase() === emailToUpdate);
    if (idx !== -1) {
      const oldPass = users[idx].password;
      users[idx].password = np;
      localStorage.setItem("otoman_users", JSON.stringify(users));

      // Supabase'de de güncelle: eski şifreyle giriş yap → session al → şifreyi değiştir
      if (sb && oldPass && oldPass !== "__sb__") {
        const { data: signInData } = await sb.auth.signInWithPassword({ email: emailToUpdate, password: oldPass });
        if (signInData?.session) {
          await sb.auth.updateUser({ password: np }).catch(() => {});
        }
      } else if (sb) {
        // Session varsa direkt güncelle (recovery token ile gelen durum)
        await sb.auth.updateUser({ password: np }).catch(() => {});
      }
    } else {
      // Yerel depoda yok ama Supabase session varsa direkt güncelle
      if (sb) await sb.auth.updateUser({ password: np }).catch(() => {});
    }
  }

  closeModal("modalNewPassword");
  showPopup("Şifreniz başarıyla güncellendi! Yeni şifrenizle giriş yapabilirsiniz.", true);

  if (emailToUpdate) {
    document.getElementById("loginEmail").value = emailToUpdate;
  }
  document.getElementById("loginPassword").value = "";
  setTimeout(() => showAuthTab("login"), 1200);
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
    const { data: v } = await sb.from("vehicles").select("*").eq("user_id", currentUser.id);
    const { data: r } = await sb.from("reminders").select("*");
    vehicles  = v || [];
    reminders = r || [];
  } else if (currentUser) {
    const storedV = localStorage.getItem(`otoman_vehicles_${currentUser.id}`);
    const storedR = localStorage.getItem(`otoman_reminders_${currentUser.id}`);
    const storedE = localStorage.getItem(`otoman_expenses_${currentUser.id}`);

    if (storedV) {
      vehicles = JSON.parse(storedV);
    } else if (currentUser.id === "demo") {
      vehicles = [
        { id:"v1", plate:"34 OTO 01", brand:"Volkswagen", model:"Golf",  year:2021, current_km:45000 },
        { id:"v2", plate:"06 OTO 02", brand:"BMW",        model:"320i",  year:2019, current_km:98500 }
      ];
      saveLocalData();
    } else {
      vehicles = [];
    }

    if (storedR) {
      reminders = JSON.parse(storedR);
    } else if (currentUser.id === "demo") {
      reminders = [
        { id:"r1", vehicle_id:"v1", type:"muayene", title:"Araç Muayenesi",    target_date: dayOffset(5),   is_completed:false },
        { id:"r2", vehicle_id:"v1", type:"sigorta", title:"Trafik Sigortası",  target_date: dayOffset(3),   is_completed:false },
        { id:"r3", vehicle_id:"v2", type:"bakim",   title:"Yağ Değişimi",      target_km:100000,            is_completed:false }
      ];
      saveLocalData();
    } else {
      reminders = [];
    }

    if (storedE) {
      expenses = JSON.parse(storedE);
    } else {
      expenses = [];
    }
  }
  renderVehicles();
  renderReminders();
  renderExpenses();
}

function dayOffset(n) {
  const d = new Date(); d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
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
        <div class="plate-badge">🇹🇷 ${v.plate}</div>
        <div style="display:flex;gap:6px;">
          <button class="btn-secondary" style="padding:5px 10px;font-size:0.8rem;" onclick="openVehicleModal('${v.id}')">✏️</button>
          <button class="btn-danger" onclick="deleteVehicle('${v.id}')">🗑️</button>
        </div>
      </div>
      <div style="font-size:1.2rem;font-weight:700;margin-bottom:3px;">${v.brand} ${v.model}</div>
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
    const nv = { id:"v-"+Date.now(), user_id: currentUser?.id || "demo", plate, brand, model, year, current_km: km };
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
      const diff = Math.ceil((new Date(r.target_date) - today) / 86400000);
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
        <span style="font-size:0.77rem;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--secondary);">${r.type} · ${plate}</span>
        <span style="font-size:0.77rem;font-weight:700;background:rgba(255,255,255,0.1);padding:2px 8px;border-radius:6px;">${statusLabel}</span>
      </div>
      <div style="font-size:1.05rem;font-weight:700;margin-bottom:5px;">${r.title}</div>
      <div style="font-size:0.85rem;color:var(--text-muted);margin-bottom:14px;">${detail}</div>
      <button class="btn-danger" style="width:100%;" onclick="deleteReminder('${r.id}')">Tamamlandı / Sil</button>`;
    grid.appendChild(card);
  });
}

function openReminderModal() {
  if (!vehicles.length) { showPopup("Önce Garaj sayfasından araç eklemelisiniz."); return; }
  const sel = document.getElementById("remVehicleSelect");
  sel.innerHTML = vehicles.map(v => `<option value="${v.id}">${v.plate} – ${v.brand} ${v.model}</option>`).join("");
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

  const nr = { id:"r-"+Date.now(), vehicle_id, type, title, target_date, target_km, is_completed:false };
  if (sb) {
    const { data } = await sb.from("reminders").insert([nr]).select().single();
    if (data) nr.id = data.id;
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
        <div style="font-weight:700;">${e.category} <span style="font-size:0.8rem;color:var(--text-muted);">${v?.plate || ""}</span></div>
        <div style="font-size:0.82rem;color:var(--text-muted);">${e.date} · ${(e.km||0).toLocaleString("tr-TR")} KM</div>
      </div>
      <div style="font-size:1.15rem;font-weight:800;color:var(--secondary);">₺${parseFloat(e.amount).toLocaleString("tr-TR")}</div>`;
    list.appendChild(el);
  });
}

function openExpenseModal() {
  if (!vehicles.length) { showPopup("Önce Garaj sayfasından araç eklemelisiniz."); return; }
  const sel = document.getElementById("expVehicleSelect");
  sel.innerHTML = vehicles.map(v => `<option value="${v.id}">${v.plate} – ${v.brand} ${v.model}</option>`).join("");
  document.getElementById("expAmount").value = "";
  document.getElementById("expKm").value = "";
  openModal("modalExpense");
}

function handleSaveExpense() {
  const vehicle_id = document.getElementById("expVehicleSelect").value;
  const category   = document.getElementById("expCategory").value;
  const amount     = parseFloat(document.getElementById("expAmount").value) || 0;
  const date       = document.getElementById("expDate").value;
  const km         = parseInt(document.getElementById("expKm").value) || 0;
  if (!amount || !date) { showPopup("Tutar ve tarih zorunludur."); return; }
  expenses.push({ id:"e-"+Date.now(), vehicle_id, category, amount, date, km });
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
function emptyCard(msg) {
  return `<div class="glass" style="padding:28px;text-align:center;grid-column:1/-1;border-radius:var(--radius-lg);color:var(--text-muted);">${msg}</div>`;
}
