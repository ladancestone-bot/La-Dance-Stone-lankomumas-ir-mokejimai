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
    if (!auth || !auth.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const userResult = await admin.auth.getUser(auth.slice(7));
    const user = userResult.data.user;
    if (userResult.error || !user) return json({ error: "Unauthorized" }, 401);

    const roleResult = await admin.from("user_roles").select("role").eq("user_id", user.id);
    const roles = roleResult.data || [];
    const isAdmin = roles.some((r: any) => r.role === "admin");
    const isTeacher = roles.some((r: any) => r.role === "teacher");
    if (!isAdmin && !isTeacher) return json({ error: "Studio role required" }, 403);

    const body = await req.json();
    const monthlyChargeId = String(body?.monthly_charge_id || "");
    if (!monthlyChargeId) return json({ error: "monthly_charge_id is required" }, 400);

    const chargeResult = await admin.from("monthly_charges").select(
      "id,student_id,group_id,month,amount_due,amount_paid,due_date,description,saskaita123_invoice_id,saskaita123_invoice_number,saskaita123_invoice_url,invoice123_id,invoice123_number,invoice123_url,invoice_created_at,students(first_name,last_name,email,phone,parent_name,parent_email,parent_phone,payment_preference),groups(name)"
    ).eq("id", monthlyChargeId).single();
    const charge = chargeResult.data;
    if (chargeResult.error || !charge) return json({ error: "Monthly charge not found" }, 404);

    if (isTeacher) {
      const teacherResult = await admin.from("teachers").select("id").eq("profile_id", user.id).maybeSingle();
      const teacher = teacherResult.data;
      const linkResult = teacher
        ? await admin.from("group_teachers").select("group_id").eq("teacher_id", teacher.id).eq("group_id", charge.group_id).maybeSingle()
        : { data: null };
      if (!linkResult.data) return json({ error: "Teacher is not assigned to this group" }, 403);
    }

    const existingId = charge.saskaita123_invoice_id || charge.invoice123_id;

    const apiKey = Deno.env.get("INVOICE123_API_KEY");
    if (!apiKey) return json({ error: "INVOICE123_API_KEY is not configured" }, 500);

    const headers = {
      Authorization: "Bearer " + apiKey,
      Accept: "application/json",
      "Content-Type": "application/json",
    };

    const settingsRes = await fetch("https://app.invoice123.com/api/v1.0/woocommerce/settings", { headers });
    const settingsBody = await settingsRes.json().catch(() => ({}));

    if (!settingsRes.ok) {
      const raw = JSON.stringify(settingsBody);
      const msg = settingsBody?.data || settingsBody?.message || settingsBody?.error || raw || "Invoice123 settings request failed.";
      const diagnostic = `Invoice123 settings request failed: HTTP ${settingsRes.status} ${settingsRes.statusText}. Response: ${String(raw).slice(0, 1500)}`;
      await admin.from("monthly_charges").update({
        saskaita123_invoice_error: diagnostic.slice(0, 2000),
        invoice123_error: diagnostic.slice(0, 2000),
        invoice123_synced_at: new Date().toISOString(),
      }).eq("id", charge.id);
      await admin.from("invoice123_sync_log").insert({
        monthly_charge_id: charge.id, action: "create", status: "error", response_summary: diagnostic.slice(0, 2000),
      });
      return json({ error: String(msg), http_status: settingsRes.status, http_status_text: settingsRes.statusText, invoice123_response: settingsBody }, 502);
    }

    const settings = settingsBody?.data || settingsBody;
    const student = charge.students || {};
    if (student.payment_preference === "cash") {
      return json({ ok: true, skipped: true, reason: "cash_payment_preference", message: "Cash payment preference: Invoice123 invoice not created." });
    }
    const groupName = charge.groups?.name || "Šokių pamokos";
    const month = String(charge.month).slice(0, 7);
    const email = student.email || student.parent_email || null;
    const phone = student.phone || student.parent_phone || null;
    const clientName = [student.first_name, student.last_name].filter(Boolean).join(" ").trim() || student.parent_name || "La Dance Stone klientas";
    const amount = Number(charge.amount_due);
    if (!Number.isFinite(amount) || amount <= 0) return json({ error: "Invalid charge amount" }, 400);
    if (!settings.series_id) return json({ error: "Invoice123 API key works, but no invoice series is mapped to this API key." }, 502);

    const paymentsResult = await admin
      .from("payments")
      .select("id,amount,payment_method,paid_at")
      .eq("monthly_charge_id", charge.id)
      .neq("payment_method", "cash")
      .order("paid_at", { ascending: true });

    if (paymentsResult.error) throw paymentsResult.error;

    const invoicePayments = (paymentsResult.data || []).map((p: any) => ({
      total: Number(p.amount).toFixed(2),
      date: new Date(p.paid_at || new Date().toISOString()).toISOString().slice(0, 10),
      type: p.payment_method === "stripe" ? "card" : "transfer",
    }));

    const invoiceDate = charge.invoice_created_at
      ? String(charge.invoice_created_at).slice(0, 10)
      : new Date().toISOString().slice(0, 10);

    const invoicePayload: Record<string, unknown> = {
      type: "simple",
      series_id: settings.series_id,
      activity_id: settings.activity_id || null,
      date: invoiceDate,
      date_due_show: settings.date_due_show ?? true,
      total: amount.toFixed(2),
      issued_by: settings.issued_by,
      issued_to: clientName,
      note_enabled: true,
      note: "La Dance Stone - " + groupName + " - abonementas už " + month,
      products: [{
        title: groupName + " - šokių pamokos - " + month,
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
        name: clientName,
        code_type: "personal",
        ...(email ? { email } : {}),
        ...(phone ? { phone } : {}),
        country_code: "LT",
      },
      banks: settings.bank_id ? [settings.bank_id] : [],
      payments: invoicePayments,
      send_email: false,
      language: "lt",
      template_id: settings.template_id,
      save_client: settings.save_client ?? true,
      versions: [{ supabase_app: "La Dance Stone", integration: "Supabase Edge Function" }],
    };

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
      await admin.from("monthly_charges").update({
        saskaita123_invoice_error: summary,
        invoice123_error: summary,
        invoice123_synced_at: new Date().toISOString(),
      }).eq("id", charge.id);
      await admin.from("invoice123_sync_log").insert({
        monthly_charge_id: charge.id, action: "create", status: "error", response_summary: summary,
      });
      return json({ error: "Invoice123 rejected the invoice", details: invoiceBody }, 502);
    }

    const invoice = invoiceBody?.data || invoiceBody;
    const invoiceId = String(invoice?.id || invoice?.invoice_id || existingId || "");
    const invoiceNumber = invoice?.number || invoice?.invoice_number || charge.saskaita123_invoice_number || charge.invoice123_number || null;
    const invoiceUrl = invoice?.url || invoice?.invoice_url || charge.saskaita123_invoice_url || charge.invoice123_url || null;

    if (!invoiceId) {
      const summary = JSON.stringify(invoiceBody).slice(0, 4000);
      await admin.from("invoice123_sync_log").insert({
        monthly_charge_id: charge.id, action: "create", status: "error",
        response_summary: "Invoice123 returned success but no invoice id: " + summary,
      });
      return json({ error: "Invoice123 returned no invoice ID", response: invoiceBody }, 502);
    }

    const now = new Date().toISOString();
    const update = {
      invoice_created_at: now,
      saskaita123_invoice_id: invoiceId,
      saskaita123_invoice_number: invoiceNumber,
      saskaita123_invoice_url: invoiceUrl,
      saskaita123_synced_at: now,
      saskaita123_invoice_error: null,
      invoice123_id: invoiceId,
      invoice123_number: invoiceNumber,
      invoice123_url: invoiceUrl,
      invoice123_status: invoice?.status || invoice?.state || (existingId ? charge.invoice123_status : "created"),
      invoice123_error: null,
      invoice123_synced_at: now,
    };

    const updateResult = await admin.from("monthly_charges").update(update).eq("id", charge.id);
    if (updateResult.error) throw updateResult.error;

    await admin.from("invoice123_sync_log").insert({
      monthly_charge_id: charge.id, action: existingId ? "payment_sync" : "create", status: "success",
      invoice123_id: invoiceId, invoice123_number: invoiceNumber,
      response_summary: JSON.stringify({ id: invoiceId, number: invoiceNumber, url: invoiceUrl, email_sent: Boolean(email) }).slice(0, 2000),
    });

    return json({ ok: true, already_exists: Boolean(existingId), payment_sync: invoicePayments.length > 0, invoice_id: invoiceId, invoice_number: invoiceNumber, invoice_url: invoiceUrl, email_sent: false });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});