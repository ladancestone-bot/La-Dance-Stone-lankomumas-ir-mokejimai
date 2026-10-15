import Stripe from "npm:stripe@^22";
import { createClient as createSupabaseClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const STRIPE_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
const stripe = STRIPE_KEY ? new Stripe(STRIPE_KEY, { apiVersion: "2025-03-31.basil" }) : null;
const supabase = createSupabaseClient(SUPABASE_URL, SERVICE_KEY);
const headers = { "Access-Control-Allow-Origin": "https://ladancestone-bot.github.io", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS", "Content-Type": "application/json" };
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers });
const esc = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]!));

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return json({ error: "Leidžiamas tik POST užklausos metodas." }, 405);
  if (!stripe || !RESEND_KEY) return json({ error: "Mokėjimų arba el. laiškų siuntimo konfigūracija nebaigta." }, 503);
  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Netinkami registracijos duomenys." }, 400); }

  const first = String(body.firstName ?? "").trim();
  const last = String(body.lastName ?? "").trim();
  const birth = String(body.birthDate ?? "").trim();
  const email = String(body.email ?? "").trim();
  const phone = String(body.phone ?? "").trim();
  const submittedGroup = String(body.group ?? "").trim();
  const groupKey = String(body.groupKey ?? "");
  const canonicalGroupNames: Record<string, string> = { adult: "Šiuolaikinis šokis suaugusiesiems", kids57: "Šiuolaikinis šokis vaikams · 5–7 m.", kids712: "Šiuolaikinis šokis vaikams · 7–12 m.", teens: "Šiuolaikinis šokis paaugliams · 13–18 m." };
  const group = canonicalGroupNames[groupKey] || submittedGroup;
  const bookingType = body.bookingType === "single" ? "single" : body.bookingType === "group" ? "group" : "";
  const adultDays = Array.isArray(body.adultDays) ? body.adultDays.map((x: unknown) => String(x)).slice(0, 3) : [];
  const adultFrequency = Number(body.adultFrequency ?? 2);
  const groupIndex = Number(body.groupIndex ?? 0);
  const selectedSessions = Array.isArray(body.selectedSessions) ? body.selectedSessions.slice(0, 40).map((s: any) => ({
    date: String(s?.date ?? ""),
    day: String(s?.day ?? ""),
    start: String(s?.start ?? ""),
    end: String(s?.end ?? "")
  })) : [];
  if (!first || !last || !birth || !email || !phone || !group || !bookingType || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "Patikrinkite, ar užpildyti visi registracijos laukai." }, 400);
  if (groupKey === "adult" && bookingType === "group" && (!Number.isInteger(adultFrequency) || adultFrequency < 1 || adultFrequency > 3 || adultDays.length !== adultFrequency)) return json({ error: "Pasirinkite tinkamą treniruočių dienų skaičių." }, 400);

  const scheduleByGroup: Record<string, { day: number; start: string; end: string; name: string }[]> = {
    kids57: [{ day: 2, start: "18:00", end: "18:45", name: "Antradienis" }, { day: 4, start: "18:00", end: "18:45", name: "Ketvirtadienis" }],
    kids712: groupIndex === 1
      ? [{ day: 2, start: "16:00", end: "17:00", name: "Antradienis" }, { day: 4, start: "16:00", end: "17:00", name: "Ketvirtadienis" }]
      : [{ day: 1, start: "16:00", end: "17:00", name: "Pirmadienis" }, { day: 3, start: "16:00", end: "17:00", name: "Trečiadienis" }],
    teens: groupIndex === 1
      ? [{ day: 2, start: "17:00", end: "18:00", name: "Antradienis" }, { day: 4, start: "17:00", end: "18:00", name: "Ketvirtadienis" }]
      : [{ day: 1, start: "17:00", end: "18:00", name: "Pirmadienis" }, { day: 3, start: "17:00", end: "18:00", name: "Trečiadienis" }],
    adult: [{ day: 1, start: "19:15", end: "20:00", name: "Pirmadienis" }, { day: 3, start: "19:15", end: "20:00", name: "Trečiadienis" }, { day: 0, start: "19:00", end: "19:45", name: "Sekmadienis" }]
  };
  const allowedSchedule = scheduleByGroup[groupKey];
  if (!allowedSchedule || !Number.isInteger(groupIndex) || groupIndex < 0 || groupIndex > 1 && groupKey !== "adult") return json({ error: "Nepavyko nustatyti pasirinktos grupės tvarkaraščio." }, 400);
  const todayParts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Vilnius", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const todayMap = Object.fromEntries(todayParts.map((p) => [p.type, p.value]));
  const today = String(todayMap.year) + "-" + String(todayMap.month) + "-" + String(todayMap.day);
  const validSessions = selectedSessions.length > 0 &&
    (bookingType === "single" ? selectedSessions.length === 1 : selectedSessions.length <= 40) &&
    selectedSessions.every((s) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(s.date) || s.date < today || !allowedSchedule.some((slot) => slot.start === s.start && slot.end === s.end && slot.name === s.day)) return false;
      const date = new Date(s.date + "T12:00:00Z");
      if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== s.date || date.getUTCDay() !== allowedSchedule.find((slot) => slot.start === s.start && slot.end === s.end && slot.name === s.day)?.day) return false;
      if (groupKey === "adult" && bookingType === "group" && !adultDays.includes(s.day)) return false;
      return true;
    });
  if (!validSessions) return json({ error: "Pasirinkite datą ir laiką, kurie atitinka pasirinktos grupės tvarkaraštį." }, 400);

  const registrationId = crypto.randomUUID();
  const fee = bookingType === "single" ? 10 : 5;
  const paymentKind = bookingType === "single" ? "single_lesson" : "reservation_fee";
  const lessonLabel = bookingType === "single" ? "Vienkartinė pamoka · 10 €" : "Abonemento registracijos mokestis · 5 €";
  const adultPrice = ({ 1: 40, 2: 50, 3: 60 } as Record<number, number>)[adultFrequency];
  const subscriptionLabel = bookingType === "single" ? lessonLabel : groupKey === "adult"
    ? `Abonementas · ${adultFrequency} k./sav. · ${adultPrice} € / mėn. (apmokėjimas bus atsiųstas atskirai po pirmosios pamokos)`
    : "Abonementas · 50 € / mėn. (apmokėjimas bus atsiųstas atskirai po pirmosios pamokos)";

  const { error: saveError } = await supabase.from("website_orders").insert({
    source: "website",
    source_key: "class-registration:" + registrationId,
    order_type: "class_registration",
    customer_name: first + " " + last,
    customer_email: email,
    customer_phone: phone,
    child_name: groupKey === "adult" ? null : first + " " + last,
    parent_name: groupKey === "adult" ? null : first + " " + last,
    parent_email: groupKey === "adult" ? null : email,
    parent_phone: groupKey === "adult" ? null : phone,
    group_text: group,
    lesson_text: group,
    amount: fee,
    paid_text: "Laukiama apmokėjimo",
    status: "new",
    raw_data: { registration_id: registrationId, booking_type: bookingType, group_key: groupKey, group_index: groupIndex, birth_date: birth, adult_days: adultDays, adult_frequency: adultFrequency, lesson_date: selectedSessions[0].date, lesson_dates: selectedSessions.map((s) => s.date), start_time: selectedSessions[0].start, end_time: selectedSessions[0].end, selected_sessions: selectedSessions, notes: selectedSessions.map((s) => `${s.day}, ${s.date} ${s.start}–${s.end}`).join('; '), registration_fee: bookingType === "group" ? 5 : 0, lesson_price: bookingType === "single" ? 10 : null, subscription_price_not_charged: bookingType === "group" ? (groupKey === "adult" ? adultPrice : 50) : null }
  });
  if (saveError) {
    console.error("Class registration save failed", saveError);
    return json({ error: "Nepavyko išsaugoti registracijos. Bandykite dar kartą arba susisiekite info@ladancestone.lt." }, 500);
  }

  let checkoutUrl = "";
  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: email,
      client_reference_id: registrationId,
      line_items: [{ quantity: 1, price_data: { currency: "eur", unit_amount: fee * 100, product_data: { name: bookingType === "single" ? "La Dance Stone – vienkartinė šokių pamoka" : "La Dance Stone – registracijos mokestis", description: group } } }],
      metadata: { payment_kind: paymentKind, registration_id: registrationId, booking_type: bookingType, customer_name: (first + " " + last).slice(0, 500), customer_email: email.slice(0, 500), group: group.slice(0, 500), lesson_date: selectedSessions[0].date, start_time: selectedSessions[0].start, end_time: selectedSessions[0].end },
      success_url: "https://ladancestone-bot.github.io/La-Dance-Stone-lankomumas-ir-mokejimai/preview/?class_payment=success",
      cancel_url: "https://ladancestone-bot.github.io/La-Dance-Stone-lankomumas-ir-mokejimai/preview/?class_payment=cancelled"
    });
    checkoutUrl = session.url ?? "";
    if (!checkoutUrl) throw new Error("Stripe checkout URL missing");
  } catch (error) {
    console.error("Class payment checkout creation failed", error);
    return json({ error: "Registracija išsaugota, tačiau nepavyko paruošti mokėjimo nuorodos. Susisiekite info@ladancestone.lt." }, 502);
  }

  const adultDayText = adultDays.length ? `<div style="padding:12px 14px;border:1px solid #eadfce;border-radius:12px;margin-top:8px"><strong style="color:#481824">Lankymo dienos:</strong> ${esc(adultDays.join(", "))}</div>` : "";
  const lessonDatesHtml = selectedSessions.map((s) => `<div style="padding:5px 0;border-bottom:1px solid #eee4d8;line-height:1.55">${esc(s.day)}, ${esc(s.date)} <span style="white-space:nowrap">${esc(s.start)}–${esc(s.end)}</span></div>`).join("");
  const lessonDateBlock = `<div style="padding:12px 14px;border:1px solid #eadfce;border-radius:12px;margin-top:8px"><strong style="display:block;margin-bottom:6px;color:#481824">Pasirinktos pamokos:</strong>${lessonDatesHtml}</div>`;
  const scheduleRowsHtml = allowedSchedule.map((slot) =>
    `<div style="padding:7px 0;border-bottom:1px solid #eee4d8;line-height:1.5;display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 12px;max-width:100%;box-sizing:border-box"><strong style="color:#481824;flex:1 1 120px;min-width:0">${esc(slot.name)}</strong><span style="white-space:nowrap">${esc(slot.start)}–${esc(slot.end)}</span></div>`
  ).join("");
  const scheduleBlock = `<div style="padding:15px 16px;border:1px solid #d9c08c;border-radius:14px;margin-top:12px;background:#fffaf0"><h3 style="margin:0 0 10px;color:#481824;font-size:17px">🗓️ ${bookingType === "group" ? "Jūsų grupės tvarkaraštis" : "Grupės pamokų tvarkaraštis"}</h3>${scheduleRowsHtml}${groupKey === "adult" && bookingType === "group" ? `<div style="margin-top:12px;padding:13px 14px;background:#481824;color:#fff;border-radius:10px;font-size:15px;line-height:1.6"><strong style="display:block;font-size:16px;margin-bottom:5px;color:#f0dca9">SVARBU APIE ABONEMENTĄ</strong>Abonementas nėra pririštas tik prie registracijoje pasirinktos dienos. Jei kurią savaitę negalite atvykti įprastą dieną, galite pasirinkti kitą suaugusiųjų grupės tvarkaraštyje nurodytą dieną. Lankymo dienas galite keisti pagal savo galimybes.</div>` : ""}</div>`;
  const monthlyPrice = groupKey === "adult" ? adultPrice : 50;
  const pricingBlock = bookingType === "single"
    ? `<div style="margin-top:12px;padding:17px;border:1px solid #b59655;border-radius:14px;background:#481824;box-sizing:border-box;width:100%;max-width:100%;color:#fff7f0"><div style="font-size:10px;letter-spacing:1.4px;font-weight:bold;color:#e4cf98">VIENKARTINĖ PAMOKA</div><div style="font-size:27px;line-height:1.2;font-weight:bold;color:#fff7f0;margin-top:5px">10 € <span style="font-size:13px;font-weight:normal;color:#f1e5df">/ pamoka</span></div></div>`
    : `<div style="margin-top:12px;padding:17px;border:1px solid #b59655;border-radius:14px;background:#481824;box-sizing:border-box;width:100%;max-width:100%;color:#fff7f0"><div style="font-size:10px;letter-spacing:1.4px;font-weight:bold;color:#e4cf98;margin-bottom:9px">MĖNESIO ABONEMENTAS</div><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;border-collapse:collapse"><tr><td valign="middle" style="padding:0 10px 0 0;font-size:14px;line-height:1.4;font-weight:bold;color:#f5dfe4">${groupKey === "adult" ? `${adultFrequency} k. per savaitę` : "Pagal pasirinktos grupės tvarkaraštį"}</td><td valign="middle" align="right" style="padding:0;text-align:right;white-space:nowrap"><span style="font-family:Georgia,serif;font-size:30px;line-height:1.1;font-weight:bold;color:#fff7f0">${monthlyPrice} €</span><span style="font-size:12px;font-weight:normal;color:#eadbd4;white-space:nowrap"> / mėn.</span></td></tr></table><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;border-collapse:collapse;margin-top:15px"><tr><td valign="middle" style="padding:12px 10px;background:#f4dfe2;border:1px solid #e8c4cb;border-radius:10px;color:#57202d;font-size:12px;line-height:1.4">Registruojantis pirmą kartą</td><td align="right" valign="middle" style="padding:12px 12px;background:#f4dfe2;border:1px solid #e8c4cb;border-radius:10px;text-align:right;white-space:nowrap"><span style="font-family:Georgia,serif;font-size:25px;line-height:1;font-weight:bold;color:#8b2944">+5 €</span></td></tr></table><p style="margin:12px 0 0;font-size:12px;line-height:1.6;color:#e1d0ca">Abonemento mokėjimo nuorodą atsiųsime atskirai po pirmosios pamokos.</p></div>`;
  const paymentExplanation = bookingType === "single"
    ? "Mokėkite 10 € už pasirinktą vienkartinę pamoką."
    : "Dabar mokamas tik 5 € registracijos mokestis. Mėnesio abonemento mokėjimo nuorodą atsiųsime atskiru laišku po pirmosios pamokos.";
  const html = `<!doctype html><html><body style="margin:0;background:#f7f2ec;color:#30271f;font-family:Arial,sans-serif;line-height:1.65"><div style="max-width:620px;margin:0 auto;padding:24px 14px"><div style="background:#fffdf9;border:1px solid #eadfce;border-radius:20px;overflow:hidden"><div style="background:#481824;text-align:center;padding:28px 20px"><div style="font-family:Georgia,serif;font-size:29px;color:#fff">La Dance Stone</div><div style="margin-top:6px;font-size:11px;font-weight:bold;letter-spacing:3px;color:#d9c08c">ŠOKIŲ STUDIJA</div></div><div style="padding:26px 22px"><p>Sveiki, <strong>${esc(first)} ${esc(last)}</strong>!</p><h2 style="color:#481824;font-family:Georgia,serif;font-weight:normal">Jūsų registracija gauta</h2><p>Džiaugiamės, kad prisijungiate prie „La Dance Stone“ šokių studijos.</p><div style="padding:16px;border:1px solid #eadfce;border-radius:14px;background:#fbf7f1"><h3 style="margin:0 0 12px;color:#481824;font-size:16px">Pamokos informacija</h3><p style="margin:10px 0"><strong style="display:block;color:#481824;margin-bottom:3px">Grupė</strong><span style="display:block;overflow-wrap:break-word;word-break:normal">${esc(group)}</span></p>${pricingBlock}${lessonDateBlock}${adultDayText}</div>${groupKey === "adult" ? scheduleBlock : ""}<div style="margin:20px 0;padding:17px;border:1px solid #d9c08c;border-radius:14px"><h3 style="margin:0 0 8px;color:#481824;font-size:16px">💳 Apmokėjimas</h3><p style="margin:0 0 16px">${esc(paymentExplanation)}</p><a href="${esc(checkoutUrl)}" style="display:inline-block;background:#481824;color:#fff;text-decoration:none;padding:14px 22px;border-radius:28px;font-weight:bold">${bookingType === "single" ? "Apmokėti 10 € internetu" : "Apmokėti 5 € registracijos mokestį"}</a></div><div style="padding:16px;border:1px solid #eadfce;border-radius:14px;background:#fbf7f1"><h3 style="margin:0 0 12px;color:#481824;font-size:16px">📍 Kur atvykti?</h3><p style="margin:6px 0"><strong>Adresas:</strong> V. Krėvės pr. 57, Kaunas</p><p style="margin:6px 0">Įėjimas per IKI parduotuvę, tuomet laiptais į 2 aukštą.</p><h3 style="margin:18px 0 8px;color:#481824;font-size:16px">🎒 Ką pasiimti?</h3><ul style="padding-left:20px;margin:0"><li>Patogią sportinę aprangą.</li><li>Speciali avalynė nereikalinga – šokti galite basomis arba su kojinėmis.</li><li>Nepamirškite vandens atsigerti.</li></ul></div><p style="margin-top:24px">Iki greito!</p><p style="margin-bottom:0"><strong style="letter-spacing:1px;color:#481824">LA DANCE STONE KOMANDA</strong><br><a style="color:#8a5965" href="mailto:info@ladancestone.lt">info@ladancestone.lt</a><br><a style="color:#8a5965" href="https://www.ladancestone.lt">www.ladancestone.lt</a><br>+370 655 67797<br>V. Krėvės pr. 57, Kaunas</p></div></div><p style="font-size:11px;text-align:center;color:#82766d">Šis laiškas išsiųstas automatiškai po registracijos.</p></div></body></html>`;
  const mail = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: "Bearer " + RESEND_KEY, "Content-Type": "application/json", "Idempotency-Key": "class-registration-" + registrationId },
    body: JSON.stringify({ from: "La Dance Stone šokių studija <info@ladancestone.lt>", to: [email], reply_to: "info@ladancestone.lt", subject: bookingType === "single" ? "Vienkartinės pamokos registracija – La Dance Stone" : "Registracija į šokių pamokas – La Dance Stone", html })
  });
  if (!mail.ok) {
    console.error("Class registration email failed", registrationId, mail.status, (await mail.text()).slice(0, 500));
    return json({ error: "Registracija išsaugota, tačiau nepavyko išsiųsti laiško. Susisiekite info@ladancestone.lt." }, 502);
  }
  return json({ ok: true, registrationId, checkoutUrl });
});
