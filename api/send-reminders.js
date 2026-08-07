// Vercel Serverless Function: Triggered nightly at 09:00 via Vercel Cron Job
// File: /api/send-reminders.js

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || "https://YOUR_SUPABASE_PROJECT_ID.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "YOUR_SERVICE_ROLE_KEY";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

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

    return res.status(200).json({
      success: true,
      message: `Tarama tamamlandı. ${notificationsToSend.length} adet hatırlatıcı bildirimi sıraya alındı.`,
      notifications: notificationsToSend
    });
  } catch (err) {
    console.error("Cron Job Error:", err);
    return res.status(500).json({ error: err.message });
  }
};
