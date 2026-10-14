import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY")!;
const SITE_URL = "https://ladancestone-bot.github.io/La-Dance-Stone-lankomumas-ir-mokejimai/preview/";
const ALLOWED_ORIGINS = [
  "https://ladancestone.lt",
  "https://www.ladancestone.lt",
  "https://ladancestone-bot.github.io",
];

function cors(origin: string | null) {
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
    "Content-Type": "application/json; charset=utf-8",
  };
}
const response = (body: unknown, status: number, origin: string | null) =>
  new Response(JSON.stringify(body), { status, headers: cors(origin) });
const clean = (v: unknown) => String(v ?? "").trim();
const escapeHtml = (s: string) => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(origin) });
  if (req.method !== "POST") return response({ error: "Leidžiamas tik POST metodas." }, 405, origin);
  if (origin && !ALLOWED_ORIGINS.includes(origin)) return response({ error: "Nepalaikomas svetainės adresas." }, 403, origin);
  if (!SUPABASE_URL || !SERVICE_KEY || !RESEND_API_KEY || !STRIPE_SECRET_KEY) {
    return response({ error: "Serverio konfigūracija neužbaigta. Patikrinkite el. pašto ir Stripe raktus." }, 500, origin);
  }

  try {
    const body = await req.json();
    const firstName = clean(body.firstName).slice(0, 100);
    const lastName = clean(body.lastName).slice(0, 100);
    const email = clean(body.email).toLowerCase().slice(0, 254);
    const phone = clean(body.phone).slice(0, 40);
    const date = clean(body.date);
    const startHour = Number(body.startHour);
    const duration = Number(body.duration);

    if (!firstName || !lastName || !phone || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return response({ error: "Patikrinkite vardą, pavardę, telefono numerį ir el. paštą." }, 400, origin);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isInteger(startHour) || !Number.isInteger(duration) ||
        startHour < 8 || startHour > 21 || duration < 1 || duration > 6 || startHour + duration > 22) {
      return response({ error: "Patikrinkite pasirinktą datą, pradžios laiką ir trukmę." }, 400, origin);
    }

    // Compute the correct Europe/Vilnius UTC offset for the selected local date.
    const localStart = new Date(date + "T" + String(startHour).padStart(2, "0") + ":00:00+03:00");
    const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Vilnius", timeZoneName: "longOffset", year: "numeric" }).formatToParts(localStart);
    const tz = parts.find(p => p.type === "timeZoneName")?.value ?? "GMT+03:00";
    const offset = tz.includes("+02:00") ? "+02:00" : "+03:00";
    const startsAt = new Date(date + "T" + String(startHour).padStart(2, "0") + ":00:00" + offset);
    const endsAt = new Date(startsAt.getTime() + duration * 60 * 60 * 1000);
    if (Number.isNaN(startsAt.getTime()) || startsAt.getTime() <= Date.now()) {
      return response({ error: "Rezervuoti galima tik būsimą laiką." }, 400, origin);
    }

    const price = Math.min(duration, 3) * 20 + Math.max(0, duration - 3) * 15;
    const rpc = await fetch(SUPABASE_URL + "/rest/v1/rpc/create_public_rental_booking", {
      method: "POST",
      headers: { apikey: SERVICE_KEY, Authorization: "Bearer " + SERVICE_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({
        p_first_name: firstName, p_last_name: lastName, p_email: email, p_phone: phone,
        p_starts_at: startsAt.toISOString(), p_ends_at: endsAt.toISOString(), p_price: price,
      }),
    });
    const rpcText = await rpc.text();
    if (!rpc.ok) {
      let message = "Nepavyko išsaugoti rezervacijos. Pabandykite dar kartą.";
      try { const parsed = JSON.parse(rpcText); if (parsed.message) message = parsed.message; } catch {}
      return response({ error: message }, 409, origin);
    }

    const booking = JSON.parse(rpcText);
    const bookingId = String(booking.booking_id ?? booking.id ?? "");
    if (!bookingId) {
      console.error("Rental RPC did not return a booking id", rpcText.slice(0, 500));
      return response({ error: "Rezervacija sukurta, bet nepavyko paruošti apmokėjimo. Susisiekite info@ladancestone.lt." }, 500, origin);
    }

    const dateText = new Intl.DateTimeFormat("lt-LT", { timeZone: "Europe/Vilnius", year: "numeric", month: "long", day: "numeric" }).format(startsAt);
    const timeText = String(startHour).padStart(2, "0") + ":00–" + String(startHour + duration).padStart(2, "0") + ":00";
    const safeName = escapeHtml(firstName + " " + lastName);

    // Create the Stripe Checkout session on the server; never expose the secret key to the browser.
    const stripeForm = new URLSearchParams();
    stripeForm.set("mode", "payment");
    stripeForm.set("customer_email", email);
    stripeForm.set("client_reference_id", bookingId);
    stripeForm.set("phone_number_collection[enabled]", "true");
    stripeForm.set("line_items[0][quantity]", "1");
    stripeForm.set("line_items[0][price_data][currency]", "eur");
    stripeForm.set("line_items[0][price_data][unit_amount]", String(Math.round(price * 100)));
    stripeForm.set("line_items[0][price_data][product_data][name]", "La Dance Stone – studijos nuoma");
    stripeForm.set("line_items[0][price_data][product_data][description]", dateText + " | " + timeText);
    stripeForm.set("payment_intent_data[receipt_email]", email);
    stripeForm.set("payment_intent_data[metadata][payment_kind]", "rental");
    stripeForm.set("payment_intent_data[metadata][rental_id]", bookingId);
    stripeForm.set("metadata[payment_kind]", "rental");
    stripeForm.set("metadata[rental_id]", bookingId);
    stripeForm.set("metadata[customer_name]", (firstName + " " + lastName).slice(0, 500));
    stripeForm.set("metadata[customer_email]", email);
    stripeForm.set("metadata[customer_phone]", phone);
    stripeForm.set("metadata[rental_date]", date);
    stripeForm.set("metadata[start_time]", String(startHour).padStart(2, "0") + ":00");
    stripeForm.set("metadata[end_time]", String(startHour + duration).padStart(2, "0") + ":00");
    stripeForm.set("success_url", SITE_URL + "?rental_payment=success");
    stripeForm.set("cancel_url", SITE_URL + "?rental_payment=cancelled");

    const stripeResponse = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: { Authorization: "Bearer " + STRIPE_SECRET_KEY, "Content-Type": "application/x-www-form-urlencoded" },
      body: stripeForm,
    });
    const stripeText = await stripeResponse.text();
    if (!stripeResponse.ok) {
      console.error("Stripe Checkout creation failed", stripeResponse.status, stripeText.slice(0, 500));
      return response({ ok: true, bookingId, emailSent: false, paymentLinkCreated: false, message: "Rezervacija išsaugota, tačiau mokėjimo nuorodos sukurti nepavyko. Susisiekite info@ladancestone.lt." }, 200, origin);
    }
    const session = JSON.parse(stripeText);
    if (!session.url) {
      console.error("Stripe Checkout session returned no URL", stripeText.slice(0, 500));
      return response({ ok: true, bookingId, emailSent: false, paymentLinkCreated: false, message: "Rezervacija išsaugota, tačiau mokėjimo nuorodos gauti nepavyko." }, 200, origin);
    }

    const dbUpdate = await fetch(SUPABASE_URL + "/rest/v1/studio_rentals?id=eq." + encodeURIComponent(bookingId), {
      method: "PATCH",
      headers: { apikey: SERVICE_KEY, Authorization: "Bearer " + SERVICE_KEY, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ payment_method: "stripe", stripe_checkout_session_id: session.id, stripe_payment_status: "unpaid" }),
    });
    if (!dbUpdate.ok) {
      console.error("Could not save Stripe session id", dbUpdate.status, (await dbUpdate.text()).slice(0, 500));
    }

    const payUrl = String(session.url);
    const cashUrl = SITE_URL + "?rental_cash=" + encodeURIComponent(bookingId) + "&email=" + encodeURIComponent(email);
    const mail = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: "Bearer " + RESEND_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "La Dance Stone <info@ladancestone.lt>",
        to: [email],
        reply_to: "info@ladancestone.lt",
        subject: "Studijos nuomos rezervacija – apmokėjimas",
        html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#30271f;line-height:1.6"><h2 style="color:#481824">La Dance Stone šokių studija • Kaunas</h2><p>Sveiki, ${safeName}!</p><p>Gavome jūsų studijos nuomos rezervaciją. Kad rezervacija būtų patvirtinta, atlikite apmokėjimą per 24 valandas.</p><div style="background:#f7f2ec;padding:18px;border-radius:12px"><p><strong>Data:</strong> ${escapeHtml(dateText)}</p><p><strong>Laikas:</strong> ${escapeHtml(timeText)}</p><p><strong>Trukmė:</strong> ${duration} val.</p><p><strong>Rezervacijos kaina:</strong> ${price} €</p><p><strong>Būsena:</strong> Laukiama apmokėjimo</p></div><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;margin:28px 0 24px;border-collapse:separate"><tr><td align="center" style="padding:0 0 12px"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;border-collapse:separate"><tr><td align="center" bgcolor="#481824" style="background:#481824;border-radius:12px"><a href="${escapeHtml(payUrl)}" style="display:block;padding:16px 20px;border:1px solid #481824;border-radius:12px;color:#ffffff;font-family:Arial,sans-serif;font-size:16px;line-height:22px;font-weight:bold;text-decoration:none;text-align:center">Apmokėti internetu · ${price} €</a></td></tr></table></td></tr><tr><td align="center" style="padding:0"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;border-collapse:separate"><tr><td align="center" bgcolor="#ffffff" style="background:#ffffff;border:1px solid #d8c8b5;border-radius:12px"><a href="${escapeHtml(cashUrl)}" style="display:block;padding:15px 20px;border-radius:12px;color:#481824;font-family:Arial,sans-serif;font-size:15px;line-height:22px;font-weight:bold;text-decoration:none;text-align:center">Pasirinkti mokėjimą grynaisiais</a></td></tr></table></td></tr></table><p>Jei nepavyksta atlikti apmokėjimo, susisiekite su mumis el. paštu <a href="mailto:info@ladancestone.lt">info@ladancestone.lt</a> arba atsakykite į šį laišką.</p><p>Jei turite klausimų, atsakykite į šį laišką arba rašykite <a href="mailto:info@ladancestone.lt">info@ladancestone.lt</a>.</p><p>Iki susitikimo!<br><strong>La Dance Stone šokių studija</strong></p></div>`,
      }),
    });
    if (!mail.ok) {
      const mailError = await mail.text();
      console.error("Resend send failed for booking", bookingId, mail.status, mailError.slice(0, 500));
      return response({ ok: true, bookingId, emailSent: false, paymentLinkCreated: true, checkoutUrl: payUrl, message: "Rezervacija ir mokėjimo nuoroda paruoštos, tačiau laiško išsiųsti nepavyko. Susisiekite info@ladancestone.lt." }, 200, origin);
    }
    return response({ ok: true, bookingId, emailSent: true, paymentLinkCreated: true, checkoutUrl: payUrl, message: "Rezervacija išsaugota. Į el. paštą išsiuntėme rezervacijos informaciją ir saugią apmokėjimo nuorodą." }, 200, origin);
  } catch (error) {
    console.error("public-rental-booking error", error);
    return response({ error: "Įvyko techninė klaida. Rezervacija nepateikta, pabandykite dar kartą." }, 500, origin);
  }
});