import Stripe from "npm:stripe@^22";
import { createClient } from "npm:@supabase/supabase-js@2";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
  apiVersion: "2025-03-31.basil",
});
const cryptoProvider = Stripe.createSubtleCryptoProvider();

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const GUIDE_ID = "1vjPK0VMwq0Kuxk5lIQfucvHcBPLJ9paa";
const GUIDE_URL = "https://drive.google.com/file/d/" + GUIDE_ID + "/view?usp=sharing";
async function getGuideAttachment(): Promise<{filename:string;content:string}|null> {
  try {
    const res = await fetch("https://drive.google.com/uc?export=download&id=" + GUIDE_ID);
    if (!res.ok) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.length < 4 || String.fromCharCode(...bytes.subarray(0, 4)) !== "%PDF") return null;
    let binary = "";
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return { filename: "La-Dance-Stone-atmintine.pdf", content: btoa(binary) };
  } catch (error) { console.error("Could not attach studio guide", error); return null; }
}
async function sendRentalPaidConfirmation(rental: any, email: string | null): Promise<boolean> {
  if (!email) return false;
  const guideAttachment = await getGuideAttachment();
  const name = String(rental.customer_name || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const html = "<div style='font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#30271f;line-height:1.7;text-align:left'><div style='text-align:center;padding:8px 0 22px;border-bottom:1px solid #e5d8c7;margin-bottom:24px'><div style='font-family:Georgia,serif;font-size:25px;color:#481824'>La Dance Stone</div><div style='margin-top:6px;font-size:11px;font-weight:bold;letter-spacing:2px;color:#a9894d'>ŠOKIŲ STUDIJA</div></div><p>Sveiki, " + name + "!</p><h2 style='font-family:Georgia,serif;color:#481824'>Rezervacija patvirtinta</h2><p>Gavome jūsų apmokėjimą. Jūsų studijos nuomos rezervacija patvirtinta.</p><p><strong>Studijos adresas:</strong> V. Krėvės pr. 57, Kaunas.</p><p>Atvykimo ir naudojimosi studija instrukcijas rasite pridedamoje PDF atmintinėje. Rekomenduojame ją perskaityti prieš atvykstant.</p><p>Jei turite klausimų, rašykite <a href='mailto:info@ladancestone.lt'>info@ladancestone.lt</a> arba atsakykite į šį laišką.</p><p>Iki susitikimo!<br><strong>La Dance Stone šokių studija</strong></p>" + (guideAttachment ? "" : "<p><a href='" + GUIDE_URL + "'>Atidaryti studijos naudojimosi atmintinę</a></p>") + "</div>";
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: "Bearer " + (Deno.env.get("RESEND_API_KEY") ?? ""), "Content-Type": "application/json", "Idempotency-Key": "rental-paid-" + rental.id },
    body: JSON.stringify({ from: "La Dance Stone šokių studija <info@ladancestone.lt>", to: [email], reply_to: "info@ladancestone.lt", subject: "Nuomos rezervacija patvirtinta – La Dance Stone šokių studija", html, attachments: guideAttachment ? [guideAttachment] : undefined }),
  });
  if (!res.ok) { console.error("Paid rental confirmation email failed", rental.id, res.status, (await res.text()).slice(0, 500)); return false; }
  return true;
}
Deno.serve(async (req) => {
  const signature = req.headers.get("stripe-signature") ?? "";
  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      body,
      signature,
      Deno.env.get("STRIPE_WEBHOOK_SECRET")!,
      undefined,
      cryptoProvider,
    );
  } catch (err) {
    console.error("Stripe signature verification failed:", err);
    return new Response("bad signature", { status: 400 });
  }

  if (event.type === "invoice.paid") {
    const invoice = event.data.object as Stripe.Invoice;
    const metadata = invoice.metadata ?? {};
    if (metadata.monthly_charge_id) {
      const stripePaymentId = invoice.payment_intent ? String(invoice.payment_intent) : String(invoice.id);
      const { data: charge } = await supabaseAdmin.from("monthly_charges").select("id,student_id,amount_due,amount_paid,payer_id").eq("id",metadata.monthly_charge_id).maybeSingle();
      if (!charge) return new Response("charge not found",{status:404});
      const { data: existingPayment } = await supabaseAdmin.from("payments").select("id").eq("stripe_payment_id",stripePaymentId).maybeSingle();
      if (existingPayment) return Response.json({received:true,duplicate:true});
      const amount=Math.min(Number(invoice.amount_paid||0)/100,Math.max(0,Number(charge.amount_due)-Number(charge.amount_paid)));
      if(amount<=0)return Response.json({received:true,already_paid:true});
      const newPaid=Number(charge.amount_paid)+amount;
      const status=newPaid>=Number(charge.amount_due)?"paid":"partially_paid";
      const {error:updateError}=await supabaseAdmin.from("monthly_charges").update({amount_paid:newPaid,status,updated_at:new Date().toISOString()}).eq("id",charge.id);
      if(updateError)return new Response("charge update failed",{status:500});
      const {error:paymentError}=await supabaseAdmin.from("payments").insert({monthly_charge_id:charge.id,student_id:charge.student_id,amount,payment_method:"stripe",paid_at:new Date().toISOString(),stripe_payment_id:stripePaymentId,received_by:null,payer_id:charge.payer_id||null,notes:"Stripe Invoice"});
      if(paymentError)return new Response("payment creation failed",{status:500});
    }
    return Response.json({received:true});
  }
  if (event.type !== "checkout.session.completed") {
    return Response.json({ received: true });
  }

  const session = event.data.object as Stripe.Checkout.Session;
  const stripePaymentId = session.payment_intent ? String(session.payment_intent) : session.id;
  const metadata = session.metadata ?? {};
  const amountTotal = Number(session.amount_total || 0) / 100;
  const details = session.customer_details;
  const payerEmail = details?.email ?? session.customer_email ?? null;
  const payerName = details?.name ?? null;
  const paymentKind = amountTotal === 5 ? "reservation_fee" : (metadata.payment_kind || "unknown");

  await supabaseAdmin.from("stripe_payments").upsert({
    stripe_payment_id: stripePaymentId,
    amount: amountTotal,
    currency: session.currency || "eur",
    status: session.payment_status || "paid",
    payer_name: payerName,
    payer_email: payerEmail,
    paid_at: new Date().toISOString(),
    payment_kind: paymentKind,
    monthly_charge_id: metadata.monthly_charge_id || null,
    rental_id: metadata.rental_id || null,
    metadata,
    updated_at: new Date().toISOString(),
  }, { onConflict: "stripe_payment_id" });

  // Handle class registration payments before the generic €5 early return.
  // The €5 group registration fee and €10 single lesson must update website_orders.
  if (
    (metadata.payment_kind === "reservation_fee" || metadata.payment_kind === "single_lesson") &&
    metadata.registration_id
  ) {
    const expectedAmount = metadata.payment_kind === "reservation_fee" ? 5 : 10;
    if (session.payment_status !== "paid") {
      return Response.json({ received: true, class_registration_payment_status: session.payment_status });
    }
    if (Math.abs(amountTotal - expectedAmount) > 0.01) {
      console.error("Class registration payment amount mismatch", {
        registration_id: metadata.registration_id,
        expectedAmount,
        amountTotal,
      });
      return new Response("class registration payment amount mismatch", { status: 400 });
    }
    const sourceKey = "class-registration:" + String(metadata.registration_id);
    const { data: order, error: orderLookupError } = await supabaseAdmin
      .from("website_orders")
      .select("id,raw_data,paid_text")
      .eq("source_key", sourceKey)
      .eq("order_type", "class_registration")
      .maybeSingle();
    if (orderLookupError) {
      console.error("Class registration order lookup failed", orderLookupError);
      return new Response("class registration order lookup failed", { status: 500 });
    }
    if (!order) {
      console.error("Class registration order not found", sourceKey);
      return new Response("class registration order not found", { status: 404 });
    }
    const existingRawData = order.raw_data && typeof order.raw_data === "object" ? order.raw_data : {};
    const { error: orderUpdateError } = await supabaseAdmin
      .from("website_orders")
      .update({
        paid_text: "Apmokėta",
        status: "paid",
        raw_data: {
          ...existingRawData,
          stripe_payment_id: stripePaymentId,
          stripe_checkout_session_id: session.id,
          stripe_payment_status: session.payment_status,
          paid_at: new Date().toISOString(),
          payment_kind: metadata.payment_kind,
        },
      })
      .eq("id", order.id);
    if (orderUpdateError) {
      console.error("Class registration payment update failed", orderUpdateError);
      return new Response("class registration payment update failed", { status: 500 });
    }
    return Response.json({ received: true, class_registration_paid: true, registration_id: metadata.registration_id });
  }

  // €5 is the group reservation fee, not the one-off lesson payment.
  if (amountTotal === 5) {
    return Response.json({ received: true, reservation_fee: true });
  }

  if (metadata.payment_kind === "rental" && metadata.rental_id) {
    const { data: rental, error: rentalError } = await supabaseAdmin
      .from("studio_rentals")
      .select("id,customer_name,customer_email,customer_phone,price,payment_status,stripe_payment_id")
      .eq("id", metadata.rental_id)
      .maybeSingle();

    if (rentalError || !rental) return new Response("rental not found", { status: 404 });
    if (rental.stripe_payment_id === stripePaymentId || rental.payment_status === "paid") {
      const duplicateEmail = details?.email ?? session.customer_email ?? rental.customer_email ?? null;
      const sent = await sendRentalPaidConfirmation(rental, duplicateEmail);
      if (!sent) return new Response("paid rental confirmation email failed", { status: 500 });
      return Response.json({ received: true, duplicate: true, confirmation_email_sent: true });
    }

    const paymentStatus = session.payment_status || "paid";
    if (paymentStatus !== "paid") {
      await supabaseAdmin.from("studio_rentals").update({ stripe_payment_status: paymentStatus }).eq("id", rental.id);
      return Response.json({ received: true, payment_status: paymentStatus });
    }

    const amount = Number(session.amount_total || 0) / 100;
    if (amount <= 0 || Math.abs(amount - Number(rental.price)) > 0.01) {
      return new Response("rental payment amount mismatch", { status: 400 });
    }

    const details = session.customer_details;
    const email = details?.email ?? session.customer_email ?? rental.customer_email ?? null;
    const phone = details?.phone ?? rental.customer_phone ?? null;

    const { error: updateError } = await supabaseAdmin.from("studio_rentals").update({
      payment_status: "paid",
      payment_method: "stripe",
      stripe_payment_id: stripePaymentId,
      stripe_payment_status: "paid",
      paid_at: new Date().toISOString(),
      customer_email: email,
      customer_phone: phone,
    }).eq("id", rental.id);

    if (updateError) return new Response("rental update failed", { status: 500 });
    const sent = await sendRentalPaidConfirmation(rental, email);
    if (!sent) return new Response("paid rental confirmation email failed", { status: 500 });
    return Response.json({ received: true, rental_paid: true, confirmation_email_sent: true });
  }
  if (metadata.payment_kind === "monthly_charge" && metadata.monthly_charge_id) {
    const { data: charge, error: chargeError } = await supabaseAdmin
      .from("monthly_charges")
      .select("id,student_id,amount_due,amount_paid,payer_id")
      .eq("id", metadata.monthly_charge_id)
      .maybeSingle();
    if (chargeError || !charge) return new Response("charge not found", { status: 404 });
    if (Number(charge.amount_due) <= Number(charge.amount_paid)) return Response.json({ received: true, already_paid: true });
    const amount = Number(charge.amount_due) - Number(charge.amount_paid);
    const { data: existingPayment } = await supabaseAdmin.from("payments").select("id").eq("stripe_payment_id", stripePaymentId).maybeSingle();
    if (existingPayment) return Response.json({ received: true, duplicate: true });
    const newPaid = Number(charge.amount_paid) + amount;
    const status = newPaid >= Number(charge.amount_due) ? "paid" : "partially_paid";
    const { error: updateError } = await supabaseAdmin.from("monthly_charges").update({ amount_paid: newPaid, status, updated_at: new Date().toISOString() }).eq("id", charge.id);
    if (updateError) return new Response("charge update failed", { status: 500 });
    const { error: paymentError } = await supabaseAdmin.from("payments").insert({
      monthly_charge_id: charge.id, student_id: charge.student_id, amount,
      payment_method: "stripe", paid_at: new Date().toISOString(),
      stripe_payment_id: stripePaymentId, received_by: null,
      payer_id: metadata.payer_id || charge.payer_id || null, notes: "Stripe Checkout"
    });
    if (paymentError) return new Response("payment creation failed", { status: 500 });
    return Response.json({ received: true });
  }

  if (metadata.payment_kind !== "drop_in" || !metadata.drop_in_lesson_id) {
    return Response.json({ received: true, ignored: true });
  }

  const { data: existing } = await supabaseAdmin
    .from("drop_in_bookings")
    .select("id")
    .eq("stripe_payment_id", stripePaymentId)
    .maybeSingle();

  if (existing) {
    return Response.json({ received: true, duplicate: true });
  }

  const dropInDetails = session.customer_details;
  const email = dropInDetails?.email ?? session.customer_email ?? null;
  const name = dropInDetails?.name?.trim() || "Website participant";
  const parts = name.split(/\s+/);
  const firstName = parts.shift() || "Website";
  const lastName = parts.join(" ") || "participant";
  const phone = dropInDetails?.phone ?? null;

  let studentId = metadata.student_id || null;

  if (!studentId && email) {
    const { data: existingStudent } = await supabaseAdmin
      .from("students")
      .select("id")
      .ilike("email", email)
      .limit(1)
      .maybeSingle();
    studentId = existingStudent?.id ?? null;
  }

  if (!studentId) {
    const { data: newStudent, error: studentError } = await supabaseAdmin
      .from("students")
      .insert({
        first_name: firstName,
        last_name: lastName,
        email,
        phone,
        registration_date: new Date().toISOString().slice(0, 10),
        notes: "Created automatically from a paid drop-in website booking.",
      })
      .select("id")
      .single();

    if (studentError) {
      console.error("Student creation failed:", studentError);
      return new Response("student creation failed", { status: 500 });
    }
    studentId = newStudent.id;
  }

  const { error } = await supabaseAdmin
    .from("drop_in_bookings")
    .insert({
      lesson_id: metadata.drop_in_lesson_id,
      student_id: studentId,
      first_name: firstName,
      last_name: lastName,
      email,
      phone,
      status: "paid",
      payment_method: "stripe",
      stripe_payment_id: stripePaymentId,
      source: "stripe",
      notes: metadata.notes ?? null,
    });

  if (error) {
    console.error("Drop-in booking creation failed:", error);
    return new Response("booking creation failed", { status: 500 });
  }

  return Response.json({ received: true });
});