import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
    status, headers: { ...cors, "Content-Type": "application/json" },
  });

  try {
    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const userResult = await admin.auth.getUser(auth.slice(7));
    const user = userResult.data.user;
    if (userResult.error || !user) return json({ error: "Unauthorized" }, 401);

    const roles = (await admin.from("user_roles").select("role").eq("user_id", user.id)).data || [];
    if (!roles.some((r: any) => r.role === "admin")) return json({ error: "Admin role required" }, 403);

    const body = await req.json();
    const rentalId = String(body?.rental_id || "");
    if (!rentalId) return json({ error: "rental_id is required" }, 400);

    const { data: rental, error: rentalError } = await admin
      .from("studio_rentals")
      .select("*")
      .eq("id", rentalId)
      .single();

    if (rentalError || !rental) return json({ error: "Rental not found" }, 404);

    const apiKey = Deno.env.get("INVOICE123_API_KEY");
    if (!apiKey) return json({ error: "INVOICE123_API_KEY is not configured" }, 500);

    const headers = {
      Authorization: "Bearer " + apiKey,
      Accept: "application/json",
      "Content-Type": "application/json",
    };

    const settingsRes = await fetch("https://app.invoice123.com/api/v1.0/woocommerce/settings", { headers });
    const settingsBody = await settingsRes.json().catch(() => ({}));
    if (!settingsRes.ok) return json({
      error: "Invoice123 settings request failed",
      http_status: settingsRes.status,
      details: settingsBody,
    }, 502);

    const settings = settingsBody?.data || settingsBody;
    if (!settings.series_id) return json({ error: "No Invoice123 invoice series is mapped to this API key." }, 502);

    const amount = Number(rental.price);
    if (!Number.isFinite(amount) || amount <= 0) return json({ error: "Invalid rental price" }, 400);

    const starts = new Date(rental.starts_at);
    const date = rental.invoice_created_at
      ? String(rental.invoice_created_at).slice(0, 10)
      : new Date().toISOString().slice(0, 10);

    const payment = rental.payment_status === "paid"
      ? [{
          total: amount.toFixed(2),
          date: new Date(rental.paid_at || new Date().toISOString()).toISOString().slice(0, 10),
          type: rental.payment_method === "stripe" ? "card" : "cash",
        }]
      : [];

    const invoicePayload: Record<string, unknown> = {
      type: "simple",
      series_id: settings.series_id,
      activity_id: settings.activity_id || null,
      date,
      date_due_show: settings.date_due_show ?? true,
      total: amount.toFixed(2),
      issued_by: settings.issued_by,
      issued_to: rental.customer_name,
      note_enabled: true,
      note: "La Dance Stone - studijos nuoma - " + rental.rental_type,
      products: [{
        title: "La Dance Stone - studijos nuoma - " + starts.toISOString().slice(0, 10),
        price: amount.toFixed(2),
        quantity: 1,
        total_discount: "0",
        total_vat: "0.00",
        total_vat_wo_discount: "0.00",
        total_wo_vat_and_discount: amount.toFixed(2),
        total: amount.toFixed(2),
        unit_id: settings.unit_id,
      }],
      client: {
        name: rental.customer_name,
        code_type: "personal",
        ...(rental.customer_email ? { email: rental.customer_email } : {}),
        ...(rental.customer_phone ? { phone: rental.customer_phone } : {}),
        country_code: "LT",
      },
      banks: settings.bank_id ? [settings.bank_id] : [],
      payments: payment,
      send_email: false,
      language: "lt",
      template_id: settings.template_id,
      save_client: settings.save_client ?? true,
      versions: [{ supabase_app: "La Dance Stone", integration: "Supabase Edge Function" }],
    };

    const existingId = rental.saskaita123_invoice_id;
    const invoiceRes = existingId
      ? await fetch("https://app.invoice123.com/api/v1.0/invoices/" + encodeURIComponent(existingId), {
          method: "PATCH", headers, body: JSON.stringify(invoicePayload),
        })
      : await fetch("https://app.invoice123.com/api/v1.0/invoices", {
          method: "POST", headers, body: JSON.stringify(invoicePayload),
        });

    const invoiceBody = await invoiceRes.json().catch(() => ({}));
    if (!invoiceRes.ok) {
      const summary = JSON.stringify(invoiceBody).slice(0, 4000);
      await admin.from("studio_rentals").update({
        saskaita123_invoice_error: summary,
        saskaita123_synced_at: new Date().toISOString(),
      }).eq("id", rental.id);
      return json({ error: "Invoice123 rejected the invoice", details: invoiceBody }, 502);
    }

    const invoice = invoiceBody?.data || invoiceBody;
    const invoiceId = String(invoice?.id || invoice?.invoice_id || existingId || "");
    if (!invoiceId) return json({ error: "Invoice123 returned no invoice ID", response: invoiceBody }, 502);

    const now = new Date().toISOString();
    const update = {
      saskaita123_invoice_id: invoiceId,
      saskaita123_invoice_number: invoice?.number || invoice?.invoice_number || rental.saskaita123_invoice_number || null,
      saskaita123_invoice_url: invoice?.url || invoice?.invoice_url || rental.saskaita123_invoice_url || null,
      saskaita123_synced_at: now,
      saskaita123_invoice_error: null,
      invoice_created_at: rental.invoice_created_at || now,
    };
    const updateResult = await admin.from("studio_rentals").update(update).eq("id", rental.id);
    if (updateResult.error) throw updateResult.error;

    return json({
      ok: true,
      invoice_id: invoiceId,
      invoice_number: update.saskaita123_invoice_number,
      invoice_url: update.saskaita123_invoice_url,
      paid: rental.payment_status === "paid",
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
