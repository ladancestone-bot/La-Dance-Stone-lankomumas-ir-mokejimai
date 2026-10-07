import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function sha256(value: string) {
  const data = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
}
async function sb(path: string, init: RequestInit = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json", ...(init.headers ?? {}) }
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${body.slice(0,800)}`);
  return body ? JSON.parse(body) : null;
}
const clean=(v:unknown)=>String(v??"").trim();
const norm=(v:unknown)=>clean(v).toLocaleLowerCase("lt-LT").normalize("NFD").replace(/[\u0300-\u036f]/g,"");
const splitName=(name:string)=>{const p=clean(name).split(/\s+/).filter(Boolean);return {first_name:p.slice(0,-1).join(" ")||p[0]||"",last_name:p.length>1?p[p.length-1]:""}};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json"}});

type Row={month:string;source_key:string;source_sheet?:string;source_row?:number;name:string;email?:string;phone?:string;group_name:string;amount_due:number};

async function findOrCreateStudent(row:Row){
  const email=clean(row.email)||null, phone=clean(row.phone)||null, person=splitName(row.name);
  let found:any[]=[];
  if(email) found=await sb(`students?select=id&email=eq.${encodeURIComponent(email)}&limit=1`);
  if(!found.length&&phone) found=await sb(`students?select=id&phone=eq.${encodeURIComponent(phone)}&limit=1`);
  if(!found.length){
    const all=await sb("students?select=id,first_name,last_name&is_active=eq.true");
    const matches=(all??[]).filter((s:any)=>norm(s.first_name+" "+s.last_name)===norm(row.name));
    if(matches.length===1) found=matches;
  }
  const patch:any={first_name:person.first_name,last_name:person.last_name,updated_at:new Date().toISOString()};
  if(email)patch.email=email;if(phone)patch.phone=phone;
  if(found.length){
    await sb(`students?id=eq.${found[0].id}`,{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify(patch)});
    return found[0].id;
  }
  const created=await sb("students",{method:"POST",headers:{Prefer:"return=representation"},body:JSON.stringify({...patch,registration_date:new Date().toISOString().slice(0,10),is_active:true})});
  return created[0].id;
}

async function syncRow(row:Row){
  const month=clean(row.month);
  if(!/^\d{4}-\d{2}-01$/.test(month)) throw new Error("Invalid month: "+month);
  const groups=await sb(`groups?select=id&name=eq.${encodeURIComponent(clean(row.group_name))}&limit=1`);
  if(!groups?.length) throw new Error("Group not found: "+row.group_name);
  const studentId=await findOrCreateStudent(row), groupId=groups[0].id;
  const existing=await sb(`monthly_charges?select=id&source_system=eq.google_sheets&source_key=eq.${encodeURIComponent(row.source_key)}&limit=1`);
  const payload={
    student_id:studentId,group_id:groupId,month,amount_due:Number(row.amount_due)||0,
    source_system:"google_sheets",source_key:row.source_key,source_sheet:clean(row.source_sheet)||null,
    source_row:Number(row.source_row)||null,source_active:true,source_synced_at:new Date().toISOString(),
    description:`Abonementas · ${month.slice(0,7)}`
  };
  let id:string;
  if(existing?.length){
    await sb(`monthly_charges?id=eq.${existing[0].id}`,{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify(payload)});
    id=existing[0].id;
  }else{
    const byStudentGroup=await sb(`monthly_charges?select=id&student_id=eq.${studentId}&group_id=eq.${groupId}&month=eq.${month}&limit=1`);
    if(byStudentGroup?.length){
      await sb(`monthly_charges?id=eq.${byStudentGroup[0].id}`,{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify(payload)});
      id=byStudentGroup[0].id;
    }else{
      const inserted=await sb("monthly_charges",{method:"POST",headers:{Prefer:"return=representation"},body:JSON.stringify({...payload,amount_paid:0,status:"unpaid",due_date:month})});
      id=inserted[0].id;
    }
  }
  // Spreadsheet payment/status columns are deliberately ignored.
  const pay=await sb(`payments?select=amount&monthly_charge_id=eq.${id}`);
  const paid=(pay??[]).reduce((s:any,p:any)=>s+Number(p.amount||0),0);
  const status=paid>=Number(row.amount_due)?"paid":paid>0?"partially_paid":"unpaid";
  await sb(`monthly_charges?id=eq.${id}`,{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({amount_paid:paid,status})});
  return {id,student_id:studentId};
}

Deno.serve(async req=>{
  if(req.method!=="POST")return json({error:"POST only"},405);
  try{
    const body=await req.json();
    const token=clean(body?.token||req.headers.get("x-google-sheets-sync-token"));
    if(!token)return json({error:"Missing sync token"},401);
    const hash=await sha256(token);
    const tokens=await sb(`website_import_tokens?select=id&token_hash=eq.${hash}&is_active=eq.true&limit=1`);
    if(!tokens?.length)return json({error:"Invalid sync token"},401);

    const rows=(Array.isArray(body?.rows)?body.rows:[]) as Row[];
    if(!rows.length)return json({ok:true,received:0,created:0,updated:0,months:[]});

    const byMonth=new Map<string,Set<string>>();
    for(const row of rows){
      if(!byMonth.has(row.month))byMonth.set(row.month,new Set());
      byMonth.get(row.month)!.add(row.source_key);
    }
    let created=0,updated=0,errors:any[]=[];
    for(const row of rows){
      try{
        const before=await sb(`monthly_charges?select=id&source_system=eq.google_sheets&source_key=eq.${encodeURIComponent(row.source_key)}&limit=1`);
        await syncRow(row);
        if(before?.length)updated++;else created++;
      }catch(e){errors.push({source_key:row.source_key,error:e instanceof Error?e.message:String(e)})}
    }

    // A complete monthly snapshot controls which imported rows remain visible.
    for(const [month,keys] of byMonth){
      const existing=await sb(`monthly_charges?select=id,source_key&source_system=eq.google_sheets&month=eq.${month}&source_active=eq.true`);
      for(const item of existing??[]){
        if(!keys.has(item.source_key)){
          await sb(`monthly_charges?id=eq.${item.id}`,{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({source_active:false,source_synced_at:new Date().toISOString()})});
        }
      }
    }
    await sb(`website_import_tokens?id=eq.${tokens[0].id}`,{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({last_used_at:new Date().toISOString()})});
    return json({ok:true,received:rows.length,created,updated,months:Array.from(byMonth.keys()),errors});
  }catch(e){return json({error:e instanceof Error?e.message:String(e)},500)}
});
