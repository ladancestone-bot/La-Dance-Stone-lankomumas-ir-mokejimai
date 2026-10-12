import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const PAYMENT_LINKS_BY_HOURS: Record<number, string> = {
  1: "https://buy.stripe.com/5kQfZgcxgbKI9Sk6s22sM04",
  2: "https://buy.stripe.com/7sY6oG7cWeWU1lO9Ee2sM05",
  3: "https://buy.stripe.com/9B66oGfJs4igaWo17I2sM06",
  4: "https://buy.stripe.com/5kQdR8dBkdSQggI9Ee2sM07",
  5: "https://buy.stripe.com/3cIaEWgNw7us5C46s22sM09",
  6: "https://buy.stripe.com/cNi5kC9l42a8ggI5nY2sM08",
};

const allowedOrigins = new Set([
  "https://ladancestone.lt",
  "https://www.ladancestone.lt",
  "http://localhost:5173",
  "http://localhost:3000",
]);

function corsHeaders(origin: string | null) {
  const allowedOrigin = origin && allowedOrigins.has(origin) ? origin : "https://ladancestone.lt";
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function json(data: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
  });
}

function validEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(origin) });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405, origin);
  if (!SERVICE_ROLE_KEY) return json({ error: "Booking service is not configured" }, 503, origin);
  if (origin && !allowedOrigins.has(origin)) return json({ error: "Origin not allowed" }, 403, origin);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400, origin);
  }

  const name = String(body.name ?? "").trim();
  const email = String(body.email ?? "").trim().toLowerCase();
  const phone = String(body.phone ?? "").trim();
  const startsAt = String(body.starts_at ?? "").trim();
  const durationHours = Number(body.duration_hours);

  if (name.length < 2 || name.length > 160) return json({ error: "Enter your full name" }, 400, origin);
  if (!validEmail(email) || email.length > 254) return json({ error: "Enter a valid email address" }, 400, origin);
  if (phone.length > 50) return json({ error: "Phone number is too long" }, 400, origin);
  if (!Number.isInteger(durationHours) || durationHours < 1 || durationHours > 6) {
    return json({ error: "Online rentals are available for 1–6 whole hours. For longer rentals, contact the studio." }, 400, origin);
  }
  if (!Number.isFinite(Date.parse(startsAt)) || !/(Z|[+-]\d{2}:?\d{2})$/i.test(startsAt)) {
    return json({ error: "A valid start date and timezone are required" }, 400, origin);
  }

  const paymentLink = PAYMENT_LINKS_BY_HOURS[durationHours];
  if (!paymentLink) return json({ error: "No online payment link is configured for this duration" }, 400, origin);

  const { data, error } = await supabase.rpc("create_public_rental_booking", {
    p_customer_name: name,
    p_customer_email: email,
    p_customer_phone: phone || null,
    p_starts_at: startsAt,
    p_duration_hours: durationHours,
  });

  if (error || !data?.[0]) {
    const message = error?.message ?? "Could not create reservation";
    const status = /overlaps an existing studio rental/i.test(message) ? 409 : 400;
    return json({
      error: status === 409
        ? "This time is no longer available. Please choose another time."
        : message,
    }, status, origin);
  }

  const booking = data[0];
  const checkoutUrl = new URL(paymentLink);
  checkoutUrl.searchParams.set("client_reference_id", String(booking.rental_id));

  return json({
    booking_id: booking.rental_id,
    amount_eur: Number(booking.amount_eur),
    starts_at: booking.starts_at,
    ends_at: booking.ends_at,
    payment_url: checkoutUrl.toString(),
    payment_status: "pending",
    message: "Reservation created. Payment is due within 24 hours. The studio access guide is sent only after payment is confirmed.",
  }, 201, origin);
});
