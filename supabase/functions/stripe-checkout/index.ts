import Stripe from "npm:stripe@^22";
import { createClient } from "npm:@supabase/supabase-js@2";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", { apiVersion: "2025-03-31.basil" });
const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  let body: any;
  try { body = await req.json(); } catch { return new Response("Invalid JSON", { status: 400 }); }

  const kind = body?.payment_kind;
  const payer = body?.payer ?? {};

  if (kind === "rental") {
    const rentalId = String(body?.rental_id || "");
    if (!rentalId) return Response.json({ error: "rental_id is required" }, { status: 400 });

    const { data: rental, error } = await supabase
      .from("studio_rentals")
      .select("id,customer_name,customer_email,customer_phone,price,payment_status,payment_method")
      .eq("id", rentalId)
      .maybeSingle();

    if (error || !rental) return Response.json({ error: "Rental not found" }, { status: 404 });
    if (rental.payment_status === "paid") return Response.json({ error: "This rental is already paid" }, { status: 400 });

    const email = String(payer.email || rental.customer_email || "").trim();
    if (!email) return Response.json({ error: "Customer email is required" }, { status: 400 });

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: email,
      client_reference_id: rentalId,
      line_items: [{
        quantity: 1,
        price_data: {
          currency: "eur",
          unit_amount: Math.round(Number(rental.price) * 100),
          product_data: { name: ("La Dance Stone – studijos nuoma – " + rental.customer_name).trim() },
        },
      }],
      payment_intent_data: {
        receipt_email: email,
        metadata: { payment_kind: "rental", rental_id: rentalId },
      },
      metadata: { payment_kind: "rental", rental_id: rentalId },
      success_url: body.success_url || "https://lankomumas-ir-mokejimas.netlify.app/?rental_payment=success",
      cancel_url: body.cancel_url || "https://lankomumas-ir-mokejimas.netlify.app/?rental_payment=cancelled",
    });

    await supabase.from("studio_rentals").update({
      payment_method: "stripe",
      stripe_checkout_session_id: session.id,
      stripe_payment_status: "unpaid",
    }).eq("id", rentalId);

    return Response.json({ checkout_url: session.url, session_id: session.id });
  }

  const chargeId = body?.monthly_charge_id;
  if (kind !== "monthly_charge" || !chargeId) {
    return Response.json({ error: "payment_kind=monthly_charge and monthly_charge_id are required" }, { status: 400 });
  }

  const { data: charge, error } = await supabase
    .from("monthly_charges")
    .select("id,student_id,amount_due,amount_paid,month,students(first_name,last_name,email,parent_email,parent_name)")
    .eq("id", chargeId).maybeSingle();

  if (error || !charge) return Response.json({ error: "Monthly charge not found" }, { status: 404 });

  const remaining = Number(charge.amount_due) - Number(charge.amount_paid);
  if (remaining <= 0) return Response.json({ error: "This charge is already paid" }, { status: 400 });

  const email = String(payer.email || charge.students?.parent_email || charge.students?.email || "").trim();
  if (!email) return Response.json({ error: "Payer email is required" }, { status: 400 });

  const fullName = String(payer.full_name || charge.students?.parent_name || ((charge.students?.first_name || "") + " " + (charge.students?.last_name || ""))).trim();
  let payerId: string | null = null;
  const { data: existingPayer } = await supabase.from("payers").select("id").ilike("email", email).limit(1).maybeSingle();
  if (existingPayer) payerId = existingPayer.id;
  else {
    const { data: newPayer, error: payerError } = await supabase.from("payers").insert({ full_name: fullName || "Payer", email, phone: payer.phone || null }).select("id").single();
    if (payerError) return Response.json({ error: "Could not create payer" }, { status: 500 });
    payerId = newPayer.id;
  }
  await supabase.from("monthly_charges").update({ payer_id: payerId }).eq("id", chargeId);

  const studentName = ((charge.students?.first_name || "") + " " + (charge.students?.last_name || "")).trim();
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: email,
    line_items: [{ quantity: 1, price_data: { currency: "eur", unit_amount: Math.round(remaining * 100), product_data: { name: ("La Dance Stone – " + studentName + " – " + charge.month).trim() } } }],
    metadata: { payment_kind: "monthly_charge", monthly_charge_id: chargeId, student_id: charge.student_id, payer_id: payerId },
    success_url: body.success_url || "https://lankomumas-ir-mokejimas.netlify.app/?payment=success",
    cancel_url: body.cancel_url || "https://lankomumas-ir-mokejimas.netlify.app/?payment=cancelled",
  });
  return Response.json({ checkout_url: session.url, session_id: session.id });
});