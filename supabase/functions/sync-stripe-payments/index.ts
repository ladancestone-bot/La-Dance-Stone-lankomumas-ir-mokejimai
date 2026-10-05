import Stripe from "npm:stripe@^22";
import { createClient } from "npm:@supabase/supabase-js@2";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", { apiVersion: "2025-03-31.basil" });
const supabaseAdmin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

function classify(amount:number, metadata:Record<string,string>){
  if(amount===5)return "reservation_fee";
  if(metadata.payment_kind==="rental")return "rental";
  if(metadata.payment_kind==="monthly_charge")return "monthly_charge";
  if(metadata.payment_kind==="drop_in")return "drop_in";
  return metadata.payment_kind||"unknown";
}

Deno.serve(async(req)=>{
  if(req.method!=="POST")return new Response("Method not allowed",{status:405});
  try{
    const body=await req.json().catch(()=>({}));
    const days=Math.min(Math.max(Number(body?.days||180),1),365);
    const since=Math.floor(Date.now()/1000)-days*86400;
    const payments=await stripe.paymentIntents.list({limit:100,created:{gte:since},expand:["data.latest_charge"]});
    let synced=0,linked=0;
    for(const pi of payments.data){
      if(pi.status!=="succeeded")continue;
      const metadata=(pi.metadata||{}) as Record<string,string>;
      const amount=Number(pi.amount_received||pi.amount||0)/100;
      const charge:any=pi.latest_charge;
      const billing=charge?.billing_details||{};
      const payerName=billing.name||null;
      const payerEmail=billing.email||pi.receipt_email||null;
      const paidAt=new Date((pi.created||Math.floor(Date.now()/1000))*1000).toISOString();
      const kind=classify(amount,metadata);
      let rentalId=metadata.rental_id||null;
      let monthlyChargeId=metadata.monthly_charge_id||null;
      if(rentalId){
        const {data}=await supabaseAdmin.from("studio_rentals").select("id").eq("id",rentalId).maybeSingle();
        if(!data)rentalId=null;
      }
      if(rentalId){
        await supabaseAdmin.from("studio_rentals").update({payment_status:"paid",payment_method:"stripe",stripe_payment_id:pi.id,stripe_payment_status:"paid",paid_at:paidAt,customer_email:payerEmail}).eq("id",rentalId);
        linked++;
      }
      if(monthlyChargeId){
        const {data:ch}=await supabaseAdmin.from("monthly_charges").select("id,amount_due,amount_paid,student_id,payer_id").eq("id",monthlyChargeId).maybeSingle();
        if(ch&&Number(ch.amount_paid)<Number(ch.amount_due)){
          const add=Math.min(amount,Number(ch.amount_due)-Number(ch.amount_paid));
          const newPaid=Number(ch.amount_paid)+add;
          await supabaseAdmin.from("monthly_charges").update({amount_paid:newPaid,status:newPaid>=Number(ch.amount_due)?"paid":"partially_paid",updated_at:new Date().toISOString()}).eq("id",monthlyChargeId);
          const {data:existing}=await supabaseAdmin.from("payments").select("id").eq("stripe_payment_id",pi.id).maybeSingle();
          if(!existing&&add>0)await supabaseAdmin.from("payments").insert({monthly_charge_id:monthlyChargeId,student_id:ch.student_id,amount:add,payment_method:"stripe",paid_at:paidAt,stripe_payment_id:pi.id,received_by:null,payer_id:metadata.payer_id||ch.payer_id||null,notes:"Stripe Checkout"});
          linked++;
        }
      }
      await supabaseAdmin.from("stripe_payments").upsert({stripe_payment_id:pi.id,amount,currency:pi.currency||"eur",status:pi.status,payer_name:payerName,payer_email:payerEmail,paid_at:paidAt,payment_kind:kind,monthly_charge_id:monthlyChargeId,rental_id:rentalId,metadata,updated_at:new Date().toISOString()},{onConflict:"stripe_payment_id"});
      synced++;
    }
    return Response.json({ok:true,synced,linked,reservation_fees:payments.data.filter(pi=>pi.status==="succeeded"&&Number(pi.amount_received||pi.amount||0)/100===5).length});
  }catch(error){console.error(error);return Response.json({error:error instanceof Error?error.message:String(error)},{status:500});}
});