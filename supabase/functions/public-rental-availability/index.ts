import "jsr:@supabase/functions-js/edge-runtime.d.ts";
const URL = Deno.env.get("SUPABASE_URL")!;
const KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ORIGINS = ["https://ladancestone.lt","https://www.ladancestone.lt","https://ladancestone-bot.github.io"];
const headers = (origin:string|null) => ({
  "Access-Control-Allow-Origin": origin && ORIGINS.includes(origin) ? origin : ORIGINS[0],
  "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods":"POST, OPTIONS",
  "Content-Type":"application/json; charset=utf-8","Vary":"Origin"
});
const reply=(data:unknown,status:number,origin:string|null)=>new Response(JSON.stringify(data),{status,headers:headers(origin)});
const localDate=(v:string)=>new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Vilnius",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(v));
const localTime=(v:string)=>new Intl.DateTimeFormat("en-GB",{timeZone:"Europe/Vilnius",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).format(new Date(v));
Deno.serve(async(req:Request)=>{
 const origin=req.headers.get("origin");
 if(req.method==="OPTIONS") return new Response("ok",{headers:headers(origin)});
 if(req.method!=="POST") return reply({error:"Leidžiamas tik POST metodas."},405,origin);
 if(origin&&!ORIGINS.includes(origin)) return reply({error:"Nepalaikomas svetainės adresas."},403,origin);
 if(!URL||!KEY) return reply({error:"Trūksta rezervacijų sistemos konfigūracijos."},500,origin);
 try {
  const body=await req.json(), startDate=String(body.startDate||""), endDate=String(body.endDate||"");
  if(!/^\d{4}-\d{2}-\d{2}$/.test(startDate)||!/^\d{4}-\d{2}-\d{2}$/.test(endDate)||startDate>endDate) return reply({error:"Netinkamas kalendoriaus laikotarpis."},400,origin);
  const auth={apikey:KEY,Authorization:"Bearer "+KEY};
  const [rr,sr]=await Promise.all([
   fetch(URL+"/rest/v1/studio_rentals?select=starts_at,ends_at,is_active,payment_status&is_active=eq.true&payment_status=neq.cancelled&ends_at=gt."+encodeURIComponent(new Date().toISOString())+"&order=starts_at.asc&limit=2000",{headers:auth}),
   fetch(URL+"/rest/v1/season_group_schedules?select=weekday,starts_at,ends_at,valid_from,valid_to&limit=2000",{headers:auth})
  ]);
  if(!rr.ok) return reply({error:"Nepavyko nuskaityti studijos rezervacijų."},502,origin);
  if(!sr.ok) return reply({error:"Nepavyko nuskaityti šokių užsiėmimų tvarkaraščio."},502,origin);
  const [rentals,schedules]=await Promise.all([rr.json(),sr.json()]);
  const busy:Array<{date:string;start:string;end:string;kind:string}>=[];
  for(const r of rentals){const date=localDate(r.starts_at);if(date>=startDate&&date<=endDate)busy.push({date,start:localTime(r.starts_at),end:localTime(r.ends_at),kind:"rental"});}
  const fixed:Array<[number,string,string]>=[[1,"16:00","17:00"],[1,"19:15","20:00"],[2,"16:00","17:00"],[2,"17:00","18:00"],[2,"18:00","18:45"],[3,"16:00","17:00"],[3,"19:15","20:00"],[4,"16:00","17:00"],[4,"17:00","18:00"],[4,"18:00","18:45"],[7,"19:00","19:45"]];
  for(let d=new Date(startDate+"T12:00:00Z"),last=new Date(endDate+"T12:00:00Z");d<=last;d.setUTCDate(d.getUTCDate()+1)){
   const date=d.toISOString().slice(0,10),wd=d.getUTCDay()||7;
   for(const [day,start,end] of fixed) if(day===wd) busy.push({date,start,end,kind:"class"});
   for(const s of schedules){if(Number(s.weekday)!==wd)continue;if(s.valid_from&&s.valid_from>date)continue;if(s.valid_to&&s.valid_to<date)continue;busy.push({date,start:String(s.starts_at).slice(0,5),end:String(s.ends_at).slice(0,5),kind:"class"});}
  }
  return reply({ok:true,startDate,endDate,busy},200,origin);
 }catch(e){console.error("public-rental-availability error",e);return reply({error:"Nepavyko atnaujinti kalendoriaus užimtumo."},500,origin);}
});