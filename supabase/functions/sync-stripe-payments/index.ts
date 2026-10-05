import Stripe from "npm:stripe@^22";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";

const stripeSecret = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
const stripe = stripeSecret ? new Stripe(stripeSecret, { apiVersion: "2025-03-31.basil" }) : null;
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

function normalizeEmail(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}
function normalizePhone(value: unknown) {
  return String(value ?? "").replace(/\D/g, "");
}
function normalizeName(value: unknown) {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}
function classify(amount: number, metadata: Record<string, string>) {
  if (amount === 5) return "reservation_fee";
  if (metadata.payment_kind === "rental") return "rental";
  if (metadata.payment_kind === "monthly_charge") return "monthly_charge";
  if (metadata.payment_kind === "drop_in") return "drop_in";
  return metadata.payment_kind || "unknown";
}

async function findStudentIds(payerEmail: string, payerPhone: string, payerName: string) {
  const ids = new Set<string>();
  if (payerEmail) {
    const [a, b] = await Promise.all([
      supabaseAdmin.from("students").select("id").ilike("email", payerEmail).limit(10),
      supabaseAdmin.from("students").select("id").ilike("parent_email", payerEmail).limit(10),
    ]);
    for (const row of [...(a.data ?? []), ...(b.data ?? [])]) ids.add(row.id);
  }
  if (payerPhone) {
    const [a, b] = await Promise.all([
      supabaseAdmin.from("students").select("id").eq("phone", payerPhone).limit(10),
      supabaseAdmin.from("students").select("id").eq("parent_phone", payerPhone).limit(10),
    ]);
    for (const row of [...(a.data ?? []), ...(b.data ?? [])]) ids.add(row.id);
  }
  if (!ids.size && payerName) {
    const parts = payerName.split(" ").filter(Boolean);
    const first = parts[0] ?? "";
    const last = parts.slice(1).join(" ");
    if (first && last) {
      const { data } = await supabaseAdmin
        .from("students")
        .select("id")
        .ilike("first_name", first)
        .ilike("last_name", last)
        .limit(10);
      for (const row of data ?? []) ids.add(row.id);
    }
  }
  return [...ids];
}

