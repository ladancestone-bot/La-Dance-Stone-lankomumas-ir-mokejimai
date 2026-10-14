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
  const group = String(body.group ?? "").trim();
  const bookingType = body.bookingType === "single" ? "single" : body.bookingType === "group" ? "group" : "";
  const groupKey = String(body.groupKey ?? "");
  const adultDays = Array.isArray(body.adultDays) ? body.adultDays.map((x: unknown) => String(x)).slice(0, 3) : [];
  const adultFrequency = Number(body.adultFrequency ?? 2);
  if (!first || !last || !birth || !email || !phone || !group || !bookingType || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "Patikrinkite, ar užpildyti visi registracijos laukai." }, 400);
  if (groupKey === "adult" && bookingType === "group" && (!Number.isInteger(adultFrequency) || adultFrequency < 1 || adultFrequency > 3 || adultDays.length !== adultFrequency)) return json({ error: "Pasirinkite tinkamą treniruočių dienų skaičių." }, 400);

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
    raw_data: { registration_id: registrationId, booking_type: bookingType, group_key: groupKey, birth_date: birth, adult_days: adultDays, adult_frequency: adultFrequency, registration_fee: bookingType === "group" ? 5 : 0, lesson_price: bookingType === "single" ? 10 : null, subscription_price_not_charged: bookingType === "group" ? (groupKey === "adult" ? adultPrice : 50) : null }
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
      metadata: { payment_kind: paymentKind, registration_id: registrationId, booking_type: bookingType, customer_name: (first + " " + last).slice(0, 500), customer_email: email.slice(0, 500), group: group.slice(0, 500) },
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
  const paymentExplanation = bookingType === "single"
    ? "Mokėkite 10 € už pasirinktą vienkartinę pamoką."
    : "Dabar mokamas tik 5 € registracijos mokestis. Mėnesio abonemento mokėjimo nuorodą atsiųsime atskiru laišku po pirmosios pamokos.";
  const html = `<!doctype html><html><body style="margin:0;background:#f7f2ec;color:#30271f;font-family:Arial,sans-serif;line-height:1.65"><div style="max-width:620px;margin:0 auto;padding:24px 14px"><div style="background:#fffdf9;border:1px solid #eadfce;border-radius:20px;overflow:hidden"><div style="background:#481824;text-align:center;padding:28px 20px"><div style="font-family:Georgia,serif;font-size:29px;color:#fff">La Dance Stone</div><div style="margin-top:6px;font-size:11px;font-weight:bold;letter-spacing:3px;color:#d9c08c">ŠOKIŲ STUDIJA</div></div><div style="padding:26px 22px"><p>Sveiki, <strong>${esc(first)} ${esc(last)}</strong>!</p><h2 style="color:#481824;font-family:Georgia,serif;font-weight:normal">Jūsų registracija gauta 💙</h2><p>Džiaugiamės, kad prisijungiate prie „La Dance Stone“ šokių studijos.</p><div style="padding:16px;border:1px solid #eadfce;border-radius:14px;background:#fbf7f1"><h3 style="margin:0 0 12px;color:#481824;font-size:16px">📅 Pamokos informacija</h3><p style="margin:6px 0"><strong>Grupė:</strong> ${esc(group)}</p><p style="margin:6px 0"><strong>Pasirinkimas:</strong> ${esc(subscriptionLabel)}</p>${adultDayText}</div><div style="margin:20px 0;padding:17px;border:1px solid #d9c08c;border-radius:14px"><h3 style="margin:0 0 8px;color:#481824;font-size:16px">💳 Apmokėjimas</h3><p style="margin:0 0 16px">${esc(paymentExplanation)}</p><a href="${esc(checkoutUrl)}" style="display:inline-block;background:#481824;color:#fff;text-decoration:none;padding:14px 22px;border-radius:28px;font-weight:bold">${bookingType === "single" ? "Apmokėti 10 € internetu" : "Apmokėti 5 € registracijos mokestį"}</a></div><div style="padding:16px;border:1px solid #eadfce;border-radius:14px;background:#fbf7f1"><h3 style="margin:0 0 12px;color:#481824;font-size:16px">📍 Kur atvykti?</h3><p style="margin:6px 0"><strong>Adresas:</strong> V. Krėvės pr. 57, Kaunas</p><p style="margin:6px 0">Įėjimas per IKI parduotuvę, tuomet laiptais į 2 aukštą.</p><h3 style="margin:18px 0 8px;color:#481824;font-size:16px">🎒 Ką pasiimti?</h3><ul style="padding-left:20px;margin:0"><li>Patogią sportinę aprangą.</li><li>Speciali avalynė nereikalinga – šokti galite basomis arba su kojinėmis.</li><li>Nepamirškite vandens atsigerti.</li></ul></div><p style="margin-top:24px">Iki greito! 💙</p><p style="margin-bottom:0"><strong style="letter-spacing:1px;color:#481824">LA DANCE STONE KOMANDA</strong><br><a style="color:#8a5965" href="mailto:info@ladancestone.lt">info@ladancestone.lt</a><br><a style="color:#8a5965" href="https://www.ladancestone.lt">www.ladancestone.lt</a><br>+370 655 67797<br>V. Krėvės pr. 57, Kaunas</p></div></div><p style="font-size:11px;text-align:center;color:#82766d">Šis laiškas išsiųstas automatiškai po registracijos.</p></div></body></html>`;
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
