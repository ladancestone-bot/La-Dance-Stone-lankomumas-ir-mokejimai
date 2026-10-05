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
      return Response.json({ received: true, duplicate: true });
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
    return Response.json({ received: true, rental_paid: true });
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

  const stripePaymentId = session.payment_intent
    ? String(session.payment_intent)
    : session.id;

  const { data: existing } = await supabaseAdmin
    .from("drop_in_bookings")
    .select("id")
    .eq("stripe_payment_id", stripePaymentId)
    .maybeSingle();

  if (existing) {
    return Response.json({ received: true, duplicate: true });
  }

  const details = session.customer_details;
  const email = details?.email ?? session.customer_email ?? null;
  const name = details?.name?.trim() || "Website participant";
  const parts = name.split(/\s+/);
  const firstName = parts.shift() || "Website";
  const lastName = parts.join(" ") || "participant";
  const phone = details?.phone ?? null;

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