async function findMonthlyCharge(
  studentIds: string[],
  amount: number,
  paidAt: string,
  payerEmail: string,
  payerName: string,
) {
  if (!studentIds.length) return null;
  const { data: rows } = await supabaseAdmin
    .from("monthly_charges")
    .select("id,amount_due,amount_paid,status,due_date,month,student_id,students(first_name,last_name,email,parent_email)")
    .in("student_id", studentIds)
    .in("status", ["pending", "partially_paid"])
    .order("due_date", { ascending: true })
    .limit(100);

  const paidTime = new Date(paidAt).getTime();
  const paidMonth = paidAt.slice(0, 7);
  const targetName = normalizeName(payerName);
  const targetEmail = normalizeEmail(payerEmail);

  let best: any = null;
  let bestScore = -Infinity;
  for (const row of rows ?? []) {
    const remaining = Number(row.amount_due) - Number(row.amount_paid);
    if (remaining <= 0) continue;
    const dueDate = new Date(String(row.due_date)).getTime();
    const days = Math.abs(paidTime - dueDate) / 86400000;
    const studentName = normalizeName(\`\${row.students?.first_name ?? ""} \${row.students?.last_name ?? ""}\`);
    const studentEmail = normalizeEmail(row.students?.email || row.students?.parent_email);
    let score = 0;
    if (Math.abs(remaining - amount) < 0.01) score += 1000;
    else if (amount <= remaining + 0.01) score += 250;
    if (String(row.month).slice(0, 7) === paidMonth) score += 180;
    if (studentEmail && studentEmail === targetEmail) score += 80;
    if (studentName && studentName === targetName) score += 60;
    score += 100 / (1 + days);
    if (score > bestScore) {
      bestScore = score;
      best = row;
    }
  }
  return best;
}

async function findRental(payerEmail: string, amount: number, paidAt: string) {
  if (!payerEmail) return null;
  const { data: rows } = await supabaseAdmin
    .from("studio_rentals")
    .select("id,price,payment_status,starts_at,customer_email")
    .ilike("customer_email", payerEmail)
    .eq("payment_status", "pending")
    .eq("is_active", true)
    .order("starts_at", { ascending: false })
    .limit(30);
  const paidTime = new Date(paidAt).getTime();
  return (rows ?? [])
    .filter(r => Math.abs(Number(r.price) - amount) < 0.01)
    .sort((a, b) => Math.abs(new Date(a.starts_at).getTime() - paidTime) - Math.abs(new Date(b.starts_at).getTime() - paidTime))[0] ?? null;
}

async function listSucceededPaymentIntents(since: number) {
  const result: any[] = [];
  let starting_after: string | undefined;
  for (let page = 0; page < 10; page++) {
    const response = await stripe.paymentIntents.list({
      limit: 100,
      created: { gte: since },
      ...(starting_after ? { starting_after } : {}),
      expand: ["data.latest_charge"],
    });
    result.push(...response.data);
    if (!response.has_more || !response.data.length) break;
    starting_after = response.data[response.data.length - 1].id;
  }
  return result;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!stripe) return json({ error: "Stripe server key is not configured in Supabase." }, 503);

  try {
    const body = await req.json().catch(() => ({}));
    const days = Math.min(Math.max(Number(body?.days || 180), 1), 365);
    const since = Math.floor(Date.now() / 1000) - days * 86400;
    const payments = await listSucceededPaymentIntents(since);

    let synced = 0;
    let linked = 0;
    let matchedMonthly = 0;
    let matchedRentals = 0;
    let reservationFees = 0;

    for (const pi of payments) {
      if (pi.status !== "succeeded") continue;

      const metadata = (pi.metadata || {}) as Record<string, string>;
      const amount = Number(pi.amount_received || pi.amount || 0) / 100;
      const charge: any = pi.latest_charge;
      const billing = charge?.billing_details || {};
      const payerName = billing.name || null;
      const payerEmail = normalizeEmail(billing.email || pi.receipt_email || "");
      const payerPhone = normalizePhone(billing.phone || "");
      const paidAt = new Date((pi.created || Math.floor(Date.now() / 1000)) * 1000).toISOString();
      const kind = classify(amount, metadata);

      let rentalId = metadata.rental_id || null;
      let monthlyChargeId = metadata.monthly_charge_id || null;
      let dropInBookingId = null;
      let matchedKind = kind;

      if (amount === 5) reservationFees++;

      if (rentalId) {
        const { data } = await supabaseAdmin.from("studio_rentals").select("id").eq("id", rentalId).maybeSingle();
        if (!data) rentalId = null;
      }

      if (rentalId) {
        await supabaseAdmin.from("studio_rentals").update({
          payment_status: "paid",
          payment_method: "stripe",
          stripe_payment_id: pi.id,
          stripe_payment_status: "paid",
          paid_at: paidAt,
          customer_email: payerEmail || null,
        }).eq("id", rentalId);
        linked++;
        matchedRentals++;
      }

      if (monthlyChargeId) {
        const { data: chargeRow } = await supabaseAdmin
          .from("monthly_charges")
          .select("id,amount_due,amount_paid,student_id,payer_id")
          .eq("id", monthlyChargeId)
          .maybeSingle();

        if (chargeRow && Number(chargeRow.amount_paid) < Number(chargeRow.amount_due)) {
          const remaining = Number(chargeRow.amount_due) - Number(chargeRow.amount_paid);
          const add = Math.min(amount, remaining);
          const newPaid = Number(chargeRow.amount_paid) + add;
          await supabaseAdmin.from("monthly_charges").update({
            amount_paid: newPaid,
            status: newPaid >= Number(chargeRow.amount_due) ? "paid" : "partially_paid",
            updated_at: new Date().toISOString(),
          }).eq("id", monthlyChargeId);

          const { data: existingPayment } = await supabaseAdmin
            .from("payments").select("id").eq("stripe_payment_id", pi.id).maybeSingle();

          if (!existingPayment && add > 0) {
            await supabaseAdmin.from("payments").insert({
              monthly_charge_id: monthlyChargeId,
              student_id: chargeRow.student_id,
              amount: add,
              payment_method: "stripe",
              paid_at: paidAt,
              stripe_payment_id: pi.id,
              received_by: null,
              payer_id: metadata.payer_id || chargeRow.payer_id || null,
              notes: "Stripe Checkout",
            });
          }
          linked++;
          matchedMonthly++;
        }
      }

      if (!monthlyChargeId && !rentalId && !dropInBookingId && amount !== 5 && payerEmail) {
        const studentIds = await findStudentIds(payerEmail, payerPhone, payerName || "");
        const monthly = await findMonthlyCharge(studentIds, amount, paidAt, payerEmail, payerName || "");
        if (monthly) {
          monthlyChargeId = monthly.id;
          const remaining = Number(monthly.amount_due) - Number(monthly.amount_paid);
          const add = Math.min(amount, remaining);
          const newPaid = Number(monthly.amount_paid) + add;
          if (add > 0) {
            await supabaseAdmin.from("monthly_charges").update({
              amount_paid: newPaid,
              status: newPaid >= Number(monthly.amount_due) ? "paid" : "partially_paid",
              updated_at: new Date().toISOString(),
            }).eq("id", monthly.id);

            const { data: existingPayment } = await supabaseAdmin
              .from("payments").select("id").eq("stripe_payment_id", pi.id).maybeSingle();

            if (!existingPayment) {
              await supabaseAdmin.from("payments").insert({
                monthly_charge_id: monthly.id,
                student_id: monthly.student_id,
                amount: add,
                payment_method: "stripe",
                paid_at: paidAt,
                stripe_payment_id: pi.id,
                received_by: null,
                payer_id: metadata.payer_id || null,
                notes: "Stripe istorinio mokėjimo sutikrinimas",
              });
            }
            linked++;
            matchedMonthly++;
            matchedKind = "monthly_charge";
          }
        } else {
          const rental = await findRental(payerEmail, amount, paidAt);
          if (rental) {
            rentalId = rental.id;
            await supabaseAdmin.from("studio_rentals").update({
              payment_status: "paid",
              payment_method: "stripe",
              stripe_payment_id: pi.id,
              stripe_payment_status: "paid",
              paid_at: paidAt,
            }).eq("id", rental.id);
            linked++;
            matchedRentals++;
            matchedKind = "rental";
          }
        }
      }

      if (metadata.payment_kind === "drop_in" && metadata.drop_in_lesson_id) {
        const { data: booking } = await supabaseAdmin
          .from("drop_in_bookings")
          .select("id")
          .eq("stripe_payment_id", pi.id)
          .maybeSingle();
        dropInBookingId = booking?.id || null;
      }

      await supabaseAdmin.from("stripe_payments").upsert({
        stripe_payment_id: pi.id,
        amount,
        currency: pi.currency || "eur",
        status: pi.status,
        payer_name: payerName,
        payer_email: payerEmail || null,
        paid_at: paidAt,
        payment_kind: matchedKind,
        monthly_charge_id: monthlyChargeId,
        rental_id: rentalId,
        drop_in_booking_id: dropInBookingId,
        metadata,
        updated_at: new Date().toISOString(),
      }, { onConflict: "stripe_payment_id" });

      synced++;
    }

    return json({
      ok: true,
      synced,
      linked,
      matched_monthly: matchedMonthly,
      matched_rentals: matchedRentals,
      reservation_fees: reservationFees,
    });
  } catch (error) {
    console.error(error);
    return json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
});