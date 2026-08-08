// Vercel Serverless Function: Triggered nightly at 09:00 via Vercel Cron Job
// File: /api/send-reminders.js
// Sends real Web Push notifications via the web-push library.

const { createClient } = require('@supabase/supabase-js');
const webpush = require('web-push');

const SUPABASE_URL = process.env.SUPABASE_URL || "https://YOUR_SUPABASE_PROJECT_ID.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "YOUR_SERVICE_ROLE_KEY";
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || "YOUR_VAPID_PUBLIC_KEY";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || "YOUR_VAPID_PRIVATE_KEY";
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "https://otoman-sehzade.vercel.app";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

module.exports = async (req, res) => {
  try {
    console.log("Vercel Cron Job: Checking upcoming vehicle reminders...");

    // 1. Get vehicles and active reminders
    const { data: reminders, error: remError } = await supabase
      .from('reminders')
      .select('*, vehicles(*)')
      .eq('is_completed', false);

    if (remError) throw remError;

    const notificationsToSend = [];
    const today = new Date();

    reminders.forEach(r => {
      if (!r.vehicles) return;

      let isUrgent = false;
      let messageBody = "";

      if (r.target_date) {
        const targetD = new Date(r.target_date);
        const diffDays = Math.ceil((targetD - today) / (1000 * 60 * 60 * 24));
        if (diffDays <= 7) {
          isUrgent = true;
          messageBody = `${r.vehicles.plate} plakalı aracınızın ${r.title} işlemine ${diffDays <= 0 ? 'günü geçti!' : diffDays + ' gün kaldı!'}`;
        }
      } else if (r.target_km) {
        const diffKm = r.target_km - r.vehicles.current_km;
        if (diffKm <= 500) {
          isUrgent = true;
          messageBody = `${r.vehicles.plate} plakalı aracınızın ${r.title} bakımına ${diffKm <= 0 ? 'KM doldu!' : diffKm + ' KM kaldı!'}`;
        }
      }

      if (isUrgent) {
        notificationsToSend.push({
          userId: r.vehicles.user_id,
          title: "🚨 OTOMAN Araç Hatırlatıcısı",
          body: messageBody
        });
      }
    });

    // 2. Fetch all push subscriptions
    const { data: tokens, error: tokenError } = await supabase
      .from('fcm_tokens')
      .select('user_id, token');
    if (tokenError) throw tokenError;

    const subsByUser = {};
    (tokens || []).forEach(t => {
      if (!subsByUser[t.user_id]) subsByUser[t.user_id] = [];
      subsByUser[t.user_id].push(t.token);
    });

    // 3. Send notifications
    const sendWithTimeout = (sub, payload) => {
      return new Promise((resolve) => {
        let done = false;
        const timer = setTimeout(() => { if (!done) { done = true; resolve({ res: 'timeout' }); } }, 8000);
        webpush.sendNotification(sub, payload)
          .then(() => { if (!done) { done = true; clearTimeout(timer); resolve({ res: 'ok' }); } })
          .catch((err) => {
            if (!done) {
              done = true;
              clearTimeout(timer);
              const status = err.statusCode || 0;
              const msg = (err.message || '').slice(0, 80);
              const body = (err.body || '').slice(0, 200);
              if (status === 403 || status === 404 || status === 410) resolve({ res: 'dead', status, msg, body });
              else resolve({ res: 'error', status, msg, body });
            }
          });
      });
    };

    let sent = 0;
    const results = [];
    for (const n of notificationsToSend) {
      const subs = subsByUser[n.userId] || [];
      const payload = JSON.stringify({ title: n.title, body: n.body });
      const batch = subs.map(async (rawSub) => {
        let sub;
        try { sub = JSON.parse(rawSub); } catch (e) { return { host: 'bad-json', res: 'bad' }; }
        let host = 'unknown';
        try { host = new URL(sub.endpoint).hostname; } catch (e) {}
        const out = await sendWithTimeout(sub, payload);
        if (out.res === 'ok') sent++;
        else if (out.res === 'dead') {
          await supabase.from('fcm_tokens').delete().eq('token', rawSub);
        }
        return { host, ...out };
      });
      results.push(...await Promise.all(batch));
    }

    return res.status(200).json({
      success: true,
      message: `Tarama tamamlandı. ${notificationsToSend.length} adet hatırlatıcı bildirimi sıraya alındı, ${sent} adet gönderildi.`,
      notifications: notificationsToSend.length,
      subscriptions: (tokens || []).length,
      sent,
      results,
      debugSubject: VAPID_SUBJECT,
      debugPubKey: (VAPID_PUBLIC_KEY || '').slice(0, 12) + '...'
    });
  } catch (err) {
    console.error("Cron Job Error:", err);
    return res.status(500).json({ error: err.message });
  }
};
