import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { Resend } from "npm:resend@4.0.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type BookingEmailRequest = {
  recipient: string;
  customerName: string;
  bookingType: "class" | "subscription" | "rental";
  bookingDate?: string;
  startTime?: string;
  endTime?: string;
  durationHours?: number;
  amountEur: number;
  paymentStatus: "pending" | "paid";
  paymentUrl?: string;
  bookingReference: string;
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char] ?? char);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Keep JWT verification enabled. This function is a server-side building block;
  // the public booking endpoint must validate availability and persist the booking
  // before invoking it. Do not disable auth to make browser calls work.
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "Email service is not configured" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let data: BookingEmailRequest;
  try {
    data = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (
    typeof data.recipient !== "string" ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.recipient) ||
    typeof data.customerName !== "string" || !data.customerName.trim() ||
    !["class", "subscription", "rental"].includes(data.bookingType) ||
    !["pending", "paid"].includes(data.paymentStatus) ||
    typeof data.bookingReference !== "string" || !data.bookingReference.trim() ||
    !Number.isFinite(data.amountEur) || data.amountEur < 0
  ) {
    return new Response(JSON.stringify({ error: "Invalid booking email fields" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Private studio access details are intentionally never included in this email.
  // A separate payment-confirmed, audited delivery flow must handle the private guide.
  const typeLabel = data.bookingType === "rental"
    ? "Studijos nuoma"
    : data.bookingType === "subscription" ? "Šokių abonementas" : "Vienkartinė pamoka";
  const dateLine = data.bookingDate ? `<p><strong>Data:</strong> ${escapeHtml(data.bookingDate)}</p>` : "";
  const timeLine = data.startTime
    ? `<p><strong>Laikas:</strong> ${escapeHtml(data.startTime)}${data.endTime ? `–${escapeHtml(data.endTime)}` : ""}</p>`
    : "";
  const pendingRentalNotice = data.bookingType === "rental" && data.paymentStatus !== "paid"
    ? "<p style=\"padding:14px;background:#f5eadb;border-radius:10px\">Nuomos apmokėjimas turi būti atliktas per 24 valandas. Patekimo instrukcijos siunčiamos tik patvirtinus apmokėjimą. Jei mokėsite grynaisiais, susisiekite telefonu +370 655 67797.</p>"
    : "";
  const paymentLine = data.paymentStatus === "paid"
    ? "<p><strong>Mokėjimas:</strong> patvirtintas</p>"
    : `<p><strong>Mokėjimas:</strong> laukiamas</p>${data.paymentUrl ? `<p><a href="${escapeHtml(data.paymentUrl)}" style="display:inline-block;background:#3a2a20;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none">Apmokėti rezervaciją</a></p>` : ""}`;

  const resend = new Resend(apiKey);
  const { data: sent, error } = await resend.emails.send({
    from: "La Dance Stone <info@ladancestone.lt>",
    to: [data.recipient],
    subject: `La Dance Stone – ${typeLabel.toLowerCase()} (${data.bookingReference})`,
    html: `<!doctype html><html lang="lt"><body style="margin:0;background:#f6f0e6;font-family:Arial,sans-serif;color:#261b15;padding:24px"><div style="max-width:600px;margin:auto;background:#fbf8f2;border:1px solid #d9c7ad;border-radius:18px;padding:28px"><p style="letter-spacing:3px;font-size:12px;color:#8b7764">LA DANCE STONE</p><h1 style="font-family:Georgia,serif;font-weight:normal">Rezervacijos informacija</h1><p>Sveiki, ${escapeHtml(data.customerName)}!</p><p>Gavome informaciją apie jūsų rezervaciją.</p><p><strong>Paslauga:</strong> ${typeLabel}</p>${dateLine}${timeLine}<p><strong>Suma:</strong> ${data.amountEur.toFixed(2)} €</p><p><strong>Rezervacijos numeris:</strong> ${escapeHtml(data.bookingReference)}</p>${paymentLine}${pendingRentalNotice}<p style="margin-top:28px;color:#8b7764;font-size:12px">La Dance Stone · info@ladancestone.lt</p></div></body></html>`,
  });

  if (error) {
    return new Response(JSON.stringify({ error: "Email delivery failed" }), {
      status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ ok: true, id: sent?.id ?? null }), {
    status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
