import { useEffect, useMemo, useState } from "react";
import {
  CalendarCheck, CreditCard, LayoutDashboard, LogOut, Plus, Settings,
  UserRound, Users, UsersRound, X, Building2, UserPlus, ChevronRight,
  Pencil, Trash2, History, Languages, Camera
} from "lucide-react";
import { supabase } from "./lib/supabase";
import SeasonManagement from "./SeasonManagement";

type Role = "admin" | "teacher";
type Lang = "lt" | "en" | "es";
type Section = "dashboard" | "profile" | "schedule" | "attendance" | "payments" | "reservations" | "students" | "groups" | "teachers" | "rentals" | "settings";
type AttendanceStatus = "present" | "absent" | "sick";
type PaymentMethod = "cash" | "bank_transfer" | "stripe";
// Keep billing in safe mode until invoice/payment reconciliation is fully verified.
const BILLING_TEST_MODE = true;

type Student = {
  id: string; first_name: string; last_name: string; email: string | null; phone: string | null;
  date_of_birth: string | null; parent_name: string | null; parent_phone: string | null;
  parent_email: string | null; notes: string | null; payment_preference?: string | null; billing_price_id?: string | null; billing_note?: string | null;
};
type Group = { id: string; name: string; level: string | null; description: string | null };
type Price = { id: string; name: string; amount: number; is_active: boolean };
type Charge = {
  id: string; student_id: string; group_id: string | null; amount_due: number; amount_paid: number;
  status: string; due_date: string; month: string;
  saskaita123_invoice_id?: string | null; saskaita123_invoice_number?: string | null; saskaita123_invoice_url?: string | null; saskaita123_invoice_error?: string | null;
  invoice123_id?: string | null; invoice123_number?: string | null; invoice123_url?: string | null; invoice123_status?: string | null; invoice123_error?: string | null; invoice_created_at?: string | null; invoice_sent_at?: string | null; invoice_send_status?: "not_sent" | "sent" | "failed";
  students?: { first_name: string; last_name: string; email?: string | null; phone?: string | null; parent_email?: string | null; parent_phone?: string | null; payment_preference?: string | null } | null; groups?: { name: string } | null;
};
type Payment = {
  id: string; monthly_charge_id: string; student_id: string; amount: number; payment_method: PaymentMethod;
  paid_at: string; notes: string | null; received_by: string | null;
};
type DropLesson = { id:string; group_id:string; lesson_date:string; start_time:string; end_time:string|null; price:number; capacity:number|null; is_active:boolean; groups?:{name:string}|null };
type DropBooking = { id:string; lesson_id:string; student_id:string|null; first_name:string; last_name:string; email:string|null; phone:string|null; parent_email?:string|null; parent_phone?:string|null; status:string; payment_method:PaymentMethod|null; attendance_status:AttendanceStatus|null; created_at?:string|null };
type Rental = { id:string; customer_name:string; customer_email:string|null; customer_phone:string|null; rental_type:string; starts_at:string; reserved_at?:string|null; created_at?:string|null; ends_at:string; price:number; payment_status:string; payment_method:PaymentMethod|null; stripe_checkout_session_id?:string|null; stripe_payment_status?:string|null; stripe_payment_id?:string|null; paid_at?:string|null; saskaita123_invoice_id?:string|null; saskaita123_invoice_number?:string|null; saskaita123_invoice_url?:string|null; saskaita123_synced_at?:string|null; saskaita123_invoice_error?:string|null; invoice_created_at?:string|null; notes:string|null; is_active:boolean };

type TKey = keyof typeof translations.en;
const translations = {
  en: {
    dashboard:"Overview", profile:"My profile", schedule:"Schedule", students:"Students", groups:"Groups", attendance:"Attendance", payments:"Payments", reservations:"Lesson reservations", teachers:"Teachers", rentals:"Rentals", settings:"Settings",
    studioManagement:"STUDIO MANAGEMENT", privateAccess:"Private access for La Dance Stone administrators and teachers.", signIn:"Send secure sign-in link", email:"Email", accessPending:"Access pending", noRole:"Your account is authenticated but has no studio role yet.", signOut:"Sign out",
    activeStudents:"Active students", activeGroups:"Active groups", outstanding:"Outstanding", today:"Today's classes will appear here when the schedule is connected.",
    searchStudents:"Search students…", addStudent:"Add student", edit:"Edit", save:"Save", cancel:"Cancel", firstName:"First name", lastName:"Last name", phone:"Phone", dob:"Date of birth", parentName:"Parent name", parentPhone:"Parent phone", parentEmail:"Parent email", notes:"Notes", noContact:"No contact", noGroup:"No group assigned", selectGroups:"Select groups",
    addGroup:"Add group", editGroup:"Edit group", groupName:"Group name", level:"Level", description:"Description", groupManaged:"Groups are managed by the administrator.", groupDetail:"Group detail", members:"Students", groupAttendance:"Attendance", groupPayments:"Payments", back:"Back",
    chooseGroup:"Choose group", noStudents:"No students in this group.", attendanceStatuses:"Attendance statuses are only Present, Absent and Sick.", present:"Present", absent:"Absent", sick:"Sick", unmarked:"Not marked", newParticipants:"ONE-OFF LESSONS / NEW PARTICIPANTS", paymentStatus:"Payment status", markAttendance:"Mark attendance",
    subscriptionPlan:"Subscription", onePerWeek:"1× per week — €40", twoPerWeek:"2× per week — €50", threePerWeek:"3× per week — €60", recordPayment:"Record payment", amount:"Amount", remaining:"Remaining", method:"Payment method", cash:"Cash", bank:"Bank transfer", stripe:"Card", cashTotal:"Cash", bankTotal:"Bank transfers", cardTotal:"Cards", totalReceived:"Total received", paymentHistory:"Payment history", editPayment:"Edit payment", deletePayment:"Delete payment", noCharges:"No monthly charges yet.", noHistory:"No payment history.", confirmDelete:"Delete this payment?", teacherFinanceNote:"Teacher access is limited by database permissions to assigned students.",
    inviteTeacher:"Invite teacher", addTeacher:"Add teacher", assignGroups:"Assign groups", sendInvitation:"Send invitation", substitutions:"Substitutions", addSubstitution:"Add substitution", substitute:"Substitute", starts:"Starts", ends:"Ends", saveAssignment:"Save assignments", noTeachers:"No active teachers yet.",
    addRental:"Add rental", customer:"Customer", start:"Start", end:"End", rentalType:"Rental type", shortTerm:"Short term", longTerm:"Long term", price:"Price", pending:"Pending", paid:"Paid", cancelled:"Cancelled", waived:"Staff / teacher — free", saveRental:"Save rental", noRentals:"No rentals yet.",
    pricing:"PRICING", paymentPreference:"Preferred payment method", bankPreference:"Bank transfer", cardPreference:"Card", cashPreference:"Cash", studioPrices:"Studio prices", addPrice:"Add price", priceName:"Price name", monthlyAmount:"Monthly amount (€)", monthly:"Monthly", language:"Language", languageNote:"Choose the app language for this device.", savePrice:"Save price", editPrice:"Edit price", deactivate:"Deactivate", active:"Active", reload:"Reload", details:"Details", contact:"Contact", invoiceCreated:"Invoice created", invoiceSent:"Invoice sent", invoiceNotSent:"Not sent", billingTest:"TEST MODE – nothing is sent to clients",
    rentalPayment:"Rental payment", payWithStripe:"Pay with Stripe", markPaidCash:"Mark paid in cash", issueInvoice:"Issue invoice", invoiceNumber:"Invoice", stripeReceipt:"Stripe receipt", invoiceError:"Invoice error", openPayment:"Open payment", paymentReceived:"Payment received", invoiceReady:"Invoice issued", notIssued:"Not issued", paidAt:"Paid at", emailRequired:"Customer email is required for Stripe payment",
  },
  lt: {
    dashboard:"Apžvalga", profile:"Mano profilis", schedule:"Grafikas", students:"Mokiniai", groups:"Grupės", attendance:"Lankomumas", payments:"Mokėjimai", reservations:"Pamokų rezervacijos", teachers:"Mokytojai", rentals:"Nuoma", settings:"Nustatymai",
    studioManagement:"STUDIJOS VALDYMAS", privateAccess:"Privati prieiga La Dance Stone administratoriams ir mokytojams.", signIn:"Siųsti saugią prisijungimo nuorodą", email:"El. paštas", accessPending:"Prieiga laukiama", noRole:"Paskyra patvirtinta, tačiau jai dar nepriskirta studijos rolė.", signOut:"Atsijungti",
    activeStudents:"Aktyvūs mokiniai", activeGroups:"Aktyvios grupės", outstanding:"Neapmokėta", today:"Šiandienos pamokos bus rodomos, kai bus prijungtas tvarkaraštis.",
    searchStudents:"Ieškoti mokinių…", addStudent:"Pridėti mokinį", edit:"Redaguoti", save:"Išsaugoti", cancel:"Atšaukti", firstName:"Vardas", lastName:"Pavardė", phone:"Telefonas", dob:"Gimimo data", parentName:"Tėvų vardas", parentPhone:"Tėvų telefonas", parentEmail:"Tėvų el. paštas", notes:"Pastabos", noContact:"Nėra kontaktų", noGroup:"Grupė nepriskirta", selectGroups:"Pasirinkite grupes",
    addGroup:"Pridėti grupę", editGroup:"Redaguoti grupę", groupName:"Grupės pavadinimas", level:"Lygis", description:"Aprašymas", groupManaged:"Grupes valdo administratorius.", groupDetail:"Grupės informacija", members:"Mokiniai", groupAttendance:"Lankomumas", groupPayments:"Mokėjimai", back:"Atgal",
    chooseGroup:"Pasirinkite grupę", noStudents:"Šioje grupėje mokinių nėra.", attendanceStatuses:"Lankomumo statusai: Dalyvavo, Nedalyvavo ir Serga.", present:"Dalyvavo", absent:"Nedalyvavo", sick:"Serga", unmarked:"Nepasirinkta", newParticipants:"VIENKARTINĖS PAMOKOS / NAUJI DALYVIAI", paymentStatus:"Mokėjimo būsena", markAttendance:"Pažymėti lankomumą",
    subscriptionPlan:"Abonementas", onePerWeek:"1× per savaitę — 40 €", twoPerWeek:"2× per savaitę — 50 €", threePerWeek:"3× per savaitę — 60 €", recordPayment:"Registruoti mokėjimą", amount:"Suma", remaining:"Likutis", method:"Mokėjimo būdas", cash:"Grynais", bank:"Bankiniu pavedimu", stripe:"Kortele", cashTotal:"Grynais", bankTotal:"Bankiniai pavedimai", cardTotal:"Kortelės", totalReceived:"Iš viso gauta", paymentHistory:"Mokėjimų istorija", editPayment:"Redaguoti mokėjimą", deletePayment:"Ištrinti mokėjimą", noCharges:"Mėnesinių mokėjimų nėra.", noHistory:"Mokėjimų istorijos nėra.", confirmDelete:"Ištrinti šį mokėjimą?", teacherFinanceNote:"Mokytojo prieiga ribojama jo grupių mokiniais pagal duomenų bazės teises.",
    inviteTeacher:"Pakviesti mokytoją", addTeacher:"Pridėti mokytoją", assignGroups:"Priskirti grupes", sendInvitation:"Siųsti kvietimą", substitutions:"Pavadavimai", addSubstitution:"Pridėti pavadavimą", substitute:"Pavaduojantis mokytojas", starts:"Nuo", ends:"Iki", saveAssignment:"Išsaugoti priskyrimus", noTeachers:"Aktyvių mokytojų dar nėra.",
    addRental:"Pridėti nuomą", customer:"Klientas", start:"Pradžia", end:"Pabaiga", rentalType:"Nuomos tipas", shortTerm:"Trumpalaikė", longTerm:"Ilgalaikė", price:"Kaina", pending:"Laukiama", paid:"Apmokėta", cancelled:"Atšaukta", waived:"Nemokama (mokytojas / studija)", saveRental:"Išsaugoti nuomą", noRentals:"Nuomų nėra.",
    pricing:"KAINOS", paymentPreference:"Pageidaujamas mokėjimo būdas", bankPreference:"Bankiniu pavedimu", cardPreference:"Kortele", cashPreference:"Grynais", studioPrices:"Studijos kainos", addPrice:"Pridėti kainą", priceName:"Kainos pavadinimas", monthlyAmount:"Mėnesio suma (€)", monthly:"Mėnesinis", language:"Kalba", languageNote:"Pasirinkite aplikacijos kalbą šiame įrenginyje.", savePrice:"Išsaugoti kainą", editPrice:"Redaguoti kainą", deactivate:"Deaktyvuoti", active:"Aktyvi", reload:"Atnaujinti", details:"Informacija", contact:"Kontaktai", invoiceCreated:"Sąskaita sukurta", invoiceSent:"Sąskaita išsiųsta", invoiceNotSent:"Neišsiųsta", billingTest:"TESTAVIMO REŽIMAS – klientams niekas nesiunčiama",
    rentalPayment:"Nuomos apmokėjimas", payWithStripe:"Apmokėti per Stripe", markPaidCash:"Pažymėti apmokėtą grynais", issueInvoice:"Išrašyti sąskaitą", invoiceNumber:"Sąskaita", stripeReceipt:"Stripe kvitas", invoiceError:"Sąskaitos klaida", openPayment:"Atidaryti mokėjimą", paymentReceived:"Mokėjimas gautas", invoiceReady:"Sąskaita išrašyta", notIssued:"Neišrašyta", paidAt:"Apmokėta", emailRequired:"Stripe mokėjimui būtinas kliento el. paštas",
  },
  es: {
    dashboard:"Resumen", profile:"Mi perfil", schedule:"Horario", students:"Alumnos", groups:"Grupos", attendance:"Asistencia", payments:"Pagos", reservations:"Reservas de clases", teachers:"Profesores", rentals:"Alquiler", settings:"Ajustes",
    studioManagement:"GESTIÓN DEL ESTUDIO", privateAccess:"Acceso privado para administradores y profesores de La Dance Stone.", signIn:"Enviar enlace seguro", email:"Correo electrónico", accessPending:"Acceso pendiente", noRole:"Tu cuenta está autenticada pero aún no tiene un rol del estudio.", signOut:"Cerrar sesión",
    activeStudents:"Alumnos activos", activeGroups:"Grupos activos", outstanding:"Pendiente", today:"Las clases de hoy aparecerán cuando se conecte el horario.",
    searchStudents:"Buscar alumnos…", addStudent:"Añadir alumno", edit:"Editar", save:"Guardar", cancel:"Cancelar", firstName:"Nombre", lastName:"Apellido", phone:"Teléfono", dob:"Fecha de nacimiento", parentName:"Nombre del padre/madre", parentPhone:"Teléfono del padre/madre", parentEmail:"Correo del padre/madre", notes:"Notas", noContact:"Sin contacto", noGroup:"Sin grupo", selectGroups:"Seleccionar grupos",
    addGroup:"Añadir grupo", editGroup:"Editar grupo", groupName:"Nombre del grupo", level:"Nivel", description:"Descripción", groupManaged:"Los grupos son gestionados por el administrador.", groupDetail:"Detalle del grupo", members:"Alumnos", groupAttendance:"Asistencia", groupPayments:"Pagos", back:"Volver",
    chooseGroup:"Elegir grupo", noStudents:"No hay alumnos en este grupo.", attendanceStatuses:"Estados: Presente, Ausente y Enfermo.", present:"Presente", absent:"Ausente", sick:"Enfermo", unmarked:"Sin marcar", newParticipants:"CLASES SUELTAS / NUEVOS PARTICIPANTES", paymentStatus:"Estado del pago", markAttendance:"Marcar asistencia",
    subscriptionPlan:"Abono", onePerWeek:"1× por semana — 40 €", twoPerWeek:"2× por semana — 50 €", threePerWeek:"3× por semana — 60 €", recordPayment:"Registrar pago", amount:"Importe", remaining:"Restante", method:"Método de pago", cash:"Efectivo", bank:"Transferencia", stripe:"Tarjeta", cashTotal:"Efectivo", bankTotal:"Transferencias", cardTotal:"Tarjetas", totalReceived:"Total recibido", paymentHistory:"Historial de pagos", editPayment:"Editar pago", deletePayment:"Eliminar pago", noCharges:"No hay cargos mensuales.", noHistory:"No hay historial de pagos.", confirmDelete:"¿Eliminar este pago?", teacherFinanceNote:"El acceso del profesor está limitado a sus alumnos mediante los permisos de la base de datos.",
    inviteTeacher:"Invitar profesor", addTeacher:"Añadir profesor", assignGroups:"Asignar grupos", sendInvitation:"Enviar invitación", substitutions:"Sustituciones", addSubstitution:"Añadir sustitución", substitute:"Profesor sustituto", starts:"Desde", ends:"Hasta", saveAssignment:"Guardar asignaciones", noTeachers:"No hay profesores activos.",
    addRental:"Añadir alquiler", customer:"Cliente", start:"Inicio", end:"Fin", rentalType:"Tipo de alquiler", shortTerm:"Corto plazo", longTerm:"Largo plazo", price:"Precio", pending:"Pendiente", paid:"Pagado", cancelled:"Cancelado", waived:"Gratis (profesor / estudio)", saveRental:"Guardar alquiler", noRentals:"No hay alquileres.",
    pricing:"PRECIOS", paymentPreference:"Método de pago preferido", bankPreference:"Transferencia bancaria", cardPreference:"Tarjeta", cashPreference:"Efectivo", studioPrices:"Precios del estudio", addPrice:"Añadir precio", priceName:"Nombre del precio", monthlyAmount:"Importe mensual (€)", monthly:"Mensual", language:"Idioma", languageNote:"Elige el idioma de la aplicación en este dispositivo.", savePrice:"Guardar precio", editPrice:"Editar precio", deactivate:"Desactivar", active:"Activa", reload:"Actualizar", details:"Detalles", contact:"Contacto", invoiceCreated:"Factura creada", invoiceSent:"Factura enviada", invoiceNotSent:"No enviada", billingTest:"MODO DE PRUEBA – no se envía nada a los clientes",
    rentalPayment:"Pago del alquiler", payWithStripe:"Pagar con Stripe", markPaidCash:"Marcar pagado en efectivo", issueInvoice:"Emitir factura", invoiceNumber:"Factura", stripeReceipt:"Recibo de Stripe", invoiceError:"Error de factura", openPayment:"Abrir pago", paymentReceived:"Pago recibido", invoiceReady:"Factura emitida", notIssued:"No emitida", paidAt:"Pagado", emailRequired:"Se requiere el correo del cliente para pagar con Stripe",
  }
} as const;

const nav: { id: Section; key: TKey; icon: any }[] = [
  { id:"dashboard", key:"dashboard", icon:LayoutDashboard },
  { id:"schedule", key:"schedule", icon:CalendarCheck },
  { id:"attendance", key:"attendance", icon:UsersRound },
  { id:"payments", key:"payments", icon:CreditCard },
];
const money = (n:number) => new Intl.NumberFormat("lt-LT", {style:"currency",currency:"EUR"}).format(n);
const todayISO = () => new Date().toISOString().slice(0,10);
const currentMonth = () => { const d = new Date(); return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0"); };
const parseReservationEventDate=(text:string,year:number)=>{
  const normalized=text.toLocaleLowerCase("lt-LT").normalize("NFD").replace(/[\\u0300-\\u036f]/g,"");
  const months:Record<string,number>={sausio:1,vasario:2,kovo:3,balandzio:4,geguzes:5,birzelio:6,liepos:7,rugpjucio:8,rugsejo:9,spalio:10,lapkricio:11,gruodzio:12};
  const m=normalized.match(/(sausio|vasario|kovo|balandzio|geguzes|birzelio|liepos|rugpjucio|rugsejo|spalio|lapkricio|gruodzio)\\s+(\\d{1,2})\\s*d/);
  if(!m)return null;
  const month=months[m[1]],day=Number(m[2]),d=new Date(year,month-1,day);
  return d.getMonth()===month-1&&d.getDate()===day ? year+"-"+String(month).padStart(2,"0")+"-"+String(day).padStart(2,"0") : null;
};
const reservationEventDate=(o:any)=>{
  const sourceDate=String(o.raw_data?.data||o.created_at||"");
  const sourceYear=Number(sourceDate.slice(0,4))||new Date().getFullYear();
  const sourceText=[o.group_text,o.lesson_text,o.raw_data?.grupe,o.raw_data?.pamoka].filter(Boolean).join(" ");
  return parseReservationEventDate(sourceText,sourceYear)||String(o.reservation_date||"")||null;
};
const formatReservedAt=(value:any)=>{
  if(!value)return "—";
  const d=new Date(String(value));
  if(Number.isNaN(d.getTime()))return String(value);
  return d.toLocaleString("lt-LT",{timeZone:"Europe/Vilnius",dateStyle:"short",timeStyle:"short"});
};
async function loadEffectiveAttendance(groupId:string,date:string){
  const {data: rows,error}=await supabase.from("attendance").select("id,student_id,status").eq("group_id",groupId).eq("attendance_date",date);
  if(error)throw error;
  const result:Record<string,AttendanceStatus>={};
  for(const row of rows??[])result[row.student_id]=row.status as AttendanceStatus;
  const ids=(rows??[]).map(row=>row.id);
  if(ids.length){
    const {data: revisions, error: revisionError}=await supabase.from("attendance_revisions").select("attendance_id,status,created_at,id").in("attendance_id",ids).order("created_at",{ascending:false}).order("id",{ascending:false});
    if(revisionError)throw revisionError;
    const seen=new Set<string>();
    for(const revision of revisions??[])if(!seen.has(revision.attendance_id)){result[(rows??[]).find(row=>row.id===revision.attendance_id)!.student_id]=revision.status as AttendanceStatus;seen.add(revision.attendance_id)}
  }
  return result;
}
async function recordAttendanceStatus(studentId:string,groupId:string,date:string,status:AttendanceStatus,seasonId:string){
  const {data: existing,error}=await supabase.from("attendance").select("id,status,season_id").eq("student_id",studentId).eq("group_id",groupId).eq("attendance_date",date).maybeSingle();
  if(error)throw error;
  if(!existing){
    const payload:any={student_id:studentId,group_id:groupId,attendance_date:date,status};
    if(seasonId){const {data: config,error: configError}=await supabase.from("season_groups").select("id").eq("season_id",seasonId).eq("group_id",groupId).eq("is_active",true).maybeSingle();if(configError)throw configError;if(!config)throw new Error("Configure this logical group for the selected period before recording seasonal attendance.");payload.season_id=seasonId;}
    const {error: insertError}=await supabase.from("attendance").insert(payload);if(insertError)throw insertError;return;
  }
  if(seasonId&&existing.season_id!==seasonId)throw new Error("This attendance record belongs to a different or unassigned period and cannot be changed from the selected period.");
  let effective=existing.status as AttendanceStatus;
  const {data: revision,error: revisionError}=await supabase.from("attendance_revisions").select("status").eq("attendance_id",existing.id).order("created_at",{ascending:false}).order("id",{ascending:false}).limit(1).maybeSingle();
  if(revisionError)throw revisionError;if(revision)effective=revision.status as AttendanceStatus;
  if(effective===status)return;
  const {error: appendError}=await supabase.from("attendance_revisions").insert({attendance_id:existing.id,status,reason:"Corrected in attendance screen"});if(appendError)throw appendError;
}
function tx(lang:Lang,key:TKey){return translations[lang][key]}

function App(){
  const [session,setSession]=useState<any>(null); const [role,setRole]=useState<Role|null>(null); const [section,setSection]=useState<Section>("dashboard");
  const [seasons,setSeasons]=useState<Array<{id:string;name:string}>>([]); const [seasonId,setSeasonId]=useState("");
  const [email,setEmail]=useState(""); const [message,setMessage]=useState("");
  const [lang,setLang]=useState<Lang>(()=>(localStorage.getItem("lds-lang") as Lang)||"lt");
  const t=(k:TKey)=>tx(lang,k);
  useEffect(()=>{localStorage.setItem("lds-lang",lang)},[lang]);
  useEffect(()=>{supabase.auth.getSession().then(({data})=>setSession(data.session));const {data}=supabase.auth.onAuthStateChange((_e,s)=>setSession(s));return()=>data.subscription.unsubscribe()},[]);
  useEffect(()=>{if(!session?.user?.id){setRole(null);return}supabase.from("user_roles").select("role").eq("user_id",session.user.id).then(({data})=>{const r=data??[];setRole(r.some((x:any)=>x.role==="admin")?"admin":r.some((x:any)=>x.role==="teacher")?"teacher":null)})},[session?.user?.id]);
  useEffect(()=>{if(!role){setSeasons([]);setSeasonId("");return}supabase.from("seasons").select("id,name").eq("is_active",true).order("starts_on",{ascending:false,nullsFirst:false}).then(({data,error})=>{if(error){setSeasons([]);return}const items=(data??[]) as Array<{id:string;name:string}>;setSeasons(items);setSeasonId(current=>items.some(s=>s.id===current)?current:"")})},[role]);
  useEffect(()=>{if(role==="teacher"&&section==="dashboard")setSection("profile");if(role==="admin"&&section==="profile")setSection("dashboard")},[role]);
  useEffect(()=>{const handler=(e:Event)=>{const detail=(e as CustomEvent).detail as Section;if(["dashboard","profile","schedule","attendance","payments"].includes(detail))setSection(detail)};window.addEventListener("lds-go-section",handler);return()=>window.removeEventListener("lds-go-section",handler)},[]);
  useEffect(()=>{if(role==="admin")supabase.functions.invoke("sync-stripe-payments")},[role]);
  async function login(){setMessage("");const {error}=await supabase.auth.signInWithOtp({email,options:{shouldCreateUser:false,emailRedirectTo:window.location.origin}});setMessage(error?error.message:(lang==="lt"?"Patikrinkite el. paštą ir atidarykite prisijungimo nuorodą.":lang==="es"?"Revisa tu correo y abre el enlace de acceso.":"Check your email for the secure sign-in link."))}
  if(!session)return <main className="auth"><section className="auth-card"><div className="brand">LA DANCE STONE</div><div className="eyebrow">ATTENDANCE & PAYMENTS</div><h1>{lang==="lt"?"Studijos valdymas vienoje vietoje.":lang==="es"?"Gestión del estudio en un solo lugar.":"Studio management, in one place."}</h1><p>{t("privateAccess")}</p><label>{t("email")}</label><input value={email} onChange={e=>setEmail(e.target.value)} type="email" placeholder="you@example.com"/><button className="primary" onClick={login} disabled={!email}>{t("signIn")}</button>{message&&<div className="message">{message}</div>}<div className="language-mini"><Languages size={14}/><select value={lang} onChange={e=>setLang(e.target.value as Lang)}><option value="lt">Lietuvių</option><option value="en">English</option><option value="es">Español</option></select></div></section></main>;
  if(!role)return <main className="auth"><section className="auth-card"><div className="brand">LA DANCE STONE</div><h1>{t("accessPending")}</h1><p>{t("noRole")}</p><button className="primary" onClick={()=>supabase.auth.signOut()}>{t("signOut")}</button></section></main>;
  const teacherNav: { id: Section; key: TKey; icon: any }[] = [{id:"profile",key:"profile",icon:UserRound},{id:"schedule",key:"schedule",icon:CalendarCheck},{id:"attendance",key:"attendance",icon:UsersRound},{id:"payments",key:"payments",icon:CreditCard}];
  const visibleNav: { id: Section; key: TKey; icon: any }[] = role==="admin" ? [...nav,{id:"reservations",key:"reservations",icon:CalendarCheck},{id:"groups",key:"groups",icon:Users},{id:"students",key:"students",icon:UserRound},{id:"teachers",key:"teachers",icon:UsersRound},{id:"rentals",key:"rentals",icon:Building2},{id:"settings",key:"settings",icon:Settings}] : teacherNav;
  const current=visibleNav.find(n=>n.id===section)??visibleNav[0];
  return <div className="shell"><header className="topbar"><div><div className="brand">LA DANCE STONE</div><div className="eyebrow">ATTENDANCE & PAYMENTS · {role.toUpperCase()}</div></div><div className="top-actions">{seasons.length>0&&<select aria-label="Activity period" value={seasonId} onChange={e=>setSeasonId(e.target.value)}><option value="">Legacy / all-time</option>{seasons.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select>}<select className="lang-select" value={lang} onChange={e=>setLang(e.target.value as Lang)}><option value="lt">LT</option><option value="en">EN</option><option value="es">ES</option></select><button className="round" onClick={()=>supabase.auth.signOut()} title={t("signOut")}><LogOut size={17}/></button></div></header><main className="content"><div className="heading"><div className="eyebrow">{t("studioManagement")}</div><h1>{t(current.key)}</h1></div>{section==="dashboard"&&<Dashboard role={role} lang={lang} seasonId={seasonId}/>} {section==="profile"&&role==="teacher"&&<TeacherProfile lang={lang} session={session}/>} {section==="schedule"&&<ScheduleLink lang={lang}/>}  {section==="attendance"&&<Attendance lang={lang} seasonId={seasonId} role={role}/>} {section==="payments"&&<Payments role={role} lang={lang} seasonId={seasonId}/>} {section==="reservations"&&role==="admin"&&<LessonReservations lang={lang}/>} {section==="students"&&role==="admin"&&<Students role={role} lang={lang} seasonId={seasonId}/>} {section==="groups"&&role==="admin"&&<Groups role={role} lang={lang} seasonId={seasonId}/>} {section==="teachers"&&role==="admin"&&<Teachers role={role} lang={lang}/>} {section==="rentals"&&role==="admin"&&<Rentals role={role} lang={lang}/>} {section==="settings"&&<SettingsPage role={role} lang={lang} setLang={setLang} seasonId={seasonId} onSeasonCreated={(id)=>{setSeasonId(id);supabase.from("seasons").select("id,name").eq("is_active",true).order("starts_on",{ascending:false,nullsFirst:false}).then(({data})=>setSeasons((data??[]) as Array<{id:string;name:string}>))}}/>}</main><nav className="nav">{visibleNav.map(n=>{const Icon=n.icon;return <button key={n.id} className={section===n.id?"nav-btn active":"nav-btn"} onClick={()=>setSection(n.id)}><Icon size={18}/><span>{t(n.key)}</span></button>})}</nav></div>
}

function ScheduleLink({lang}:{lang:Lang}){const title=lang==="lt"?"Atidaryti mokytojų grafiką":lang==="es"?"Abrir horario de profesores":"Open teacher schedule";return <section className="panel empty"><CalendarCheck size={30}/><h2>{title}</h2><p className="muted">La Dance Stone · 2026–2027</p><button className="primary" onClick={()=>window.open("https://sokiu-mokytoju-grafikas2026-2027.netlify.app/","_blank","noopener,noreferrer")}>{lang==="lt"?"Atidaryti grafiką":lang==="es"?"Abrir horario":"Open schedule"}</button></section>}

function TeacherProfile({lang,session}:{lang:Lang;session:any}){
  const [profile,setProfile]=useState<any>(null);
  const [groups,setGroups]=useState<string[]>([]);
  const [editing,setEditing]=useState(false);
  const [form,setForm]=useState({first_name:"",last_name:"",phone:"",bio:"",specialization:"",avatar_url:""});
  const [saving,setSaving]=useState(false);
  const [uploading,setUploading]=useState(false);
  const [error,setError]=useState("");
  async function load(){
    const uid=session?.user?.id;
    if(!uid)return;
    const [p,t]=await Promise.all([
      supabase.from("profiles").select("id,first_name,last_name,email,phone,avatar_url,bio,specialization").eq("id",uid).maybeSingle(),
      supabase.from("teachers").select("id").eq("profile_id",uid).eq("is_active",true).maybeSingle()
    ]);
    if(p.error||t.error){setError((p.error||t.error)?.message||"Nepavyko įkelti profilio");return}
    setProfile(p.data);
    setForm({first_name:p.data?.first_name||"",last_name:p.data?.last_name||"",phone:p.data?.phone||"",bio:p.data?.bio||"",specialization:p.data?.specialization||"",avatar_url:p.data?.avatar_url||""});
    if(t.data?.id){
      const {data:g}=await supabase.from("group_teachers").select("groups(name)").eq("teacher_id",t.data.id);
      setGroups((g??[]).map((x:any)=>x.groups?.name).filter(Boolean));
    }
  }
  useEffect(()=>{load()},[session?.user?.id]);
  async function save(){
    if(!session?.user?.id)return;
    setSaving(true);setError("");
    const {data,error:e}=await supabase.from("profiles").update({first_name:form.first_name.trim(),last_name:form.last_name.trim(),phone:form.phone.trim()||null,bio:form.bio.trim()||null,specialization:form.specialization.trim()||null,avatar_url:form.avatar_url.trim()||null}).eq("id",session.user.id).select("id,first_name,last_name,email,phone,avatar_url,bio,specialization").single();
    if(e)setError(e.message);else{setProfile(data);setEditing(false)}
    setSaving(false);
  }
  async function uploadPhoto(file:File){
    if(!session?.user?.id)return;
    if(!file.type.startsWith("image/")){setError(pt.choose);return}
    if(file.size>5*1024*1024){setError(pt.size);return}
    setUploading(true);setError("");
    const ext=(file.name.split(".").pop()||"jpg").toLowerCase();
    const path=session.user.id+"/avatar-"+Date.now()+"."+ext;
    const {error:e}=await supabase.storage.from("teacher-profiles").upload(path,file,{upsert:true,contentType:file.type});
    if(e){setError(e.message);setUploading(false);return}
    const {data:urlData}=supabase.storage.from("teacher-profiles").getPublicUrl(path);
    const {error:ue}=await supabase.from("profiles").update({avatar_url:urlData.publicUrl}).eq("id",session.user.id);
    if(ue)setError(ue.message);else{setForm(v=>({...v,avatar_url:urlData.publicUrl}));setProfile((v:any)=>({...v,avatar_url:urlData.publicUrl}))}
    setUploading(false);
  }
  const name=String(profile?.first_name||"")+" "+String(profile?.last_name||"");
  const initials=name.trim().split(/\s+/).map(x=>x[0]).join("").slice(0,2).toUpperCase()||"?";
  const pt=lang==="lt"?{eyebrow:"MANO PROFILIS",teacher:"Mokytojas",groups:"Jūsų grupės",edit:"Redaguoti",cancel:"Atšaukti",first:"Vardas",last:"Pavardė",phone:"Telefonas",specialization:"Specializacija",about:"Apie mane",placeholder:"Trumpai apie save, patirtį ir šokio kryptis…",save:"Išsaugoti profilį",saving:"Saugoma…",notProvided:"Nenurodytas",notSpecified:"Nenurodyta",aboutHint:"Čia galite trumpai parašyti apie save, savo patirtį ir šokio kryptis.",uploading:"Įkeliama nuotrauka…",photo:"Profilio nuotrauka",choose:"Pasirinkite nuotrauką.",size:"Nuotrauka turi būti iki 5 MB."}:lang==="es"?{eyebrow:"MI PERFIL",teacher:"Profesor",groups:"Tus grupos",edit:"Editar",cancel:"Cancelar",first:"Nombre",last:"Apellido",phone:"Teléfono",specialization:"Especialización",about:"Sobre mí",placeholder:"Escribe brevemente sobre ti, tu experiencia y estilos de baile…",save:"Guardar perfil",saving:"Guardando…",notProvided:"No indicado",notSpecified:"No indicada",aboutHint:"Puedes escribir aquí sobre tu experiencia y estilos de baile.",uploading:"Subiendo foto…",photo:"Foto de perfil",choose:"Elige una imagen.",size:"La imagen debe pesar menos de 5 MB."}:{eyebrow:"MY PROFILE",teacher:"Teacher",groups:"Your groups",edit:"Edit",cancel:"Cancel",first:"First name",last:"Last name",phone:"Phone",specialization:"Specialization",about:"About me",placeholder:"Write briefly about yourself, your experience and dance styles…",save:"Save profile",saving:"Saving…",notProvided:"Not provided",notSpecified:"Not specified",aboutHint:"Write a short introduction about your experience and dance styles.",uploading:"Uploading photo…",photo:"Profile photo",choose:"Please choose an image.",size:"The image must be under 5 MB."};
  return <div className="stack">
    {error&&<div className="alert">{error}</div>}
    <section className="panel teacher-profile-panel">
      <div className="teacher-profile-hero">
        <div className="teacher-avatar-wrap">{profile?.avatar_url?<img src={profile.avatar_url} alt="Profilio nuotrauka" className="teacher-avatar-img"/>:<div className="teacher-avatar-placeholder">{initials}</div>}<label className="teacher-avatar-upload" title={pt.photo}><Camera size={15}/><input type="file" accept="image/*" onChange={e=>e.target.files?.[0]&&uploadPhoto(e.target.files[0])}/></label></div>
        <div className="teacher-profile-title"><div className="eyebrow">{pt.eyebrow}</div><h2>{name.trim()||pt.teacher}</h2><p>{profile?.email||session?.user?.email||"—"}</p>{groups.length>0&&<span>{pt.groups}: {groups.join(" · ")}</span>}</div>
        <button className="secondary" onClick={()=>setEditing(v=>!v)}>{editing?pt.cancel:"✎ "+pt.edit}</button>
      </div>
      {editing?<div className="form-grid teacher-profile-form">
        <label className="field"><span>{pt.first}</span><input value={form.first_name} onChange={e=>setForm(v=>({...v,first_name:e.target.value}))}/></label>
        <label className="field"><span>{pt.last}</span><input value={form.last_name} onChange={e=>setForm(v=>({...v,last_name:e.target.value}))}/></label>
        <label className="field"><span>{pt.phone}</span><input value={form.phone} onChange={e=>setForm(v=>({...v,phone:e.target.value}))}/></label>
        <label className="field"><span>{pt.specialization}</span><input value={form.specialization} onChange={e=>setForm(v=>({...v,specialization:e.target.value}))} placeholder="Contemporary, Lady Šoka"/></label>
        <label className="field" style={{gridColumn:"1/-1"}}><span>{pt.about}</span><textarea value={form.bio} onChange={e=>setForm(v=>({...v,bio:e.target.value}))} rows={4} placeholder="Trumpai apie save, patirtį, šokio kryptis…"/></label>
        <div className="profile-actions"><button className="primary" onClick={save} disabled={saving}>{saving?pt.saving:pt.save}</button></div>
      </div>:<div className="teacher-profile-info"><div><span>{pt.phone}</span><b>{profile?.phone||pt.notProvided}</b></div><div><span>{pt.specialization}</span><b>{profile?.specialization||pt.notSpecified}</b></div><div className="teacher-profile-bio"><span>Apie mane</span><p>{profile?.bio||pt.aboutHint}</p></div></div>}
      {uploading&&<div className="muted">{pt.uploading}</div>}
    </section>
  </div>
}
function Dashboard({role,lang,seasonId}:{role:Role;lang:Lang;seasonId:string}){
  const [monthlyClients,setMonthlyClients]=useState(0),[oneOffClients,setOneOffClients]=useState(0),[oneOffBookings,setOneOffBookings]=useState(0),[rentalClients,setRentalClients]=useState(0),[rentals,setRentals]=useState(0),[groups,setGroups]=useState(0),[totalDue,setTotalDue]=useState(0),[totalPaid,setTotalPaid]=useState(0),[outstanding,setOutstanding]=useState(0),[loading,setLoading]=useState(true);
  const [dashboardMonth,setDashboardMonth]=useState(currentMonth());
  function clientKey(row:any){
    if(row.student_id)return "student:"+row.student_id;
    const email=String(row.email??"").trim().toLowerCase();
    const phone=String(row.phone??"").replace(/\D/g,"");
    const name=(String(row.first_name??"")+" "+String(row.last_name??"")).trim().toLowerCase();
    return email?"email:"+email:phone?"phone:"+phone:name?"name:"+name:"row:"+row.id;
  }
  useEffect(()=>{
    let alive=true;
    async function load(){
      setLoading(true);
      const [gq,oq,rq]=await Promise.all([
        supabase.from("groups").select("id",{count:"exact",head:true}).eq("is_active",true),
        supabase.from("drop_in_bookings").select("id,student_id,email,phone,first_name,last_name").neq("status","cancelled"),
        supabase.from("studio_rentals").select("id,customer_name,email,phone").eq("is_active",true)
      ]);
      let monthly=0;
      let monthChargeQuery:any=supabase.from("monthly_charges").select("student_id").eq("month",dashboardMonth+"-01").eq("source_active",true);
      if(seasonId)monthChargeQuery=monthChargeQuery.eq("season_id",seasonId);
      const {data:monthChargeRows}=await monthChargeQuery;
      monthly=new Set((monthChargeRows??[]).map((x:any)=>x.student_id).filter(Boolean)).size;
      const oneOffRows=oq.data??[];
      const rentalRows=rq.data??[];
      if(!alive)return;
      setMonthlyClients(monthly);
      setOneOffClients(new Set(oneOffRows.map(clientKey)).size);
      setOneOffBookings(oneOffRows.length);
      setRentalClients(new Set(rentalRows.map((x:any)=>{
        const email=String(x.email??"").trim().toLowerCase();
        const phone=String(x.phone??"").replace(/\D/g,"");
        const name=String(x.customer_name??"").trim().toLowerCase();
        return email?"email:"+email:phone?"phone:"+phone:name?"name:"+name:"row:"+x.id;
      })).size);
      setRentals(rentalRows.length);
      setGroups(gq.count??0);
      let chargeQuery:any=supabase.from("monthly_charges").select("amount_due,amount_paid,students!inner(is_active)").eq("students.is_active",true).eq("month",dashboardMonth+"-01").eq("source_active",true);
      if(seasonId)chargeQuery=chargeQuery.eq("season_id",seasonId);
      const {data:charges}=await chargeQuery;
      const chargeRows=charges??[];
      const dueTotal=chargeRows.reduce((s:number,x:any)=>s+Number(x.amount_due||0),0);
      const paidTotal=chargeRows.reduce((s:number,x:any)=>s+Number(x.amount_paid||0),0);
      setTotalDue(dueTotal);
      setTotalPaid(paidTotal);
      setOutstanding(Math.max(0,dueTotal-paidTotal));
      setLoading(false);
    }
    load();
    return()=>{alive=false};
  },[seasonId,dashboardMonth]);
  const dashboardMonthLabel=new Date(dashboardMonth+"-01T12:00:00").toLocaleDateString("lt-LT",{month:"long",year:"numeric"});
  return <div className="stack">
    {role==="admin"&&<section className="client-overview">
      <div className="client-overview-head"><div><div className="eyebrow">{lang==="lt"?"KLIENTŲ APŽVALGA":lang==="es"?"RESUMEN DE CLIENTES":"CLIENT OVERVIEW"}</div><h2>{lang==="lt"?"Klientai pagal paslaugą":lang==="es"?"Clientes por servicio":"Clients by service"}</h2><p>{lang==="lt"?"Šokių abonementai, vienkartinės pamokos ir studijos nuoma skaičiuojami atskirai.":lang==="es"?"Los abonos, las clases sueltas y el alquiler se cuentan por separado.":"Subscriptions, drop-in lessons and studio rentals are counted separately."}</p></div></div>
      <div className="client-segments">
        <article className="client-segment"><div className="client-segment-icon"><Users size={20}/></div><div><span>{lang==="lt"?"Mėnesiniai šokių klientai":lang==="es"?"Clientes con abono":"Subscription clients"}</span><b>{loading?"—":monthlyClients}</b><small>{lang==="lt"?"Aktyvūs šio sezono mokiniai":lang==="es"?"Alumnos activos de esta temporada":"Active students this season"}</small></div></article>
        <article className="client-segment"><div className="client-segment-icon"><CalendarCheck size={20}/></div><div><span>{lang==="lt"?"Vienkartinių pamokų klientai":lang==="es"?"Clientes de clases sueltas":"Drop-in lesson clients"}</span><b>{loading?"—":oneOffClients}</b><small>{oneOffBookings} {lang==="lt"?"vienkartinės rezervacijos":lang==="es"?"reservas":"bookings"}</small></div></article>
        <article className="client-segment"><div className="client-segment-icon"><Building2 size={20}/></div><div><span>{lang==="lt"?"Nuomos klientai":lang==="es"?"Clientes de alquiler":"Rental clients"}</span><b>{loading?"—":rentalClients}</b><small>{rentals} {lang==="lt"?"nuomos rezervacijos":lang==="es"?"reservas de alquiler":"rental bookings"}</small></div></article>
      </div>
    </section>}
    <section className="dashboard-month-filter">
      <div><div className="eyebrow">{lang==="lt"?"MOKĖJIMŲ APŽVALGA":lang==="es"?"RESUMEN DE PAGOS":"PAYMENT OVERVIEW"}</div><b>{lang==="lt"?"Pasirinkite mėnesį":lang==="es"?"Elige un mes":"Choose a month"}</b><span>{lang==="lt"?"„Neapmokėta“ suma skaičiuojama tik pagal pasirinktą mėnesį.":lang==="es"?"El importe pendiente se calcula solo para el mes seleccionado.":"The outstanding amount is calculated only for the selected month."}</span></div>
      <label className="field"><span>{t("monthly")}</span><input type="month" value={dashboardMonth} onChange={e=>setDashboardMonth(e.target.value)}/></label>
    </section>
    <section className="stats payment-dashboard-stats">
      <div className="stat"><span>💶 Turi būti apmokėta · {dashboardMonthLabel}</span><b>{loading?"—":money(totalDue)}</b><small>{lang==="lt"?"Visa pasirinkto mėnesio abonementų suma":lang==="es"?"Total de abonos del mes seleccionado":"Total subscription amount for the selected month"}</small></div>
      <div className="stat"><span>✓ Apmokėta · {dashboardMonthLabel}</span><b>{loading?"—":money(totalPaid)}</b><small>{lang==="lt"?"Jau užregistruoti mokėjimai":lang==="es"?"Pagos ya registrados":"Payments already recorded"}</small></div>
      <div className="stat"><span>○ Neapmokėta · {dashboardMonthLabel}</span><b>{loading?"—":money(outstanding)}</b><small>{lang==="lt"?"Dar likusi suma":lang==="es"?"Importe pendiente":"Remaining amount"}</small></div>
    </section>
    <section className="stats">
      <div className="stat"><span>{tx(lang,"activeGroups")}</span><b>{loading?"—":groups}</b></div>
      <div className="stat"><span>{lang==="lt"?"Šokių klientai šį sezoną":lang==="es"?"Clientes de baile esta temporada":"Dance clients this season"}</span><b>{loading?"—":monthlyClients}</b></div>
    </section>
    <section className="panel empty"><CalendarCheck size={28}/><p>{tx(lang,"today")}</p></section>
  </div>
}
function Students({role,lang,seasonId}:{role:Role;lang:Lang;seasonId:string}){
  const t=(k:TKey)=>tx(lang,k);
  const [rows,setRows]=useState<Student[]>([]),[groups,setGroups]=useState<Group[]>([]),[prices,setPrices]=useState<Price[]>([]),[memberships,setMemberships]=useState<Record<string,string[]>>({}),[search,setSearch]=useState(""),[category,setCategory]=useState<"all"|"children"|"adults">("all"),[selectedGroupFilter,setSelectedGroupFilter]=useState("all"),[open,setOpen]=useState(false),[detail,setDetail]=useState<Student|null>(null),[editing,setEditing]=useState<Student|null>(null),[selectedGroups,setSelectedGroups]=useState<string[]>([]),[form,setForm]=useState({first_name:"",last_name:"",email:"",phone:"",date_of_birth:"",parent_name:"",parent_phone:"",parent_email:"",notes:"",payment_preference:"",billing_price_id:""}),[error,setError]=useState("");
  
  async function load(){
    const [s,g,p]=await Promise.all([supabase.from("students").select("*").eq("is_active",true).order("last_name"),supabase.from("groups").select("*").eq("is_active",true).order("name"),supabase.from("prices").select("*").eq("is_active",true).eq("billing_period","monthly").order("amount")]);
    if(s.error||g.error||p.error){setError((s.error||g.error||p.error)!.message);return}
    setRows((s.data??[]) as Student[]);setGroups((g.data??[]) as Group[]);setPrices((p.data??[]) as Price[]);
    const map:Record<string,string[]>={};
    if(seasonId){
      const {data:configs}=await supabase.from("season_groups").select("id,group_id").eq("season_id",seasonId).eq("is_active",true);
      const configMap:Record<string,string>={};(configs??[]).forEach((x:any)=>configMap[x.group_id]=x.id);
      const ids=Object.values(configMap);
      if(ids.length){const {data:m}=await supabase.from("season_enrollments").select("student_id,season_group_id").eq("season_id",seasonId).eq("is_active",true).in("season_group_id",ids);(m??[]).forEach((x:any)=>{const gid=Object.keys(configMap).find(k=>configMap[k]===x.season_group_id);if(gid)map[x.student_id]=[...(map[x.student_id]??[]),gid]})}
    }else{const {data:m}=await supabase.from("group_students").select("student_id,group_id").eq("is_active",true);(m??[]).forEach((x:any)=>map[x.student_id]=[...(map[x.student_id]??[]),x.group_id])}
    setMemberships(map)
  }
  useEffect(()=>{load()},[seasonId]);
  const currentRows=useMemo(()=>rows.filter(s=>(memberships[s.id]??[]).length>0),[rows,memberships]);
  const filtered=useMemo(()=>{const q=search.trim().toLowerCase();return currentRows.filter(s=>{const names=groups.filter(g=>(memberships[s.id]??[]).includes(g.id)).map(g=>g.name);const adult=names.some(n=>n.toLowerCase().startsWith("suaugusieji"));const cat=category==="all"||(category==="adults"&&adult)||(category==="children"&&!adult);const text=[s.first_name,s.last_name,s.email,s.phone,s.parent_name,s.parent_email,...names].filter(Boolean).join(" ").toLowerCase();const inGroup=selectedGroupFilter==="all"||(memberships[s.id]??[]).includes(selectedGroupFilter);return cat&&inGroup&&(!q||text.includes(q))})},[currentRows,groups,memberships,search,category,selectedGroupFilter]);
  const grouped=useMemo(()=>{const map:Record<string,{group:Group;students:Student[]}>= {};filtered.forEach(s=>(memberships[s.id]??[]).forEach(gid=>{const g=groups.find(x=>x.id===gid);if(!g)return;if(!map[gid])map[gid]={group:g,students:[]};map[gid].students.push(s)}));return Object.values(map).sort((a,b)=>a.group.name.localeCompare(b.group.name,"lt"))},[filtered,groups,memberships]);
  function create(){setDetail(null);setEditing(null);setSelectedGroups([]);setForm({first_name:"",last_name:"",email:"",phone:"",date_of_birth:"",parent_name:"",parent_phone:"",parent_email:"",notes:"",payment_preference:"",billing_price_id:""});setOpen(true)}
  function edit(s:Student){setDetail(null);setEditing(s);setSelectedGroups(memberships[s.id]??[]);setForm({first_name:s.first_name,last_name:s.last_name,email:s.email??"",phone:s.phone??"",date_of_birth:s.date_of_birth??"",parent_name:s.parent_name??"",parent_phone:s.parent_phone??"",parent_email:s.parent_email??"",notes:s.notes??"",payment_preference:s.payment_preference??"",billing_price_id:s.billing_price_id??""});setOpen(true)}
  async function removeStudentFromGroup(s:Student, groupId:string, groupName:string){
    if(!window.confirm(`Pašalinti „${s.first_name} ${s.last_name}“ tik iš grupės „${groupName}“? Kitos jo grupės ir visa istorija liks nepakeistos.`)) return;
    setError("");
    if(seasonId){
      const {data:config,error:configError}=await supabase.from("season_groups").select("id").eq("season_id",seasonId).eq("group_id",groupId).eq("is_active",true).maybeSingle();
      if(configError){setError(configError.message);return}
      if(!config){setError("Ši grupė nepriskirta pasirinktam sezonui.");return}
      const membershipUpdate=await supabase.from("season_enrollments").update({is_active:false,ended_on:todayISO()}).eq("season_id",seasonId).eq("season_group_id",config.id).eq("student_id",s.id).eq("is_active",true);
      if(membershipUpdate.error){setError(membershipUpdate.error.message);return}
      const {count,error:countError}=await supabase.from("season_enrollments").select("id",{count:"exact",head:true}).eq("season_id",seasonId).eq("student_id",s.id).eq("is_active",true);
      if(countError){setError(countError.message);return}
      if((count??0)===0){
        const studentUpdate=await supabase.from("students").update({is_active:false}).eq("id",s.id);
        if(studentUpdate.error){setError(studentUpdate.error.message);return}
      }
    }else{
      const membershipUpdate=await supabase.from("group_students").update({is_active:false,left_at:todayISO()}).eq("student_id",s.id).eq("group_id",groupId).eq("is_active",true);
      if(membershipUpdate.error){setError(membershipUpdate.error.message);return}
      const {count,error:countError}=await supabase.from("group_students").select("id",{count:"exact",head:true}).eq("student_id",s.id).eq("is_active",true);
      if(countError){setError(countError.message);return}
      if((count??0)===0){
        const studentUpdate=await supabase.from("students").update({is_active:false}).eq("id",s.id);
        if(studentUpdate.error){setError(studentUpdate.error.message);return}
      }
    }
    setDetail(null); await load();
  }
  async function save(){
    if(!form.first_name.trim()||!form.last_name.trim())return;
    const selectedPrice=prices.find(p=>p.id===form.billing_price_id);
    const billingChanged=Boolean(editing && (editing.billing_price_id??"")!==(form.billing_price_id||""));
    const payload={...form,email:form.email||null,phone:form.phone||null,date_of_birth:form.date_of_birth||null,parent_name:form.parent_name||null,parent_phone:form.parent_phone||null,parent_email:form.parent_email||null,notes:form.notes||null,payment_preference:form.payment_preference||null,billing_price_id:form.billing_price_id||null};
    const r=editing?await supabase.from("students").update(payload).eq("id",editing.id).select().single():await supabase.from("students").insert(payload).select().single();
    if(r.error){setError(r.error.message);return} const id=(r.data as any).id;
    if(editing && billingChanged){
      const note=selectedPrice ? (Number(selectedPrice.amount)===40?"1x/week":Number(selectedPrice.amount)===50?"2x/week":"3x/week") : null;
      const noteUpdate=await supabase.from("students").update({billing_note:note}).eq("id",id);
      if(noteUpdate.error){setError(noteUpdate.error.message);return}
      if(selectedPrice){
        const chargeUpdate=await supabase.from("monthly_charges").update({price_id:selectedPrice.id,amount_due:Number(selectedPrice.amount)})
          .eq("student_id",id).gte("month",currentMonth()+"-01").eq("amount_paid",0).in("status",["unpaid","overdue"]);
        if(chargeUpdate.error){setError(chargeUpdate.error.message);return}
      }
    }
    if(seasonId){const {data:configs}=await supabase.from("season_groups").select("id,group_id").eq("season_id",seasonId).eq("is_active",true);const configMap:Record<string,string>={};(configs??[]).forEach((x:any)=>configMap[x.group_id]=x.id);await supabase.from("season_enrollments").update({is_active:false,ended_on:todayISO()}).eq("season_id",seasonId).eq("student_id",id);const inserts=selectedGroups.filter(gid=>configMap[gid]).map(gid=>({season_id:seasonId,season_group_id:configMap[gid],student_id:id,enrolled_on:todayISO(),is_active:true}));if(inserts.length){const ins=await supabase.from("season_enrollments").upsert(inserts,{onConflict:"season_id,season_group_id,student_id"});if(ins.error){setError(ins.error.message);return}}}
    else{await supabase.from("group_students").update({is_active:false}).eq("student_id",id);if(selectedGroups.length)await supabase.from("group_students").upsert(selectedGroups.map(group_id=>({student_id:id,group_id,is_active:true})),{onConflict:"student_id,group_id"})}
    setOpen(false);await load()
  }
  return <div className="stack">{error&&<div className="alert">{error}</div>}
    <div className="toolbar"><input value={search} onChange={e=>setSearch(e.target.value)} placeholder={t("searchStudents")}/>{role==="admin"&&<button className="secondary" onClick={create}><Plus size={16}/>{t("addStudent")}</button>}</div>
    <div className="student-filters"><div className="student-category-tabs"><button className={category==="all"?"student-category active":"student-category"} onClick={()=>setCategory("all")}>Visi</button><button className={category==="children"?"student-category active":"student-category"} onClick={()=>setCategory("children")}>Vaikai</button><button className={category==="adults"?"student-category active":"student-category"} onClick={()=>setCategory("adults")}>Suaugusieji</button></div><select className="student-group-select" value={selectedGroupFilter} onChange={e=>setSelectedGroupFilter(e.target.value)}><option value="all">{lang==="lt"?"Visos grupės":lang==="es"?"Todos los grupos":"All groups"}</option>{groups.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}</select></div>
    <div className="students-summary">{filtered.length} klientai · rodomi tik šio sezono grupėse</div>
    <section className="student-groups-list">{grouped.map(({group,students})=><section className="student-group-section" key={group.id}><div className="student-group-header"><span><b>{group.name}</b><small>{students.length} mok.</small></span></div><div className="list">{students.map(s=><article className="card clickable" key={group.id+"-"+s.id} onClick={()=>setDetail(s)}><div><b>{s.first_name} {s.last_name}</b><span>{s.email||s.phone||s.parent_email||s.parent_phone||t("noContact")}</span></div><div className="card-actions">{role==="admin"&&<><button className="secondary compact" onClick={e=>{e.stopPropagation();edit(s)}}><Pencil size={13}/>{t("edit")}</button><button className="icon-btn danger" title="Pašalinti iš šios grupės" onClick={e=>{e.stopPropagation();removeStudentFromGroup(s,group.id,group.name)}}><Trash2 size={14}/></button></>}<ChevronRight size={17}/></div></article>)}</div></section>)}{!grouped.length&&<div className="empty">Šiame sezone pagal pasirinktą filtrą mokinių nėra.</div>}</section>
    {detail&&<StudentDetail student={detail} groups={groups.filter(g=>(memberships[detail.id]??[]).includes(g.id))} lang={lang} close={()=>setDetail(null)}/>}
    {open&&<Modal title={editing?t("edit"):t("addStudent")} close={()=>setOpen(false)}><div><label>{t("subscriptionPlan")}</label><select value={form.billing_price_id} onChange={e=>setForm({...form,billing_price_id:e.target.value})}><option value="">—</option>{prices.filter(p=>[40,50,60].includes(Number(p.amount))).map(p=><option key={p.id} value={p.id}>{Number(p.amount)===40?t("onePerWeek"):Number(p.amount)===50?t("twoPerWeek"):t("threePerWeek")}</option>)}</select></div><div className="form-grid"><Field label={t("firstName")} value={form.first_name} set={v=>setForm({...form,first_name:v})}/><Field label={t("lastName")} value={form.last_name} set={v=>setForm({...form,last_name:v})}/><Field label={t("email")} value={form.email} set={v=>setForm({...form,email:v})}/><Field label={t("phone")} value={form.phone} set={v=>setForm({...form,phone:v})}/><Field label={t("dob")} type="date" value={form.date_of_birth} set={v=>setForm({...form,date_of_birth:v})}/><Field label={t("parentName")} value={form.parent_name} set={v=>setForm({...form,parent_name:v})}/><Field label={t("parentPhone")} value={form.parent_phone} set={v=>setForm({...form,parent_phone:v})}/><Field label={t("parentEmail")} value={form.parent_email} set={v=>setForm({...form,parent_email:v})}/><div><label>{t("paymentPreference")}</label><select value={form.payment_preference} onChange={e=>setForm({...form,payment_preference:e.target.value})}><option value="">—</option><option value="bank_transfer">{t("bankPreference")}</option><option value="card">{t("cardPreference")}</option><option value="cash">{t("cashPreference")}</option></select></div></div><label>{t("notes")}</label><textarea value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/><label>{seasonId?"Šio sezono grupė":"Grupė"}</label><div className="checks">{groups.map(g=><label className="check" key={g.id}><input type="checkbox" checked={selectedGroups.includes(g.id)} onChange={()=>setSelectedGroups(x=>x.includes(g.id)?x.filter(id=>id!==g.id):[...x,g.id])}/>{g.name}</label>)}</div><div className="actions"><button className="secondary" onClick={()=>setOpen(false)}>{t("cancel")}</button><button className="primary small-btn" onClick={save}>{t("save")}</button></div></Modal>}
  </div>
}
function StudentDetail({student,groups,lang,close}:{student:Student;groups:Group[];lang:Lang;close:()=>void}) {
  const t=(k:TKey)=>tx(lang,k);
  return (
    <Modal title={`${student.first_name} ${student.last_name}`} close={close}>
      <div className="detail-grid">
        <div>
          <span className="detail-label">{t("contact")}</span>
          <b>{student.email||"—"}</b>
          <span>{student.phone||"—"}</span>
        </div>
        <div>
          <span className="detail-label">{t("parentName")}</span>
          <b>{student.parent_name||"—"}</b>
          <span>{student.parent_email||student.parent_phone||"—"}</span>
        </div>
        <div>
          <span className="detail-label">{t("dob")}</span>
          <b>{student.date_of_birth||"—"}</b>
        </div>
        <div>
          <span className="detail-label">{t("groups")}</span>
          {groups.length > 0 ? (
            groups.map(g=><span key={g.id}>{g.name}</span>)
          ) : (
            <span>—</span>
          )}
        </div>
        <div>
          <span className="detail-label">{t("paymentPreference")}</span>
          <span>
            {student.payment_preference==="bank_transfer"
              ? t("bankPreference")
              : student.payment_preference==="card"
                ? t("cardPreference")
                : student.payment_preference==="cash"
                  ? t("cashPreference")
                  : "—"}
          </span>
        </div>
      </div>
      {student.notes && (
        <>
          <label>{t("notes")}</label>
          <div className="note-box">{student.notes}</div>
        </>
      )}
    </Modal>
  );
}

function Groups({role,lang,seasonId}:{role:Role;lang:Lang;seasonId:string}){
  const t=(k:TKey)=>tx(lang,k);
  const [rows,setRows]=useState<Group[]>([]),[open,setOpen]=useState(false),[detail,setDetail]=useState<Group|null>(null),[editing,setEditing]=useState<Group|null>(null);
  const [name,setName]=useState(""),[level,setLevel]=useState(""),[description,setDescription]=useState("");
  const [teachers,setTeachers]=useState<any[]>([]),[teacherId,setTeacherId]=useState(""),[memberCounts,setMemberCounts]=useState<Record<string,number>>({});
  const [day1,setDay1]=useState("1"),[start1,setStart1]=useState("16:00"),[end1,setEnd1]=useState("17:00");
  const [day2,setDay2]=useState("3"),[start2,setStart2]=useState("16:00"),[end2,setEnd2]=useState("17:00");
  const weekdays=[["1","Pirmadienis"],["2","Antradienis"],["3","Trečiadienis"],["4","Ketvirtadienis"],["5","Penktadienis"],["6","Šeštadienis"],["7","Sekmadienis"]];
  async function load(){
    let query:any=supabase.from("groups").select("*").eq("is_active",true).order("name");
    if(seasonId){
      const {data:configs,error}=await supabase.from("season_groups").select("group_id").eq("season_id",seasonId).eq("is_active",true);
      if(error){alert(error.message);return}
      const ids=(configs??[]).map(x=>x.group_id); if(!ids.length){setRows([]);return} query=query.in("id",ids);
      const {data:ts}=await supabase.from("teachers").select("id,profiles(first_name,last_name,email)").eq("is_active",true);
      setTeachers(ts??[]);
    }
    const {data,error}=await query; if(error){alert(error.message);return} setRows((data??[]) as Group[]);
    const groupIds=(data??[]).map((x:any)=>x.id);
    if(groupIds.length){
      const {data:members}=await supabase.from("group_students").select("group_id,student_id,students(first_name,last_name)").in("group_id",groupIds).eq("is_active",true);
      const counts:Record<string,number>={};
      (members??[]).forEach((m:any)=>{const n=String(m.students?.first_name??"").trim();const ln=String(m.students?.last_name??"").trim();if(/^[0-9]+$/.test(n)&&!ln)return;counts[m.group_id]=(counts[m.group_id]??0)+1});
      setMemberCounts(counts);
    }else setMemberCounts({});
  }
  useEffect(()=>{load()},[seasonId]);
  function create(){setEditing(null);setName("");setLevel("");setDescription("");setTeacherId("");setDay1("1");setStart1("16:00");setEnd1("17:00");setDay2("3");setStart2("16:00");setEnd2("17:00");setOpen(true)}
  async function edit(g:Group){
    setEditing(g);setName(g.name);setLevel(g.level??"");setDescription(g.description??"");setTeacherId("");setDay1("1");setStart1("16:00");setEnd1("17:00");setDay2("3");setStart2("16:00");setEnd2("17:00");
    if(seasonId){
      const {data:sg}=await supabase.from("season_groups").select("id").eq("season_id",seasonId).eq("group_id",g.id).maybeSingle();
      if(sg){
        const [{data:st},{data:ss}]=await Promise.all([
          supabase.from("season_group_teachers").select("teacher_id").eq("season_group_id",sg.id).eq("is_primary",true).maybeSingle(),
          supabase.from("season_group_schedules").select("weekday,starts_at,ends_at").eq("season_group_id",sg.id).order("weekday")
        ]);
        setTeacherId(st?.teacher_id??"");
        const slots=ss??[];
        if(slots[0]){setDay1(String(slots[0].weekday));setStart1(String(slots[0].starts_at).slice(0,5));setEnd1(String(slots[0].ends_at).slice(0,5))}
        if(slots[1]){setDay2(String(slots[1].weekday));setStart2(String(slots[1].starts_at).slice(0,5));setEnd2(String(slots[1].ends_at).slice(0,5))}
      }
    }
    setOpen(true)
  }
  async function save(){
    const p={name:name.trim(),level:level||null,description:description||null}; if(!p.name)return;
    if(seasonId){
      let groupId=editing?.id;
      if(editing){
        const up=await supabase.from("groups").update(p).eq("id",editing.id); if(up.error){alert(up.error.message);return}
      }else{
        const created=await supabase.from("groups").insert(p).select("id").single(); if(created.error){alert(created.error.message);return} groupId=created.data.id;
      }
      const sg=await supabase.from("season_groups").upsert({season_id:seasonId,group_id:groupId,name:p.name,category:p.level,is_active:true},{onConflict:"season_id,group_id"}).select("id").single();
      if(sg.error){alert(sg.error.message);return}
      await supabase.from("season_group_teachers").delete().eq("season_group_id",sg.data.id);
      if(teacherId)await supabase.from("season_group_teachers").insert({season_group_id:sg.data.id,teacher_id:teacherId,is_primary:true});
      await supabase.from("season_group_schedules").delete().eq("season_group_id",sg.data.id);
      const slots=[
        {weekday:Number(day1),starts_at:start1,ends_at:end1},
        ...(day2&&start2&&end2&&day2!==day1?[{weekday:Number(day2),starts_at:start2,ends_at:end2}]:[])
      ].filter(x=>x.starts_at<x.ends_at);
      if(slots.length)await supabase.from("season_group_schedules").insert(slots.map(x=>({...x,season_group_id:sg.data.id})));
    }else{
      const r=editing?await supabase.from("groups").update(p).eq("id",editing.id):await supabase.from("groups").insert(p);
      if(r.error){alert(r.error.message);return}
    }
    setOpen(false);await load()
  }
  const teacherName=(x:any)=>`${x.profiles?.first_name??""} ${x.profiles?.last_name??""}`.trim();
  if(!rows.length)return <div className="stack">{role==="admin"&&<div className="toolbar"><span>{seasonId?"Sezono grupės":"Grupės"}</span><button className="secondary" onClick={create}><Plus size={16}/>{t("addGroup")}</button></div>}<section className="panel empty"><p>{seasonId?"Šiam sezonui grupės dar nesukonfigūruotos.":"Grupių nėra."}</p></section></div>;
  return <div className="stack">
    <div className="toolbar"><span>{seasonId?"Sezono grupės":"Grupės"}</span>{role==="admin"&&<button className="secondary" onClick={create}><Plus size={16}/>{t("addGroup")}</button>}</div>
    <section className="list">{rows.map(g=><article className="card clickable" key={g.id} onClick={()=>setDetail(g)}>
      <div><b>{g.name}</b><span>{g.level||"—"}</span><span>{memberCounts[g.id]??0} mokiniai</span><span>{g.description||""}</span></div>
      <div className="card-actions">{role==="admin"&&<button className="secondary compact" onClick={e=>{e.stopPropagation();edit(g)}}><Pencil size={13}/>{t("edit")}</button>}<ChevronRight size={17}/></div>
    </article>)}</section>
    {detail&&<GroupDetail group={detail} role={role} lang={lang} seasonId={seasonId} close={()=>setDetail(null)}/>}
    {open&&<Modal title={editing?t("editGroup"):t("addGroup")} close={()=>setOpen(false)}>
      <Field label={t("groupName")} value={name} set={setName}/><Field label={t("level")} value={level} set={setLevel}/>
      {seasonId&&<><label>Treneris</label><select value={teacherId} onChange={e=>setTeacherId(e.target.value)}><option value="">— Pasirinkite trenerį —</option>{teachers.map(x=><option key={x.id} value={x.id}>{teacherName(x)}</option>)}</select>
      <div className="form-grid"><div><label>1 diena</label><select value={day1} onChange={e=>setDay1(e.target.value)}>{weekdays.map(x=><option key={x[0]} value={x[0]}>{x[1]}</option>)}</select></div><Field label="Nuo" type="time" value={start1} set={setStart1}/><Field label="Iki" type="time" value={end1} set={setEnd1}/></div>
      <div className="form-grid"><div><label>2 diena</label><select value={day2} onChange={e=>setDay2(e.target.value)}>{weekdays.map(x=><option key={x[0]} value={x[0]}>{x[1]}</option>)}</select></div><Field label="Nuo" type="time" value={start2} set={setStart2}/><Field label="Iki" type="time" value={end2} set={setEnd2}/></div></>}
      <label>{t("description")}</label><textarea value={description} onChange={e=>setDescription(e.target.value)}/>
      <div className="actions"><button className="secondary" onClick={()=>setOpen(false)}>{t("cancel")}</button><button className="primary small-btn" onClick={save}>{t("save")}</button></div>
    </Modal>}
  </div>
}

function GroupDetail({group,role,lang,seasonId,close}:{group:Group;role:Role;lang:Lang;seasonId:string;close:()=>void}){
  const t=(k:TKey)=>tx(lang,k);
  const [students,setStudents]=useState<Student[]>([]);
  const [tab,setTab]=useState<"students"|"attendance"|"payments">("students");
  const [date,setDate]=useState(todayISO);
  useEffect(()=>{(async()=>{
    let ids:string[]=[];
    if(seasonId){
      const {data:config}=await supabase.from("season_groups").select("id").eq("season_id",seasonId).eq("group_id",group.id).maybeSingle();
      if(config){
        const {data:m}=await supabase.from("season_enrollments").select("student_id").eq("season_id",seasonId).eq("season_group_id",config.id).eq("is_active",true);
        ids=(m??[]).map(x=>x.student_id);
      }
    }else{
      const {data:m}=await supabase.from("group_students").select("student_id").eq("group_id",group.id).eq("is_active",true);
      ids=(m??[]).map((x:any)=>x.student_id);
    }
    if(ids.length){
      const {data:s}=await supabase.from("students").select("*").in("id",ids).order("last_name");
      setStudents((s??[]) as Student[]);
    }else setStudents([]);
  })()},[group.id,seasonId]);
  return <Modal title={group.name} close={close}>
    <div className="group-detail-head"><div><div className="eyebrow">{t("groupDetail")}</div></div><span className="count-badge">{students.length} {t("members").toLowerCase()}</span></div>
    <div className="detail-grid"><div><span className="detail-label">{t("level")}</span><span>{group.level||"—"}</span></div><div><span className="detail-label">{t("members")}</span><span>{students.length}</span></div></div>
    {group.description&&<div className="note-box" style={{marginTop:12}}>{group.description}</div>}
    <div className="group-tabs">
      <button className={tab==="students"?"group-tab active":"group-tab"} onClick={()=>setTab("students")}>{t("members")}</button>
      <button className={tab==="attendance"?"group-tab active":"group-tab"} onClick={()=>setTab("attendance")}>{t("groupAttendance")}</button>
      <button className={tab==="payments"?"group-tab active":"group-tab"} onClick={()=>setTab("payments")}>{t("groupPayments")}</button>
    </div>
    {tab==="students"&&<section className="list group-roster">{students.map(s=><article className="card" key={s.id}><div><b>{s.first_name} {s.last_name}</b><span>{s.email||s.phone||t("noContact")}</span></div><ChevronRight size={17} className="muted-icon"/></article>)}{!students.length&&<div className="empty">{t("noStudents")}</div>}</section>}
    {tab==="attendance"&&<GroupAttendance groupId={group.id} students={students} date={date} setDate={setDate} lang={lang} seasonId={seasonId}/>}
    {tab==="payments"&&<Payments role={role} lang={lang} seasonId={seasonId} fixedGroupId={group.id}/>}
  </Modal>
}

function GroupAttendance({groupId,students,date,setDate,lang,seasonId}:{groupId:string;students:Student[];date:string;setDate:(v:string)=>void;lang:Lang;seasonId:string}){const t=(k:TKey)=>tx(lang,k);const [values,setValues]=useState<Record<string,AttendanceStatus>>({});const [error,setError]=useState("");useEffect(()=>{loadEffectiveAttendance(groupId,date).then(setValues).catch(e=>setError(e.message))},[groupId,date]);async function setStatus(id:string,status:AttendanceStatus){setError("");try{await recordAttendanceStatus(id,groupId,date,status,seasonId);setValues(v=>({...v,[id]:status}))}catch(e){setError((e as Error).message)}}return <div className="stack"><input type="date" value={date} onChange={e=>setDate(e.target.value)}/>{error&&<div className="alert">{error}</div>}<section className="list">{students.map(s=><article className="attendance" key={s.id}><b>{s.first_name} {s.last_name}</b><div className="attendance-actions">{(["present","absent","sick"] as AttendanceStatus[]).map(st=><button key={st} className={values[s.id]===st?`att ${st} selected`:"att"} onClick={()=>setStatus(s.id,st)}>{t(st as TKey)}</button>)}</div></article>)}</section></div>}


function Attendance({lang,seasonId,role}:{lang:Lang;seasonId:string;role:Role}){
  const t=(k:TKey)=>tx(lang,k);
  const [groups,setGroups]=useState<Group[]>([]);
  const [groupId,setGroupId]=useState("");
  const [date,setDate]=useState(todayISO());
  const [month,setMonth]=useState(currentMonth());
  const [students,setStudents]=useState<Student[]>([]);
  const [values,setValues]=useState<Record<string,AttendanceStatus>>({});
  const [monthly,setMonthly]=useState<Record<string,Record<string,AttendanceStatus>>>({});
  const [trainingDays,setTrainingDays]=useState<string[]>([]);
  const [dropLessons,setDropLessons]=useState<DropLesson[]>([]);
  const [dropBookings,setDropBookings]=useState<DropBooking[]>([]);
  const [manualOpen,setManualOpen]=useState(false);
  const [manualGroupId,setManualGroupId]=useState("");
  const [manualDate,setManualDate]=useState(date);
  const [manualStudentId,setManualStudentId]=useState("");
  const [manualFirstName,setManualFirstName]=useState("");
  const [manualLastName,setManualLastName]=useState("");
  const [manualParentEmail,setManualParentEmail]=useState("");
  const [manualParentPhone,setManualParentPhone]=useState("");
  const [manualStartTime,setManualStartTime]=useState("");
  const [manualEndTime,setManualEndTime]=useState("");
  const [manualScheduleKnown,setManualScheduleKnown]=useState(false);
  const [manualStudents,setManualStudents]=useState<Student[]>([]);
  const [manualBusy,setManualBusy]=useState(false);
  const [teacherGroupIds,setTeacherGroupIds]=useState<string[]|null>(null);
  const [error,setError]=useState("");

  async function loadGroups(){
    let allowedGroupIds:string[]|null=null;
    if(role!=="admin"){
      const {data:userData}=await supabase.auth.getUser();
      const uid=userData.user?.id;
      if(!uid){setGroups([]);setGroupId("");return}
      const {data:teacher}=await supabase.from("teachers").select("id").eq("profile_id",uid).eq("is_active",true).maybeSingle();
      if(!teacher){setGroups([]);setGroupId("");return}
      const [{data:assigned},{data:subs}]=await Promise.all([
        supabase.from("group_teachers").select("group_id").eq("teacher_id",teacher.id),
        supabase.from("teacher_substitutions").select("group_id").eq("teacher_id",teacher.id).lte("starts_on",date).gte("ends_on",date)
      ]);
      allowedGroupIds=Array.from(new Set([
        ...(assigned??[]).map((x:any)=>x.group_id),
        ...(subs??[]).map((x:any)=>x.group_id)
      ]));
      setTeacherGroupIds(allowedGroupIds);
      if(!allowedGroupIds.length){setGroups([]);setGroupId("");return}
    }else setTeacherGroupIds(null);

    let q:any=supabase.from("groups").select("*").eq("is_active",true).order("name");
    if(seasonId){
      const {data:configs}=await supabase.from("season_groups").select("group_id").eq("season_id",seasonId).eq("is_active",true);
      let ids=(configs??[]).map(x=>x.group_id);
      if(allowedGroupIds)ids=ids.filter((id:string)=>allowedGroupIds!.includes(id));
      if(!ids.length){setGroups([]);setGroupId("");return}
      q=q.in("id",ids);
    }else if(allowedGroupIds){
      q=q.in("id",allowedGroupIds);
    }
    const {data,error:qError}=await q;
    if(qError){setError(qError.message);return}
    const rows=(data??[]) as Group[];
    setGroups(rows);
    if(!rows.some(g=>g.id===groupId))setGroupId(rows[0]?.id||"");
  }

  async function loadStudents(){
    if(!groupId){setStudents([]);setValues({});setMonthly({});setTrainingDays([]);return}
    let ids:string[]=[];
    if(seasonId){
      const {data:config}=await supabase.from("season_groups").select("id").eq("season_id",seasonId).eq("group_id",groupId).maybeSingle();
      if(config){
        const {data:m}=await supabase.from("season_enrollments").select("student_id").eq("season_id",seasonId).eq("season_group_id",config.id).eq("is_active",true);
        ids=(m??[]).map(x=>x.student_id);
      }
    }else{
      const {data:m}=await supabase.from("group_students").select("student_id").eq("group_id",groupId).eq("is_active",true);
      ids=(m??[]).map((x:any)=>x.student_id);
    }
    if(ids.length){
      const {data:s,error:sError}=await supabase.from("students").select("*").in("id",ids).eq("is_active",true).order("last_name");
      if(sError){setError(sError.message);return}
      setStudents((s??[]) as Student[]);
    }else setStudents([]);
  }

  function monthDates(){
    const parts=month.split("-").map(Number);
    const y=parts[0],m=parts[1];
    const last=new Date(y,m,0).getDate();
    return Array.from({length:last},(_,i)=>month+"-"+String(i+1).padStart(2,"0"));
  }

  async function loadMonthly(){
    if(!groupId)return;
    const dates=monthDates();
    const {data:rows,error:rowsError}=await supabase.from("attendance")
      .select("id,student_id,attendance_date,status")
      .eq("group_id",groupId).gte("attendance_date",dates[0]).lte("attendance_date",dates[dates.length-1]);
    if(rowsError){setError(rowsError.message);return}
    const attendanceRows=rows??[];
    const map:Record<string,Record<string,AttendanceStatus>>={};
    attendanceRows.forEach((r:any)=>{map[r.student_id]??={};map[r.student_id][r.attendance_date]=r.status as AttendanceStatus});
    const ids=attendanceRows.map((r:any)=>r.id);
    if(ids.length){
      const {data:revisions,error:revError}=await supabase.from("attendance_revisions")
        .select("attendance_id,status,created_at,id").in("attendance_id",ids)
        .order("created_at",{ascending:false}).order("id",{ascending:false});
      if(revError){setError(revError.message);return}
      const rowById=new Map(attendanceRows.map((r:any)=>[r.id,r]));
      const seen=new Set<string>();
      for(const rev of revisions??[]){
        if(seen.has(rev.attendance_id))continue;
        const row=rowById.get(rev.attendance_id);
        if(row){map[row.student_id]??={};map[row.student_id][row.attendance_date]=rev.status as AttendanceStatus}
        seen.add(rev.attendance_id);
      }
    }
    setMonthly(map);
    setTrainingDays(Array.from(new Set(attendanceRows.map((r:any)=>r.attendance_date))).sort());
  }

  async function loadSelectedDate(){
    if(!groupId){setValues({});return}
    try{setValues(await loadEffectiveAttendance(groupId,date))}
    catch(e){setError((e as Error).message)}
  }

  async function loadDropins(){
    let lessonQuery:any=supabase.from("drop_in_lessons").select("*,groups(name)").eq("lesson_date",date).eq("is_active",true).order("start_time");
    if(role!=="admin"){
      if(!teacherGroupIds){setDropLessons([]);setDropBookings([]);return}
      const {data:userData}=await supabase.auth.getUser();
      const uid=userData.user?.id;
      if(!uid){setDropLessons([]);setDropBookings([]);return}
      const {data:teacher}=await supabase.from("teachers").select("id").eq("profile_id",uid).eq("is_active",true).maybeSingle();
      if(!teacher){setDropLessons([]);setDropBookings([]);return}
      const {data:subs}=await supabase.from("teacher_substitutions").select("group_id").eq("teacher_id",teacher.id).lte("starts_on",date).gte("ends_on",date);
      const visibleGroups=Array.from(new Set([...teacherGroupIds,...(subs??[]).map((x:any)=>x.group_id)]));
      if(!visibleGroups.length){setDropLessons([]);setDropBookings([]);return}
      lessonQuery=lessonQuery.in("group_id",visibleGroups);
    }
    const {data:lessons}=await lessonQuery;
    const ls=(lessons??[]) as DropLesson[];
    setDropLessons(ls);
    if(!ls.length){setDropBookings([]);return}
    const {data:bookings}=await supabase.from("drop_in_bookings").select("*").in("lesson_id",ls.map(x=>x.id));
    const rawBookings=(bookings??[]) as DropBooking[];
    const studentIds=Array.from(new Set(rawBookings.map(b=>b.student_id).filter(Boolean))) as string[];
    let parentMap:Record<string,{parent_email:string|null;parent_phone:string|null}>={};
    if(studentIds.length){
      const {data:parents}=await supabase.from("students").select("id,parent_email,parent_phone").in("id",studentIds);
      (parents??[]).forEach((x:any)=>{parentMap[x.id]={parent_email:x.parent_email??null,parent_phone:x.parent_phone??null}});
    }
    // One customer can only appear once in a specific one-off lesson.
    // Prefer the paid record and preserve an already marked attendance status.
    const unique=new Map<string,DropBooking>();
    for(const booking of rawBookings){
      const enriched={...booking,...(booking.student_id?parentMap[booking.student_id]:{})};
      const key=booking.lesson_id+"::"+(booking.student_id||((booking.email||"")+"::"+booking.first_name+"::"+booking.last_name));
      const current=unique.get(key);
      if(!current || (booking.status==="paid" && current.status!=="paid") || (!current.attendance_status && booking.attendance_status)){
        unique.set(key,enriched);
      }
    }
    setDropBookings(Array.from(unique.values()));
  }

  useEffect(()=>{loadGroups()},[seasonId,role]);
  useEffect(()=>{loadStudents()},[groupId,seasonId]);
  useEffect(()=>{loadSelectedDate();loadMonthly()},[groupId,date,month,seasonId]);
  useEffect(()=>{loadDropins()},[date,role,teacherGroupIds]);
  useEffect(()=>{
    if(!groupId)return;
    const channel=supabase.channel("attendance-live-"+groupId+"-"+date)
      .on("postgres_changes",{event:"*",schema:"public",table:"attendance",filter:"group_id=eq."+groupId},()=>{
        loadSelectedDate();
        loadMonthly();
      })
      .on("postgres_changes",{event:"*",schema:"public",table:"drop_in_bookings"},()=>{
        loadDropins();
      })
      .subscribe();
    return()=>{supabase.removeChannel(channel);};
  },[groupId,date,month]);

  async function setStatus(id:string,status:AttendanceStatus){
    setError("");
    try{
      await recordAttendanceStatus(id,groupId,date,status,seasonId);
      setValues(v=>({...v,[id]:status}));
      setMonthly(v=>({...v,[id]:{...(v[id]??{}),[date]:status}}));
      setTrainingDays(v=>v.includes(date)?v:[...v,date].sort());
    }catch(e){setError((e as Error).message)}
  }

  async function clearStatus(id:string){
    setError("");
    try{
      const {data:existing,error:findError}=await supabase.from("attendance").select("id")
        .eq("student_id",id).eq("group_id",groupId).eq("attendance_date",date).maybeSingle();
      if(findError)throw findError;
      const {error}=await supabase.rpc("clear_group_attendance",{p_attendance_id:existing?.id??null});
      if(error)throw error;
      setValues(v=>{const next={...v};delete next[id];return next});
      setMonthly(v=>{const next={...v};next[id]={...(next[id]??{})};delete next[id][date];return next});
    }catch(e){setError((e as Error).message)}
  }

  async function setDrop(id:string,status:AttendanceStatus|null){
    const {error}=await supabase.rpc("teacher_set_drop_in_attendance",{p_booking_id:id,p_status:status});
    if(error)setError(error.message);else setDropBookings(x=>x.map(b=>b.id===id?{...b,attendance_status:status}:b));
  }

  async function loadManualStudents(){
    const {data,error:qError}=await supabase.from("students")
      .select("*").eq("is_active",true).order("last_name").order("first_name");
    if(qError){setError(qError.message);return}
    setManualStudents((data??[]) as Student[]);
  }

  function openQuickParticipant(){
    const initialGroupId=groupId || groups[0]?.id || "";
    setManualOpen(true);
    setManualGroupId(initialGroupId);
    setManualDate(date);
    setManualStudentId("");
    setManualFirstName("");
    setManualLastName("");
    setManualParentEmail("");
    setManualParentPhone("");
    setManualStartTime("");
    setManualEndTime("");
    setManualScheduleKnown(false);
    setError("");
    loadManualStudents();
    loadManualLessonPreset(initialGroupId,date);
  }

  function closeQuickParticipant(){
    if(manualBusy)return;
    setManualOpen(false);
  }

  async function loadManualLessonPreset(gid:string,d:string){
    if(!gid||!d)return;
    setManualScheduleKnown(false);
    const {data:existing}=await supabase.from("drop_in_lessons")
      .select("start_time,end_time").eq("group_id",gid).eq("lesson_date",d).eq("is_active",true)
      .order("created_at",{ascending:false}).limit(1).maybeSingle();
    if(existing?.start_time){
      setManualStartTime(String(existing.start_time).slice(0,5));
      setManualEndTime(existing.end_time?String(existing.end_time).slice(0,5):"");
      setManualScheduleKnown(true);
      return;
    }
    const {data:latest}=await supabase.from("drop_in_lessons")
      .select("start_time,end_time").eq("group_id",gid).eq("is_active",true)
      .order("lesson_date",{ascending:false}).order("created_at",{ascending:false}).limit(1).maybeSingle();
    if(latest?.start_time){
      setManualStartTime(String(latest.start_time).slice(0,5));
      setManualEndTime(latest.end_time?String(latest.end_time).slice(0,5):"");
      setManualScheduleKnown(true);
      return;
    }
    const group=groups.find(g=>g.id===gid);
    const timeMatch=group?.name.match(/(\d{1,2}:\d{2})/);
    if(timeMatch){
      setManualStartTime(timeMatch[1]);
      setManualEndTime("");
      setManualScheduleKnown(true);
      return;
    }
    setManualStartTime("");
    setManualEndTime("");
  }

  function selectManualStudent(id:string){
    setManualStudentId(id);
    const s=manualStudents.find(x=>x.id===id);
    if(!s)return;
    setManualFirstName(s.first_name);
    setManualLastName(s.last_name);
    setManualParentEmail(s.parent_email??s.email??"");
    setManualParentPhone(s.parent_phone??s.phone??"");
  }

  async function saveQuickParticipant(){
    if(!manualGroupId){setError("Pasirinkite grupę.");return}
    if(!manualDate){setError("Pasirinkite datą.");return}
    if(!manualStartTime){setError("Šiai grupei šios datos laikas nerastas. Pasirinkite pradžios laiką.");return}
    if(!manualStudentId&&(!manualFirstName.trim()||!manualLastName.trim())){
      setError("Įrašykite vaiko vardą ir pavardę.");
      return;
    }
    if(!manualStudentId&&!manualParentEmail.trim()&&!manualParentPhone.trim()){
      setError("Įrašykite bent vieną tėvų kontaktą: el. paštą arba telefoną.");
      return;
    }
    setManualBusy(true);
    setError("");
    const {error:rpcError}=await supabase.rpc("add_quick_dropin_participant",{
      p_group_id:manualGroupId,
      p_lesson_date:manualDate,
      p_start_time:manualStartTime,
      p_end_time:manualEndTime||null,
      p_student_id:manualStudentId||null,
      p_first_name:manualStudentId?null:manualFirstName,
      p_last_name:manualStudentId?null:manualLastName,
      p_parent_email:manualStudentId?null:(manualParentEmail||null),
      p_parent_phone:manualStudentId?null:(manualParentPhone||null)
    });
    setManualBusy(false);
    if(rpcError){setError(rpcError.message);return}
    setDate(manualDate);
    setManualOpen(false);
    await loadDropins();
  }

  const dayLabel=(d:string)=>new Date(d+"T12:00:00").toLocaleDateString(lang==="lt"?"lt-LT":lang==="es"?"es-ES":"en-US",{weekday:"short",day:"numeric"});
  const monthLabel=new Date(month+"-01T12:00:00").toLocaleDateString(lang==="lt"?"lt-LT":lang==="es"?"es-ES":"en-US",{month:"long",year:"numeric"});
  const stats=students.reduce((acc,s)=>{
    const st=values[s.id]; if(st)acc[st]++; else acc.unmarked++;
    return acc;
  },{present:0,absent:0,sick:0,unmarked:0});
  const monthlyRows=students.map(s=>{
    const vals=monthly[s.id]??{};
    const counts={present:0,absent:0,sick:0};
    Object.values(vals).forEach(st=>{if(st)counts[st]++});
    const marked=counts.present+counts.absent+counts.sick;
    const attendanceRate=marked?Math.round((counts.present/marked)*100):0;
    return {s,vals,counts,marked,attendanceRate};
  });
  const monthlyTotals=monthlyRows.reduce((acc,row)=>{
    acc.present+=row.counts.present; acc.absent+=row.counts.absent; acc.sick+=row.counts.sick;
    return acc;
  },{present:0,absent:0,sick:0});
  const monthlyMarked=monthlyTotals.present+monthlyTotals.absent+monthlyTotals.sick;
  const monthlyRate=monthlyMarked?Math.round((monthlyTotals.present/monthlyMarked)*100):0;

  return <div className="stack">
    <section className="dropin-panel quick-dropin-panel">
      <div className="quick-dropin-head">
        <div><div className="eyebrow">VIENKARTINĖS REZERVACIJOS</div><h2>{role==="admin"?"Vienkartinės / bandomosios pamokos":"Jūsų grupių {lang==="lt"?"vienkartinės rezervacijos":lang==="es"?"reservas":"bookings"}"}</h2><p className="muted">{role==="admin"?"Čia matysite pridėtus vienkartinių pamokų dalyvius. Naują mokinį pridėsite lankomumo apačioje.":"Čia matysite naujus mokinius, kuriuos reikia priimti į Jūsų grupę."}</p></div>

      </div>
      <div className="quick-dropin-filters"><label><span>Diena</span><input type="date" value={date} onChange={e=>setDate(e.target.value)}/></label><div className="quick-dropin-hint">{role==="admin"?"Mokytojui priskirtas vaikas bus matomas jo profilyje.":"Čia rodomos tik Jums priskirtų grupių {lang==="lt"?"vienkartinės rezervacijos":lang==="es"?"reservas":"bookings"}."}</div></div>
      {dropLessons.length?<div className="dropin-date-table-wrap"><table className="dropin-date-table"><thead><tr><th>Grupė</th><th>Laikas</th><th>Dalyviai</th></tr></thead><tbody>
        {dropLessons.map(l=>{const bs=dropBookings.filter(b=>b.lesson_id===l.id);return <tr key={l.id}><td><b>{l.groups?.name||"Grupė"}</b><span className="quick-date-cell">{new Date(l.lesson_date+"T12:00:00").toLocaleDateString("lt-LT",{weekday:"short",day:"2-digit",month:"2-digit"})}</span></td><td>{l.start_time.slice(0,5)}{l.end_time?"–"+l.end_time.slice(0,5):""}</td><td><div className="dropin-table-people">{bs.length?bs.map(b=><div className="dropin-table-person" key={b.id}><div><b>{b.first_name} {b.last_name}</b><span>👤 {b.parent_email||b.email||"—"}</span><span>☎ {b.parent_phone||b.phone||"—"}</span></div>{role==="admin"&&<div className="mini-att">{(["present","absent","sick"] as AttendanceStatus[]).map(st=><button key={st} className={b.attendance_status===st?"mini "+st+" selected":"mini"} onClick={()=>setDrop(b.id,st)}>{t(st as TKey)}</button>)}<button className={!b.attendance_status?"mini selected":"mini"} onClick={()=>setDrop(b.id,null)}>— {t("unmarked")}</button></div>}</div>):<span className="muted small">Kol kas dalyvių nėra.</span>}</div></td></tr>})}
      </tbody></table></div>:<div className="quick-empty">Šiai datai dar nėra pridėtų vienkartinių pamokų. Paspauskite „Pridėti mokinį“ ir viskas bus sukurta automatiškai.</div>}
    </section>
    <section className="panel attendance-live-panel">
      <div className="panel-head"><div><div className="eyebrow">LANKOMUMAS</div><h2>Gyvas lankomumo vaizdas</h2><p className="muted">Pažymėjus mokinį, bendras rezultatas atsinaujina iš karto.</p></div></div>
      <div className="filters"><select value={groupId} onChange={e=>setGroupId(e.target.value)}><option value="">{t("chooseGroup")}</option>{groups.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}</select><input type="date" value={date} onChange={e=>setDate(e.target.value)}/><label className="attendance-period-filter"><span>{t("monthly")}</span><input type="month" value={month} onChange={e=>setMonth(e.target.value)}/></label></div>
      {groupId&&<div className="attendance-live-stats"><div><b>{stats.present}</b><span>Dalyvavo</span></div><div><b>{stats.absent}</b><span>Nedalyvavo</span></div><div><b>{stats.sick}</b><span>Serga</span></div><div><b>{stats.unmarked}</b><span>Nepasirinkta</span></div></div>}
    </section>
    {error&&<div className="alert">{error}</div>}
      <div className="attendance-charts">
        <div className="attendance-chart-card">
          <div className="eyebrow">DALYVAVIMO DIAGRAMA</div>
          <h3>Mėnesio rezultatas</h3>
          <div className="attendance-bar-chart">
            <div className="attendance-bar-row"><span>Dalyvavo</span><div className="attendance-bar-track"><i className="present" style={{width:monthlyMarked?Math.round(monthlyTotals.present/monthlyMarked*100)+"%":"0%"}}/></div><b>{monthlyTotals.present}</b></div>
            <div className="attendance-bar-row"><span>Nedalyvavo</span><div className="attendance-bar-track"><i className="absent" style={{width:monthlyMarked?Math.round(monthlyTotals.absent/monthlyMarked*100)+"%":"0%"}}/></div><b>{monthlyTotals.absent}</b></div>
            <div className="attendance-bar-row"><span>Serga</span><div className="attendance-bar-track"><i className="sick" style={{width:monthlyMarked?Math.round(monthlyTotals.sick/monthlyMarked*100)+"%":"0%"}}/></div><b>{monthlyTotals.sick}</b></div>
          </div>
        </div>
        <div className="attendance-chart-card">
          <div className="eyebrow">MOKINIŲ LANKOMUMAS</div>
          <h3>Kiekvieno mokinio rezultatas</h3>
          <div className="attendance-student-bars">
            {monthlyRows.map(({s:student,attendanceRate,marked})=><div className="attendance-student-bar" key={student.id}><div><span>{student.first_name} {student.last_name}</span><b>{marked?attendanceRate+"%":"—"}</b></div><div className="attendance-bar-track"><i style={{width:marked?attendanceRate+"%":"0%"}}/></div></div>)}
          </div>
        </div>
      </div>
    <section className="list">
      {students.map(s=><article className="attendance" key={s.id}><b>{s.first_name} {s.last_name}</b><div className="attendance-actions">{(["present","absent","sick"] as AttendanceStatus[]).map(st=><button className={values[s.id]===st?"att "+st+" selected":"att"} key={st} onClick={()=>setStatus(s.id,st)}>{t(st as TKey)}</button>)}<button className={!values[s.id]?"att selected unmarked":"att unmarked"} onClick={()=>clearStatus(s.id)}>— {t("unmarked")}</button></div></article>)}
      {groupId&&!students.length&&<div className="empty">{t("noStudents")}</div>}
    </section>

    {manualOpen&&<Modal title="Pridėti vienkartinį / bandomąjį mokinį" close={closeQuickParticipant}>
      <div className="quick-form">
        <div className="quick-step"><span>1</span><div><b>Grupė</b><select value={manualGroupId} onChange={e=>{setManualGroupId(e.target.value);loadManualLessonPreset(e.target.value,manualDate)}}><option value="">— Pasirinkite grupę —</option>{groups.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}</select></div></div>
        <div className="quick-step"><span>2</span><div><b>Diena</b><input type="date" value={manualDate} onChange={e=>{setManualDate(e.target.value);loadManualLessonPreset(manualGroupId,e.target.value)}}/></div></div>
        <div className="quick-step"><span>3</span><div><b>Klientas</b><select value={manualStudentId} onChange={e=>selectManualStudent(e.target.value)}><option value="">＋ Naujas klientas</option>{manualStudents.map(s=><option key={s.id} value={s.id}>{s.first_name} {s.last_name}{s.parent_phone?" · "+s.parent_phone:""}</option>)}</select></div></div>
        {manualStudentId?<div className="selected-client"><b>{manualFirstName} {manualLastName}</b><span>{manualParentEmail||"—"} · {manualParentPhone||"—"}</span></div>:<div className="form-grid"><Field label="Vaiko vardas" value={manualFirstName} set={setManualFirstName}/><Field label="Vaiko pavardė" value={manualLastName} set={setManualLastName}/><Field label="Tėvų el. paštas" value={manualParentEmail} set={setManualParentEmail} type="email"/><Field label="Tėvų telefonas" value={manualParentPhone} set={setManualParentPhone}/></div>}
        <div className="quick-time-row"><div><label>Laikas nuo</label><input type="time" value={manualStartTime} onChange={e=>setManualStartTime(e.target.value)}/></div><div><label>Iki</label><input type="time" value={manualEndTime} onChange={e=>setManualEndTime(e.target.value)}/></div>{manualScheduleKnown&&<span className="schedule-found">✓ Laikas parinktas automatiškai</span>}</div>
      </div>
      <div className="actions"><button className="secondary" onClick={closeQuickParticipant}>Atšaukti</button><button className="primary small-btn" onClick={saveQuickParticipant} disabled={manualBusy}>{manualBusy?"Išsaugoma…":"Pridėti ir parodyti mokytojui"}</button></div>
    </Modal>}
    {role==="admin"&&<section className="dropin-admin-add-bottom">
      <div><div className="eyebrow">ADMINISTRATORIUS</div><h3>Vienkartinė / bandomoji pamoka</h3><p className="muted">Pridėkite naują mokinį prie grupės. Po išsaugojimo jis automatiškai bus rodomas mokytojui viršuje.</p></div>
      <button className="primary quick-add-btn" onClick={openQuickParticipant}>＋ Pridėti mokinį</button>
    </section>}
    {groupId&&<section className="panel attendance-month-panel">
      <div className="panel-head"><div><div className="eyebrow">MĖNESIO LANKOMUMAS</div><h2>{monthLabel}</h2><p className="muted">Bendra pasirinktos grupės ir kiekvieno mokinio mėnesio suvestinė.</p></div></div>
      <div className="attendance-month-kpis"><div><b>{monthlyRate}%</b><span>Grupės lankomumas</span></div><div><b>{monthlyTotals.present}</b><span>Dalyvavo</span></div><div><b>{monthlyTotals.absent}</b><span>Nedalyvavo</span></div><div><b>{monthlyTotals.sick}</b><span>Serga</span></div></div>
      <div className="attendance-month-days">{trainingDays.length?trainingDays.map(d=><button key={d} className={d===date?"active":""} onClick={()=>setDate(d)}>{dayLabel(d)}</button>):<span className="muted small">Šį mėnesį dar nėra išsaugotų lankomumo įrašų.</span>}</div>
      <div className="attendance-table-wrap"><table className="attendance-table"><thead><tr><th>Mokinys</th>{trainingDays.map(d=><th key={d}>{new Date(d+"T12:00:00").toLocaleDateString("lt-LT",{day:"2-digit"})}</th>)}<th>Dalyvavo</th><th>Nedalyvavo</th><th>Serga</th><th>%</th></tr></thead><tbody>
        {monthlyRows.map(({s,vals,counts,attendanceRate})=><tr key={s.id}><td className="attendance-student-name">{s.first_name} {s.last_name}</td>{trainingDays.map(d=>{const st=vals[d];return <td key={d}><span className={st?"attendance-dot "+st:"attendance-dot unmarked"} title={st?t(st as TKey):t("unmarked")}>{st==="present"?"D":st==="absent"?"N":st==="sick"?"S":"—"}</span></td>})}<td className="count-present">{counts.present}</td><td className="count-absent">{counts.absent}</td><td className="count-sick">{counts.sick}</td><td><b>{attendanceRate}%</b></td></tr>)}
      </tbody></table></div>
      <div className="attendance-legend"><span><i className="attendance-dot present">D</i> Dalyvavo</span><span><i className="attendance-dot absent">N</i> Nedalyvavo</span><span><i className="attendance-dot sick">S</i> Serga</span><span><i className="attendance-dot unmarked">—</i> Nepasirinkta</span></div>
    </section>}
    <p className="muted small">{t("attendanceStatuses")}</p>
  </div>
}
function Payments({role,lang,seasonId,fixedGroupId}:{role:Role;lang:Lang;seasonId:string;fixedGroupId?:string}){
  const t=(k:TKey)=>tx(lang,k);
  const [charges,setCharges]=useState<Charge[]>([]),[payments,setPayments]=useState<Payment[]>([]),[groups,setGroups]=useState<Group[]>([]);
  const [paymentMethodPreset,setPaymentMethodPreset]=useState<PaymentMethod|null>(null),[paymentFilter,setPaymentFilter]=useState<"all"|"paid"|"unpaid">("all");
  const [selectedGroupId,setSelectedGroupId]=useState(fixedGroupId||"all"),[paymentView,setPaymentView]=useState<"groups"|"all">(fixedGroupId?"all":"groups"),[error,setError]=useState(""),[paymentCharge,setPaymentCharge]=useState<Charge|null>(null),[editing,setEditing]=useState<Payment|null>(null),[showHistory,setShowHistory]=useState<Record<string,boolean>>({}),[selectedMonth,setSelectedMonth]=useState(currentMonth()),[invoiceBusy,setInvoiceBusy]=useState<string|null>(null),[addingMonth,setAddingMonth]=useState(false);

  async function loadGroups(){
    let list:Group[]=[];
    if(role==="admin"){
      const {data}=await supabase.from("groups").select("*").eq("is_active",true).order("name");
      list=(data??[]) as Group[];
    }else{
      const {data:{user}}=await supabase.auth.getUser();
      if(user?.id){
        const {data:teacher}=await supabase.from("teachers").select("id").eq("profile_id",user.id).maybeSingle();
        if(teacher){
          const {data}=await supabase.from("group_teachers").select("group_id").eq("teacher_id",teacher.id);
          const ids=(data??[]).map((x:any)=>x.group_id);
          if(ids.length){
            const {data:g}=await supabase.from("groups").select("*").in("id",ids).eq("is_active",true).order("name");
            list=(g??[]) as Group[];
          }
        }
      }
    }
    setGroups(list);
  }

  async function load(){
    setError("");
    // IMPORTANT: a month is a historical snapshot. Read the charges that
    // actually exist for that month; never filter them by today's active roster.
    // A student can leave the studio later and must still remain visible in
    // the month in which the charge was created.
    let chargeQuery:any=supabase.from("monthly_charges").select("*,students(first_name,last_name,email,phone,parent_email,parent_phone,payment_preference),groups(name)").eq("month",selectedMonth+"-01").eq("source_active",true);
    if(seasonId)chargeQuery=chargeQuery.eq("season_id",seasonId);
    const groupFilter=fixedGroupId||((selectedGroupId&&selectedGroupId!=="all")?selectedGroupId:"");
    if(groupFilter)chargeQuery=chargeQuery.eq("group_id",groupFilter);
    const c=await chargeQuery.order("due_date",{ascending:false});
    const chargeRows=c.data??[];
    const p=chargeRows.length?await supabase.from("payments").select("*").in("monthly_charge_id",chargeRows.map((row:any)=>row.id)).order("paid_at",{ascending:false}):{data:[],error:null};
    if(c.error||p.error)setError((c.error||p.error)!.message);else setError("");
    setCharges(chargeRows as Charge[]);setPayments((p.data??[]) as Payment[]);
  }

  useEffect(()=>{loadGroups()},[role,seasonId]);
  useEffect(()=>{if(fixedGroupId)setSelectedGroupId(fixedGroupId)},[fixedGroupId]);
  useEffect(()=>{load()},[selectedMonth,seasonId,selectedGroupId,fixedGroupId]);

  async function addMonth(){
    if(!selectedMonth)return;
    setAddingMonth(true);
    setError("");
    if(role==="admin"){
      const {error:ensureError}=await supabase.rpc("ensure_monthly_charges",{p_month:selectedMonth+"-01"});
      if(ensureError){setError(ensureError.message);setAddingMonth(false);return;}
    }
    await load();
    setAddingMonth(false);
  }

  async function createInvoice(charge:Charge){
    if(charge.students?.payment_preference==="cash"){
      setError(lang==="lt"?"Šiam klientui pasirinktas atsiskaitymas grynais – Sąskaita123 sąskaita neformuojama.":"This client is set to pay cash, so no Invoice123 invoice will be created.");
      return;
    }
    setInvoiceBusy(charge.id);setError("");
    const {data,error:fnError}=await supabase.functions.invoke("create-saskaita123-invoice",{body:{monthly_charge_id:charge.id}});
    setInvoiceBusy(null);
    if(fnError){
      let detail=fnError.message;
      try{
        const response=(fnError as any).context as Response|undefined;
        if(response){
          const body=await response.clone().json().catch(()=>null);
          if(body?.error)detail=String(body.error);else if(body?.message)detail=String(body.message);
        }
      }catch{}
      setError(detail);return;
    }
    if(data?.error){setError(String(data.error));return}
    await load();
  }

  async function syncInvoice123(chargeId:string){
    const {data,error:fnError}=await supabase.functions.invoke("create-saskaita123-invoice",{body:{monthly_charge_id:chargeId}});
    if(fnError){
      let detail=fnError.message;
      try{
        const response=(fnError as any).context as Response|undefined;
        if(response){
          const body=await response.clone().json().catch(()=>null);
          if(body?.error)detail=String(body.error);else if(body?.message)detail=String(body.message);
        }
      }catch{}
      throw new Error(detail);
    }
    if(data?.error)throw new Error(String(data.error));
    return data;
  }

  async function savePayment(amount:number,method:PaymentMethod){
    if(!paymentCharge)return;
    const left=Number(paymentCharge.amount_due)-Number(paymentCharge.amount_paid);
    if(amount<=0||amount>left){setError(t("remaining")+": "+money(left));return}
    const {error}=await supabase.rpc("record_payment",{p_monthly_charge_id:paymentCharge.id,p_amount:amount,p_payment_method:method});
    if(error){setError(error.message);return}
    const chargeId=paymentCharge.id;
    setPaymentCharge(null);
    if(method!=="cash"){
      try{await syncInvoice123(chargeId)}
      catch(e){setError("Mokėjimas LDS išsaugotas, bet Sąskaita123 sinchronizavimas nepavyko: "+(e as Error).message)}
    }
    await load();
  }
  async function updatePayment(amount:number,method:PaymentMethod){
    if(!editing)return;
    const rpc=role==="teacher"?"teacher_update_payment":"admin_update_payment";
    const {error}=await supabase.rpc(rpc,{p_payment_id:editing.id,p_amount:amount,p_payment_method:method,p_paid_at:editing.paid_at,p_notes:editing.notes});
    if(error){setError(error.message);return}
    const chargeId=editing.monthly_charge_id;
    setEditing(null);
    try{await syncInvoice123(chargeId)}catch(e){
      if(method!=="cash")setError("Mokėjimas LDS atnaujintas, bet Sąskaita123 sinchronizavimas nepavyko: "+(e as Error).message);
    }
    await load();
  }

  async function removePayment(p:Payment){
    if(!confirm(t("confirmDelete")))return;
    const rpc=role==="teacher"?"teacher_delete_payment":"admin_delete_payment";
    const {error}=await supabase.rpc(rpc,{p_payment_id:p.id});
    if(error){setError(error.message);return}
    try{await syncInvoice123(p.monthly_charge_id)}catch{}
    await load();
  }
  const totalDue=charges.reduce((sum,c)=>sum+Number(c.amount_due),0);
  const totalPaid=charges.reduce((sum,c)=>sum+Number(c.amount_paid),0);
  const totalRemaining=Math.max(0,totalDue-totalPaid);
  const cashTotal=payments.filter(p=>p.payment_method==="cash").reduce((s,p)=>s+Number(p.amount),0);
  const bankTotal=payments.filter(p=>p.payment_method==="bank_transfer").reduce((s,p)=>s+Number(p.amount),0);
  const cardTotal=payments.filter(p=>p.payment_method==="stripe").reduce((s,p)=>s+Number(p.amount),0);
  const paidCount=charges.filter(c=>Number(c.amount_paid)>=Number(c.amount_due)).length;
  const groupPaymentCards=groups.map(g=>{
    const rows=charges.filter(c=>c.group_id===g.id);
    if(!rows.length)return null;
    const due=rows.reduce((s,c)=>s+Number(c.amount_due),0);
    const paid=rows.reduce((s,c)=>s+Number(c.amount_paid),0);
    const paidClients=rows.filter(c=>Number(c.amount_paid)>=Number(c.amount_due)).length;
    return {group:g,rows,due,paid,remaining:Math.max(0,due-paid),paidClients};
  }).filter(Boolean) as {group:Group;rows:Charge[];due:number;paid:number;remaining:number;paidClients:number}[];
  function openPayment(c:Charge,method?:PaymentMethod){setPaymentMethodPreset(method??null);setPaymentCharge(c);}
  function openGroup(groupId:string){setSelectedGroupId(groupId);setPaymentFilter("all");setPaymentView("all");}

  return <div className="stack">
    {BILLING_TEST_MODE&&<div className="alert">🛡️ {t("billingTest")}</div>}
    {error&&<div className="alert">{error}</div>}
    {role==="admin"&&<div className="muted">Stripe / grynieji / bankiniai pavedimai / Sąskaita123 – nuomos mokėjimai valdomi skiltyje „Nuoma“.</div>}
    <div className="card payment-filters">
      {!fixedGroupId&&<div className="payment-view-switch">
        <button className={paymentView==="groups"?"active":""} onClick={()=>{setPaymentView("groups");setSelectedGroupId("all")}}><Users size={16}/> {lang==="lt"?"Grupės":lang==="es"?"Grupos":"Groups"}</button>
        <button className={paymentView==="all"?"active":""} onClick={()=>{setPaymentView("all");setSelectedGroupId("all")}}><CreditCard size={16}/> {lang==="lt"?"{lang==="lt"?"Visi mokėjimai":lang==="es"?"Todos los pagos":"All payments"}":lang==="es"?"Todos los pagos":"All payments"}</button>
      </div>}
      <label className="field"><span>{t("monthly")}</span><input type="month" value={selectedMonth} onChange={e=>setSelectedMonth(e.target.value)}/></label>
      {role==="admin"&&!fixedGroupId&&<button className="primary month-add-btn" onClick={addMonth} disabled={addingMonth}>{addingMonth?"{lang==="lt"?"Kuriama…":lang==="es"?"Creando…":"Creating…"}":"＋ {lang==="lt"?"Sukurti mėnesio mokėjimus":lang==="es"?"Crear pagos del mes":"Create monthly charges"}"}</button>}
    </div>
    {!fixedGroupId&&paymentView==="groups"&&<section className="payment-groups-grid">
      {groupPaymentCards.map(({group,rows,due,paid,remaining,paidClients})=><button className="payment-group-card" key={group.id} onClick={()=>openGroup(group.id)}>
        <div className="payment-group-card-top"><span className="payment-group-icon"><Users size={19}/></span><ChevronRight size={18}/></div>
        <div className="payment-group-name">{group.name}</div>
        <div className="payment-group-meta">{rows.length} klientai · {paidClients} apmokėti</div>
        <div className="payment-group-money"><span><small>{lang==="lt"?"Gauta":lang==="es"?"Recibido":"Received"}</small><b>{money(paid)}</b></span><span><small>{lang==="lt"?"Liko":lang==="es"?"Pendiente":"Remaining"}</small><b>{money(remaining)}</b></span></div>
        <div className="payment-group-progress"><span style={{width:(due?Math.min(100,(paid/due)*100):0)+"%"}}/></div>
      </button>)}
      {!groupPaymentCards.length&&<div className="empty">Šį mėnesį grupių mokėjimų nėra.</div>}
    </section>}
    {paymentView==="all"&&<div className="payment-current-group">{selectedGroupId!=="all"&&!fixedGroupId&&<button className="ghost-link" onClick={()=>{setSelectedGroupId("all");setPaymentView("groups")}}><ChevronRight size={14} style={{transform:"rotate(180deg)"}}/> {lang==="lt"?"Visos grupės":lang==="es"?"Todos los grupos":"All groups"}</button>}<b>{selectedGroupId!=="all" ? (groups.find(g=>g.id===selectedGroupId)?.name||"Grupės mokėjimai") : "{lang==="lt"?"Visi mokėjimai":lang==="es"?"Todos los pagos":"All payments"}"}</b></div>}
    {paymentView==="all"&&role==="admin"&&<section className="payment-summary">
      <div className="summary-card"><span>Klientai</span><b>{charges.length}</b></div>
      <div className="summary-card"><span>Apmokėta</span><b>{money(totalPaid)}</b></div>
      <div className="summary-card"><span>{lang==="lt"?"Liko":lang==="es"?"Pendiente":"Remaining"}</span><b>{money(totalRemaining)}</b></div>
      <div className="summary-card"><span>Statusas</span><b>{paidCount}/{charges.length}</b></div>
    </section>}
    {paymentView==="all"&&role==="admin"&&<section className="payment-summary">
      <div className="summary-card"><span>💵 {t("cashTotal")}</span><b>{money(cashTotal)}</b></div>
      <div className="summary-card"><span>🏦 {t("bankTotal")}</span><b>{money(bankTotal)}</b></div>
      <div className="summary-card"><span>💳 {t("cardTotal")}</span><b>{money(cardTotal)}</b></div>
      <div className="summary-card"><span>{t("totalReceived")}</span><b>{money(cashTotal+bankTotal+cardTotal)}</b></div>
    </section>}
    

    {paymentView==="all"&&<section className="panel monthly-payments-head"><div className="panel-head"><div><div className="eyebrow">KLIENTŲ MOKĖJIMAI</div><h2>Abonementai · pasirinktas mėnuo</h2><p className="muted">Rodomi tik <b>{new Date(selectedMonth+"-01T12:00:00").toLocaleDateString("lt-LT",{month:"long",year:"numeric"})}</b> mėnesio abonementų mokėjimai. Čia aiškiai matysite, kas jau susimokėjo ir kam dar liko.</p></div></div><div className="monthly-payment-filters"><button className={paymentFilter==="all"?"active":""} onClick={()=>setPaymentFilter("all")}>Visi <span>{charges.length}</span></button><button className={paymentFilter==="paid"?"active":""} onClick={()=>setPaymentFilter("paid")}>✓ Apmokėti <span>{paidCount}</span></button><button className={paymentFilter==="unpaid"?"active":""} onClick={()=>setPaymentFilter("unpaid")}>○ Neapmokėti <span>{charges.length-paidCount}</span></button></div></section>}{paymentView==="all"&&<PaymentHistory role={role} month={selectedMonth}/>}

    {paymentView==="all"&&    <section className="list">
      {charges.filter(c=>paymentFilter==="all"||(paymentFilter==="paid"&&Number(c.amount_paid)>=Number(c.amount_due))||(paymentFilter==="unpaid"&&Number(c.amount_paid)<Number(c.amount_due))).map(c=>{
        const left=Number(c.amount_due)-Number(c.amount_paid);
        const history=payments.filter(p=>p.monthly_charge_id===c.id);
        const invoiceId=c.saskaita123_invoice_id||c.invoice123_id;
        const invoiceNumber=c.saskaita123_invoice_number||c.invoice123_number;
        const invoiceUrl=c.saskaita123_invoice_url||c.invoice123_url;
        return <article className="card payment-card" key={c.id}>
          <div>
            <div className="payment-client-title"><b>{c.students?`${c.students.first_name} ${c.students.last_name}`:"Student"}</b><span className={`payment-status-badge ${left<=0?"paid":"unpaid"}`}>{left<=0?"✓ Apmokėta":"○ Neapmokėta"}</span></div>
            <span>{c.groups?.name||"Studio"} · Mokėjimo mėnuo: {new Date(c.month+"T12:00:00").toLocaleDateString("lt-LT",{month:"long",year:"numeric"})}</span><span>Mokėjimo terminas: {c.due_date}</span>
            <span>{t("price")}: {money(Number(c.amount_due))}</span>
            <span>{t("paid")}: {money(Number(c.amount_paid))}{history.length?` · ${history.map(p=>p.payment_method==="cash"?"Grynais":p.payment_method==="bank_transfer"?"Bankiniu":"Kortele").join(", ")}`:""}</span>
            <span>{t("remaining")}: {money(left)}</span>
            <span className="payment-contact">📧 {c.students?.email||c.students?.parent_email||"—"} · ☎ {c.students?.phone||c.students?.parent_phone||"—"}</span>
            {invoiceId?<><span className="payment-contact">🧾 Sąskaita123: {invoiceUrl?<a href={invoiceUrl} target="_blank" rel="noreferrer">{invoiceNumber||invoiceId}</a>:(invoiceNumber||invoiceId)}</span><span className="payment-contact">✓ {t("invoiceCreated")} · {c.invoice_sent_at?t("invoiceSent"):t("invoiceNotSent")}</span></>:null}
          </div>
          <div className="pay-right">
            <b>{money(Number(c.amount_due))}</b>
            <span className={`pill ${c.status}`}>{c.status.replace("_"," ")}</span>
            {left>0&&<div className="payment-method-quick"><span>Mokėti:</span><button onClick={()=>openPayment(c,"cash")}>Grynais</button><button onClick={()=>openPayment(c,"bank_transfer")}>Bankiniu</button><button onClick={()=>openPayment(c,"stripe")}>Stripe</button></div>}
            {invoiceId?<button className="ghost-link" onClick={()=>invoiceUrl&&window.open(invoiceUrl,"_blank")}>🧾 Sąskaita</button>:c.students?.payment_preference==="cash"?<span className="muted small">💵 Sąskaita123 nenaudojama</span>:<button className="ghost-link" onClick={()=>createInvoice(c)} disabled={invoiceBusy===c.id}>🧾 {invoiceBusy===c.id?"{lang==="lt"?"Kuriama…":lang==="es"?"Creando…":"Creating…"}":"Sukurti sąskaitą"}</button>}
            <button className="ghost-link" onClick={()=>setShowHistory(x=>({...x,[c.id]:!x[c.id]}))}><History size={13}/>{t("paymentHistory")} ({history.length})</button>
          </div>
          {history.some(p=>p.payment_method==="stripe")&&<span className="stripe-match">✓ Apmokėta per Stripe</span>}
          {showHistory[c.id]&&<div className="history-box">{history.length?history.map(p=><div className="history-row" key={p.id}><span>{new Date(p.paid_at).toLocaleDateString()} · {p.payment_method==="cash"?"💵 "+t("cash"):p.payment_method==="bank_transfer"?"🏦 "+t("bank"):"💳 "+t("stripe")}</span><b>{money(Number(p.amount))}</b>{(role==="admin"||role==="teacher")&&<div className="card-actions"><button className="icon-btn" title={t("editPayment")} onClick={()=>setEditing(p)}><Pencil size={14}/></button><button className="icon-btn danger" title={t("deletePayment")} onClick={()=>removePayment(p)}><Trash2 size={14}/></button></div>}</div>):<span className="muted small">{t("noHistory")}</span>}</div>}
        </article>
      })}
      {!charges.length&&<div className="empty">{t("noCharges")}</div>}{charges.length>0&&!charges.some(c=>paymentFilter==="all"||(paymentFilter==="paid"&&Number(c.amount_paid)>=Number(c.amount_due))||(paymentFilter==="unpaid"&&Number(c.amount_paid)<Number(c.amount_due)))&&<div className="empty">Šiame filtre mokėjimų nėra.</div>}
    </section>
}    {role==="teacher"&&<p className="muted small">{t("teacherFinanceNote")}</p>}
    {paymentCharge&&<PaymentModal charge={paymentCharge} lang={lang} preferredMethod={paymentMethodPreset??undefined} close={()=>{setPaymentCharge(null);setPaymentMethodPreset(null)}} save={savePayment}/>}
    {editing&&<PaymentEditModal payment={editing} lang={lang} close={()=>setEditing(null)} save={updatePayment}/>}
  </div>
}
function PaymentHistory({role,month}:{role:Role;month:string}){
  const [rows,setRows]=useState<any[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState("");
  async function load(){
    setLoading(true);setError("");
    const {data,error:qError}=await supabase
      .from("payments")
      .select("id,amount,payment_method,paid_at,monthly_charge_id,students(first_name,last_name,email),monthly_charges!inner(month,groups(name))")
      .eq("monthly_charges.month",month+"-01")
      .order("paid_at",{ascending:false});
    if(qError){setError(qError.message);setRows([]);setLoading(false);return}
    const out=(data??[]).map((x:any)=>({
      id:x.id,
      name:[x.students?.first_name,x.students?.last_name].filter(Boolean).join(" ")||"—",
      email:x.students?.email||"—",
      amount:Number(x.amount),
      date:x.paid_at,
      method:x.payment_method,
      detail:x.monthly_charges?.groups?.name||"Abonementas"
    }));
    setRows(out);setLoading(false);
  }
  useEffect(()=>{if(role==="admin")load()},[role,month]);
  const total=rows.reduce((s,x)=>s+Number(x.amount||0),0);
  const label=(m:string)=>m==="stripe"?"Kortele":m==="cash"?"Grynais":"Bankiniu pavedimu";
  const monthLabel=new Date(month+"-01T12:00:00").toLocaleDateString("lt-LT",{month:"long",year:"numeric"});
  return <section className="panel payment-history-panel">
    <div className="panel-head"><div><div className="eyebrow">MOKĖJIMŲ ISTORIJA · {monthLabel.toUpperCase()}</div><h2>Šio mėnesio apmokėjimai</h2><p className="muted">Čia rodomi tik pasirinkto mėnesio faktiškai užregistruoti abonementų mokėjimai. Rugsėjo mokėjimai į spalio sąrašą nepatenka.</p></div><button className="secondary" onClick={load}>↻ Atnaujinti</button></div>
    {error&&<div className="alert">{error}</div>}
    <div className="payment-history-summary"><div><span>Apmokėjimų</span><b>{rows.length}</b></div><div><span>{lang==="lt"?"Gauta":lang==="es"?"Recibido":"Received"}</span><b>{money(total)}</b></div><div><span>{t("monthly")}</span><b>{monthLabel}</b></div></div>
    {loading?<div className="empty">Kraunama…</div>:<div className="payment-history-list">{rows.map(x=><div className="payment-history-row" key={x.id}><div><b>{x.name}</b><span>{x.detail}</span><small>{x.email} · {x.date?new Date(x.date).toLocaleString("lt-LT"):"—"}</small></div><div><b>{money(x.amount)}</b><span>{label(x.method)}</span><span className="payment-history-paid">✓ Apmokėta</span></div></div>)}{!rows.length&&<div className="empty">Šį mėnesį dar nėra užregistruotų mokėjimų.</div>}</div>}
  </section>
}
function PaymentModal({charge,lang,preferredMethod,close,save}:{charge:Charge;lang:Lang;preferredMethod?:PaymentMethod;close:()=>void;save:(amount:number,method:PaymentMethod)=>void}){const t=(k:TKey)=>tx(lang,k);const [amount,setAmount]=useState(String(Number(charge.amount_due)-Number(charge.amount_paid)));const preferred=(preferredMethod||charge.students?.payment_preference||"bank_transfer") as PaymentMethod;const [method,setMethod]=useState<PaymentMethod>(preferred==="cash"||preferred==="bank_transfer"||preferred==="stripe"?preferred:"bank_transfer");const label=(m:PaymentMethod)=>t(m==="bank_transfer"?"bank":m);return <Modal title={t("recordPayment")} close={close}><p><b>{charge.students?.first_name} {charge.students?.last_name}</b></p><Field label={`${t("amount")} · ${t("remaining")}: ${money(Number(charge.amount_due)-Number(charge.amount_paid))}`} value={amount} set={setAmount} type="number"/><label>{t("method")}</label><div className="method-grid">{(["cash","bank_transfer","stripe"] as PaymentMethod[]).map(m=><button key={m} className={method===m?"method active":"method"} onClick={()=>setMethod(m)}>{label(m)}</button>)}</div><div className="actions"><button className="secondary" onClick={close}>{t("cancel")}</button><button className="primary small-btn" onClick={()=>save(Number(amount),method)}>{t("save")}</button></div></Modal>}
function PaymentEditModal({payment,lang,close,save}:{payment:Payment;lang:Lang;close:()=>void;save:(amount:number,method:PaymentMethod)=>void}){const t=(k:TKey)=>tx(lang,k);const [amount,setAmount]=useState(String(payment.amount));const [method,setMethod]=useState<PaymentMethod>(payment.payment_method);return <Modal title={t("editPayment")} close={close}><Field label={t("amount")} value={amount} set={setAmount} type="number"/><label>{t("method")}</label><div className="method-grid">{(["cash","bank_transfer","stripe"] as PaymentMethod[]).map(m=><button key={m} className={method===m?"method active":"method"} onClick={()=>setMethod(m)}>{t(m==="bank_transfer"?"bank":m)}</button>)}</div><div className="actions"><button className="secondary" onClick={close}>{t("cancel")}</button><button className="primary small-btn" onClick={()=>save(Number(amount),method)}>{t("save")}</button></div></Modal>}

function LessonReservations({lang}:{lang:Lang}){
 const title=lang==="en"?"Lesson reservations":lang==="es"?"Reservas de clases":"Pamokų rezervacijos";
 const months=["Sausis","Vasaris","Kovas","Balandis","Gegužė","Birželis","Liepa","Rugpjūtis","Rugsėjis","Spalis","Lapkritis","Gruodis"];
 const d=new Date(),[year,setYear]=useState(d.getFullYear()),[month,setMonth]=useState(d.getMonth()+1),[tab,setTab]=useState<"groups"|"dropin">("groups"),[orders,setOrders]=useState<any[]>([]),[lessons,setLessons]=useState<DropLesson[]>([]),[bookings,setBookings]=useState<DropBooking[]>([]),[error,setError]=useState(""),[loading,setLoading]=useState(true);
 async function load(){setLoading(true);const [a,b]=await Promise.all([supabase.from("website_orders").select("*").in("order_type",["adult","child"]).order("created_at",{ascending:false}),supabase.from("drop_in_lessons").select("*,groups(name)").eq("is_active",true).order("lesson_date",{ascending:false})]);if(a.error||b.error){setError((a.error||b.error)!.message);setLoading(false);return}setOrders(a.data||[]);const ls=(b.data||[]) as DropLesson[];setLessons(ls);if(ls.length){const q=await supabase.from("drop_in_bookings").select("*").in("lesson_id",ls.map(x=>x.id)).order("id",{ascending:false});setBookings(q.data||[]);if(q.error)setError(q.error.message)}else setBookings([]);setLoading(false)}
 useEffect(()=>{load()},[]);
 const key=year+"-"+String(month).padStart(2,"0"), group=orders.filter(o=>String(reservationEventDate(o)||"").startsWith(key)),lm=new Map(lessons.map(x=>[x.id,x])),drop=bookings.map(x=>({b:x,l:lm.get(x.lesson_id)})).filter(x=>x.l&&String(x.l.lesson_date||"").startsWith(key));
 const groups=Array.from(new Map(group.map(o=>[`${o.child_name||o.customer_name}|${o.parent_email||o.customer_email}|${o.group_text||o.lesson_text}|${o.reservation_date}|${o.start_time}`,o])).values()),drops=Array.from(new Map(drop.map(x=>[`${x.b.email}|${x.b.first_name}|${x.b.last_name}|${x.b.lesson_id}`,x])).values()),rows=tab==="groups"?groups:drops;
 const total=tab==="groups"?groups.reduce((n,o)=>n+Number(o.amount||0),0):drops.reduce((n,x)=>n+Number(x.l?.price||0),0),clients=new Set(rows.map((x:any)=>tab==="groups"?String(x.parent_email||x.customer_email||x.customer_name||x.child_name).toLowerCase():String(x.b.email||x.b.first_name+" "+x.b.last_name).toLowerCase())).size;
 const years=Array.from(new Set([d.getFullYear(),...orders.map(o=>Number(String(reservationEventDate(o)||"").slice(0,4))),...lessons.map(x=>Number(String(x.lesson_date||"").slice(0,4)))] )).filter(Boolean).sort((a,b)=>b-a);
 return <div className="stack">{error&&<div className="alert">{error}</div>}<section className="panel"><div className="panel-head"><div><div className="eyebrow">REZERVACIJOS</div><h2>{title}</h2></div><button className="secondary" onClick={load}>↻ Atnaujinti</button></div><div className="toolbar"><label className="field compact-field"><span>Metai</span><select value={year} onChange={e=>setYear(+e.target.value)}>{years.map(y=><option key={y}>{y}</option>)}</select></label><label className="field compact-field"><span>{t("monthly")}</span><select value={month} onChange={e=>setMonth(+e.target.value)}>{months.map((m,i)=><option key={m} value={i+1}>{m}</option>)}</select></label></div><div className="rental-payment-summary"><div><span>{months[month-1]} {year}</span><b>{rows.length}</b><small>rezervacijos</small></div><div><span>Klientai</span><b>{clients}</b><small>unikalūs</small></div><div><span>Suma</span><b>{money(total)}</b><small>viso</small></div></div><div className="rental-filters"><button className={tab==="groups"?"active":""} onClick={()=>setTab("groups")}>Grupių rezervacijos</button><button className={tab==="dropin"?"active":""} onClick={()=>setTab("dropin")}>Vienkartinės pamokos</button></div></section>{loading?<div className="empty">Kraunama…</div>:<section className="list">{tab==="groups"?groups.map(o=><article className="card rental-card" key={o.id}><div style={{minWidth:0,flex:1}}><b>{o.child_name||o.customer_name||o.parent_name||"—"}</b><span>{o.order_type==="child"?"Vaiko rezervacija":"Suaugusiojo rezervacija"} · {o.group_text||o.lesson_text||"—"}</span><span><strong>Pamoka:</strong> {reservationEventDate(o)||"—"} · {String(o.start_time||o.raw_data?.start||"").slice(0,5)}{(o.end_time||o.raw_data?.end)?`–${String(o.end_time||o.raw_data?.end).slice(0,5)}`:""}</span><span><strong>Rezervuota:</strong> {formatReservedAt(o.raw_data?.data||o.created_at)}</span><span>{o.parent_email||o.customer_email||"—"}</span></div><div className="pay-right"><b>{o.amount!=null?money(+o.amount):"—"}</b><span className="pill paid">{o.status==="processed"?"Patvirtinta":o.status||"—"}</span></div></article>):drops.map(({b,l})=><article className="card rental-card" key={b.id}><div style={{minWidth:0,flex:1}}><b>{b.first_name} {b.last_name}</b><span>{l?.groups?.name||"—"} · {l?.lesson_date||"—"} · {String(l?.start_time||"").slice(0,5)}{l?.end_time?"–"+String(l.end_time).slice(0,5):""}</span><span><strong>Rezervuota:</strong> {formatReservedAt(b.created_at)}</span><span>{b.email||"—"}</span></div><div className="pay-right"><b>{money(+(l?.price||0))}</b><span className={b.status==="paid"?"pill paid":"pill pending"}>{b.status==="paid"?"Apmokėta":"Laukiama"}</span></div></article>)}{!rows.length&&<div className="empty">Šį mėnesį rezervacijų nėra.</div>}</section>}</div>
}function Teachers({role,lang}:{role:Role;lang:Lang}){const t=(k:TKey)=>tx(lang,k);const [rows,setRows]=useState<any[]>([]),[groups,setGroups]=useState<Group[]>([]),[invite,setInvite]=useState(false),[open,setOpen]=useState<any|null>(null),[selected,setSelected]=useState<string[]>([]),[first,setFirst]=useState(""),[last,setLast]=useState(""),[email,setEmail]=useState(""),[subs,setSubs]=useState<any[]>([]),[subOpen,setSubOpen]=useState(false),[subForm,setSubForm]=useState({group_id:"",teacher_id:"",starts_on:todayISO(),ends_on:todayISO(),notes:""}),[error,setError]=useState("");async function load(){const [tq,gq,aq,sq]=await Promise.all([supabase.from("teachers").select("id,profile_id,profiles(first_name,last_name,email)").eq("is_active",true),supabase.from("groups").select("*").eq("is_active",true).order("name"),supabase.from("group_teachers").select("teacher_id,group_id"),supabase.from("teacher_substitutions").select("*,groups(name),teachers(id,profiles(first_name,last_name))").order("starts_on",{ascending:false})]);setRows(tq.data??[]);setGroups((gq.data??[]) as Group[]);setSubs(sq.data??[]);const map:Record<string,string[]>={};(aq.data??[]).forEach((x:any)=>map[x.teacher_id]=[...(map[x.teacher_id]??[]),x.group_id]);setOpen((o:any)=>o?{...o,map}:o)}useEffect(()=>{if(role==="admin")load()},[role]);async function send(){const {error}=await supabase.functions.invoke("invite-teacher",{body:{first_name:first,last_name:last,email}});if(error)setError(error.message);else{setInvite(false);setFirst("");setLast("");setEmail("");load()}}async function save(){if(!open)return;await supabase.from("group_teachers").delete().eq("teacher_id",open.id);if(selected.length)await supabase.from("group_teachers").insert(selected.map((group_id,i)=>({teacher_id:open.id,group_id,is_primary:i===0})));setOpen(null);load()}async function saveSub(){const {error}=await supabase.from("teacher_substitutions").insert(subForm);if(error)setError(error.message);else{setSubOpen(false);setSubForm({group_id:"",teacher_id:"",starts_on:todayISO(),ends_on:todayISO(),notes:""});load()}}async function deleteSub(id:string){if(!confirm(lang==="lt"?"Ištrinti pavadavimą?":lang==="es"?"¿Eliminar la sustitución?":"Delete substitution?"))return;const {error}=await supabase.from("teacher_substitutions").delete().eq("id",id);if(error)setError(error.message);else load()}if(role!=="admin")return <section className="panel empty"><p>{t("groupManaged")}</p></section>;return <div className="stack">{error&&<div className="alert">{error}</div>}<div className="toolbar"><span>{t("assignGroups")}</span><button className="secondary" onClick={()=>setInvite(true)}><Plus size={16}/>{t("addTeacher")}</button></div><section className="list">{rows.map(tch=><article className="card" key={tch.id}><div><b>{tch.profiles?.first_name} {tch.profiles?.last_name}</b><span>{tch.profiles?.email}</span></div><button className="secondary compact" onClick={async()=>{const {data}=await supabase.from("group_teachers").select("group_id").eq("teacher_id",tch.id);setSelected((data??[]).map((x:any)=>x.group_id));setOpen(tch)}}>{t("assignGroups")}</button></article>)}</section>{!rows.length&&<div className="empty">{t("noTeachers")}</div>}<section className="panel"><div className="panel-head"><div><div className="eyebrow">{t("substitutions")}</div><h2>{t("substitutions")}</h2></div><button className="secondary" onClick={()=>setSubOpen(true)}><UserPlus size={16}/>{t("addSubstitution")}</button></div><div className="list">{subs.map(s=><article className="card" key={s.id}><div><b>{s.groups?.name}</b><span>{s.teachers?.profiles?.first_name} {s.teachers?.profiles?.last_name}</span><span>{s.starts_on} → {s.ends_on}</span></div><button className="icon-btn danger" onClick={()=>deleteSub(s.id)}><Trash2 size={14}/></button></article>)}{!subs.length&&<span className="muted small">—</span>}</div></section>{invite&&<Modal title={t("inviteTeacher")} close={()=>setInvite(false)}><Field label={t("firstName")} value={first} set={setFirst}/><Field label={t("lastName")} value={last} set={setLast}/><Field label={t("email")} value={email} set={setEmail}/><div className="actions"><button className="secondary" onClick={()=>setInvite(false)}>{t("cancel")}</button><button className="primary small-btn" onClick={send}>{t("sendInvitation")}</button></div></Modal>}{open&&<Modal title={`${open.profiles?.first_name} ${open.profiles?.last_name}`} close={()=>setOpen(null)}><div className="checks">{groups.map(g=><label className="check" key={g.id}><input type="checkbox" checked={selected.includes(g.id)} onChange={()=>setSelected(x=>x.includes(g.id)?x.filter(id=>id!==g.id):[...x,g.id])}/>{g.name}</label>)}</div><div className="actions"><button className="secondary" onClick={()=>setOpen(null)}>{t("cancel")}</button><button className="primary small-btn" onClick={save}>{t("saveAssignment")}</button></div></Modal>}{subOpen&&<Modal title={t("addSubstitution")} close={()=>setSubOpen(false)}><label>{t("groups")}</label><select value={subForm.group_id} onChange={e=>setSubForm({...subForm,group_id:e.target.value})}><option value="">—</option>{groups.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}</select><label>{t("substitute")}</label><select value={subForm.teacher_id} onChange={e=>setSubForm({...subForm,teacher_id:e.target.value})}><option value="">—</option>{rows.map(r=><option key={r.id} value={r.id}>{r.profiles?.first_name} {r.profiles?.last_name}</option>)}</select><div className="form-grid"><Field label={t("starts")} type="date" value={subForm.starts_on} set={v=>setSubForm({...subForm,starts_on:v})}/><Field label={t("ends")} type="date" value={subForm.ends_on} set={v=>setSubForm({...subForm,ends_on:v})}/></div><div className="actions"><button className="secondary" onClick={()=>setSubOpen(false)}>{t("cancel")}</button><button className="primary small-btn" onClick={saveSub}>{t("save")}</button></div></Modal>}</div>}

function Rentals({role,lang}:{role:Role;lang:Lang}){const t=(k:TKey)=>tx(lang,k);
const [rows,setRows]=useState<Rental[]>([]),[open,setOpen]=useState(false),[busy,setBusy]=useState<string|null>(null),[waivedFlash,setWaivedFlash]=useState<string|null>(null),[error,setError]=useState(""),[paymentFilter,setPaymentFilter]=useState<"all"|"cash"|"bank_transfer"|"stripe">("all"),[selectedRentalMonth,setSelectedRentalMonth]=useState(currentMonth());
const [form,setForm]=useState({customer_name:"",email:"",phone:"",rental_type:"short_term",starts_at:"",ends_at:"",price:"",payment_method:"cash" as PaymentMethod,notes:""});
async function load(){
  const start=new Date(`${selectedRentalMonth}-01T00:00:00`);
  const next=new Date(start.getFullYear(),start.getMonth()+1,1);
  const {data,error}=await supabase.from("studio_rentals").select("*").eq("is_active",true).gte("starts_at",start.toISOString()).lt("starts_at",next.toISOString()).order("created_at",{ascending:false}).order("starts_at",{ascending:false});
  if(error)setError(error.message);setRows((data??[]) as Rental[])
}
useEffect(()=>{if(role==="admin")load()},[role,selectedRentalMonth]);
function reset(){setForm({customer_name:"",email:"",phone:"",rental_type:"short_term",starts_at:"",ends_at:"",price:"",payment_method:"cash",notes:""});setOpen(true)}
async function createRental(){
 setError("");
 if(!form.customer_name||!form.starts_at||!form.ends_at||!Number(form.price))return setError("Įveskite klientą, laiką ir kainą.");
 if(form.payment_method==="stripe"&&!form.email.trim())return setError(t("emailRequired"));
 setBusy("create");
 const {data,error}=await supabase.from("studio_rentals").insert({
  customer_name:form.customer_name,customer_email:form.email.trim()||null,customer_phone:form.phone.trim()||null,rental_type:form.rental_type,
  starts_at:new Date(form.starts_at).toISOString(),ends_at:new Date(form.ends_at).toISOString(),reserved_at:new Date().toISOString(),price:Number(form.price),
  payment_status:"pending",payment_method:form.payment_method,notes:form.notes.trim()||null
 }).select("*").single();
 if(error){setBusy(null);return setError(error.message)}
 setOpen(false);await load();
 if(form.payment_method==="stripe")await startStripePayment(data as Rental);
 setBusy(null);
}
async function startStripePayment(r:Rental){
 setBusy(r.id);setError("");
 const {data,error}=await supabase.functions.invoke("stripe-checkout",{body:{payment_kind:"rental",rental_id:r.id,payer:{email:r.customer_email,full_name:r.customer_name,phone:r.customer_phone},success_url:window.location.origin+"/?rental_payment=success",cancel_url:window.location.origin+"/?rental_payment=cancelled"}});
 if(error||!data?.checkout_url){setBusy(null);return setError(error?.message||data?.error||"Stripe mokėjimo nuoroda nesukurta.");}
 window.open(data.checkout_url,"_blank","noopener,noreferrer");setBusy(null);
}
async function markCashPaid(r:Rental){
 setBusy(r.id);setError("");
 const {error}=await supabase.from("studio_rentals").update({payment_status:"paid",payment_method:"cash",stripe_payment_status:null,paid_at:new Date().toISOString()}).eq("id",r.id);
 if(error){setBusy(null);return setError(error.message)}
 await load();
 setBusy(null);
}
async function markBankPaid(r:Rental){
 setBusy(r.id);setError("");
 const {error}=await supabase.from("studio_rentals").update({payment_status:"paid",payment_method:"bank_transfer",stripe_payment_status:null,paid_at:new Date().toISOString()}).eq("id",r.id);
 if(error){setBusy(null);return setError(error.message)}
 await load();setBusy(null);
}
async function waiveRentalPayment(r:Rental){
 setBusy(r.id);setError("");
 const {error}=await supabase.from("studio_rentals").update({
  payment_status:"waived",payment_method:null,stripe_payment_id:null,stripe_payment_status:null,paid_at:null,
  notes:[r.notes,"Nemokama darbuotojo / mokytojo rezervacija"].filter(Boolean).join(" · ")
 }).eq("id",r.id);
 if(error){setBusy(null);return setError(error.message)}
 await load();setWaivedFlash(r.id);window.setTimeout(()=>setWaivedFlash(null),1400);setBusy(null);
}
async function restoreRentalPayment(r:Rental){
 setBusy(r.id);setError("");
 const {error}=await supabase.from("studio_rentals").update({
  payment_status:"pending",payment_method:null,stripe_payment_id:null,stripe_payment_status:null,paid_at:null
 }).eq("id",r.id);
 if(error){setBusy(null);return setError(error.message)}
 await load();setBusy(null);
}
async function setRentalPaymentMethod(r:Rental,method:PaymentMethod){
 setBusy(r.id);setError("");
 const {error}=await supabase.from("studio_rentals").update({payment_method:method,stripe_payment_status:method==="stripe"?r.stripe_payment_status:null}).eq("id",r.id);
 if(error){setBusy(null);return setError(error.message)}
 await load();setBusy(null);
 if(method==="stripe"){
  const latest=(await supabase.from("studio_rentals").select("*").eq("id",r.id).single()).data as Rental|null;
  if(latest)await startStripePayment(latest);
 }
}

async function issueInvoice(r:Rental){
 setBusy(r.id);setError("");
 const {data,error}=await supabase.functions.invoke("create-rental-saskaita123-invoice",{body:{rental_id:r.id}});
 if(error||data?.error){setBusy(null);return setError(error?.message||data?.error||"Sąskaitos išrašyti nepavyko.");}
 await load();setBusy(null);
}
if(role!=="admin")return <section className="panel empty"><p>{t("groupManaged")}</p></section>;
return <div className="stack">{error&&<div className="alert">{error}</div>}
<div className="toolbar"><div><b>{t("rentals")}</b></div><div className="toolbar-actions"><label className="field compact-field"><span>{t("monthly")}</span><input type="month" value={selectedRentalMonth} onChange={e=>setSelectedRentalMonth(e.target.value)}/></label><button className="secondary" onClick={reset}><Plus size={16}/>{t("addRental")}</button></div></div>
<section className="rental-payment-summary"><div><span>{new Date(`${selectedRentalMonth}-01T00:00:00`).toLocaleDateString("lt-LT",{month:"long",year:"numeric"})}</span><b>{rows.length}</b><small>rezervacijos šį mėnesį</small></div><div><span>Gauti mokėjimai</span><b>{money(rows.filter(r=>r.payment_status==="paid").reduce((s,r)=>s+Number(r.price),0))}</b><small>{rows.filter(r=>r.payment_status==="paid").length} apmokėta nuoma</small></div><div><span>Laukiama</span><b>{money(rows.filter(r=>r.payment_status==="pending").reduce((s,r)=>s+Number(r.price),0))}</b><small>{rows.filter(r=>r.payment_status==="pending").length} laukia</small></div><div><span>Mokėtina nuoma</span><b>{money(rows.filter(r=>r.payment_status!=="waived"&&r.payment_status!=="cancelled").reduce((s,r)=>s+Number(r.price),0))}</b><small>nemokamos darbuotojų rezervacijos neįskaičiuotos</small></div></section><div className="rental-filters"><button className={paymentFilter==="all"?"active":""} onClick={()=>setPaymentFilter("all")}>Visi</button><button className={paymentFilter==="cash"?"active":""} onClick={()=>setPaymentFilter("cash")}>Grynais</button><button className={paymentFilter==="bank_transfer"?"active":""} onClick={()=>setPaymentFilter("bank_transfer")}>Bankiniu</button><button className={paymentFilter==="stripe"?"active":""} onClick={()=>setPaymentFilter("stripe")}>Stripe</button></div><section className="list">{rows.filter(r=>paymentFilter==="all"||r.payment_method===paymentFilter).map(r=><article className="card rental-card" key={r.id}>
 <div style={{minWidth:0,flex:1}}><b>{r.customer_name}</b>
  <div className="rental-datetime">
   <div className="rental-date">
    <CalendarCheck size={15}/>
    <span>{new Date(r.starts_at).toLocaleDateString("lt-LT",{day:"2-digit",month:"long",year:"numeric"})}</span>
   </div>
   <div className="rental-time">
    <span>{new Date(r.starts_at).toLocaleTimeString("lt-LT",{hour:"2-digit",minute:"2-digit"})}</span>
    <i>→</i>
    <span>{new Date(r.ends_at).toLocaleTimeString("lt-LT",{hour:"2-digit",minute:"2-digit"})}</span>
   </div>
  </div>
  <span><strong>Nuoma:</strong> {new Date(r.starts_at).toLocaleDateString("lt-LT",{day:"2-digit",month:"long",year:"numeric"})} · {new Date(r.starts_at).toLocaleTimeString("lt-LT",{hour:"2-digit",minute:"2-digit"})}–{new Date(r.ends_at).toLocaleTimeString("lt-LT",{hour:"2-digit",minute:"2-digit"})}</span><span><strong>Rezervuota:</strong> {formatReservedAt(r.reserved_at||r.created_at)}</span><span>{r.rental_type==="short_term"?t("shortTerm"):t("longTerm")} · {money(Number(r.price))} · {r.customer_email||"—"}</span>
  {r.paid_at&&<span>{t("paidAt")}: {new Date(r.paid_at).toLocaleString("lt-LT",{dateStyle:"short",timeStyle:"short"})}</span>}
  {r.saskaita123_invoice_number&&<span>{t("invoiceNumber")}: {r.saskaita123_invoice_number} · {t("invoiceReady")}</span>}
  {r.saskaita123_invoice_error&&<span className="muted">{t("invoiceError")}: {r.saskaita123_invoice_error}</span>}
 </div>
 <div className="pay-right">
  <span className={`pill ${r.payment_status}`}>{r.payment_status==="paid"?t("paid"):r.payment_status==="cancelled"?t("cancelled"):r.payment_status==="waived"?t("waived"):t("pending")}</span>
  <b>{r.payment_method==="stripe"?"Stripe":r.payment_method==="cash"?t("cash"):r.payment_method==="bank_transfer"?t("bank"):"—"}</b>
  {r.payment_status!=="paid"&&r.payment_status!=="cancelled"&&<div className="rental-method-quick"><span>Mokėjimas:</span><button className={r.payment_method==="cash"?"active":""} onClick={()=>setRentalPaymentMethod(r,"cash")}>Grynais</button><button className={r.payment_method==="bank_transfer"?"active":""} onClick={()=>setRentalPaymentMethod(r,"bank_transfer")}>Bankiniu</button><button className={r.payment_method==="stripe"?"active":""} onClick={()=>setRentalPaymentMethod(r,"stripe")}>Stripe</button></div>}
  <div className="actions">
   {r.payment_status!=="paid"&&r.payment_method==="stripe"&&<button className="secondary small-btn" disabled={busy===r.id} onClick={()=>startStripePayment(r)}>{t("payWithStripe")}</button>}
   {r.payment_status!=="paid"&&r.payment_status!=="waived"&&r.payment_method==="cash"&&<button className="secondary small-btn" disabled={busy===r.id} onClick={()=>markCashPaid(r)}>{t("markPaidCash")}</button>}{r.payment_status!=="paid"&&r.payment_status!=="waived"&&r.payment_method==="bank_transfer"&&<button className="secondary small-btn" disabled={busy===r.id} onClick={()=>markBankPaid(r)}>Pažymėti apmokėtą pavedimu</button>}{r.payment_status!=="paid"&&r.payment_status!=="waived"&&r.payment_status!=="cancelled"&&<button className={busy===r.id?"secondary small-btn waive-btn is-saving":"secondary small-btn waive-btn"} disabled={busy===r.id} onClick={()=>waiveRentalPayment(r)}>{busy===r.id?"Išsaugoma…":waivedFlash===r.id?"✓ Nemokama":"Nemokama – mokytojas / studija"}</button>}{r.payment_status==="waived"&&<button className="secondary small-btn" disabled={busy===r.id} onClick={()=>restoreRentalPayment(r)}>Grąžinti mokėjimą</button>}
   <button className="secondary small-btn" disabled={busy===r.id} onClick={()=>issueInvoice(r)}>{r.saskaita123_invoice_number?t("invoiceReady"):t("issueInvoice")}</button>
   {r.saskaita123_invoice_url&&<a className="secondary small-btn" href={r.saskaita123_invoice_url} target="_blank" rel="noreferrer">{t("details")}</a>}
  </div>
 </div>
</article>)}{!rows.length&&<div className="empty">{t("noRentals")}</div>}</section>
{open&&<Modal title={t("addRental")} close={()=>setOpen(false)}>
 <Field label={t("customer")} value={form.customer_name} set={v=>setForm({...form,customer_name:v})}/>
 <div className="form-grid"><Field label={t("email")} value={form.email} set={v=>setForm({...form,email:v})} type="email"/><Field label={t("phone")} value={form.phone} set={v=>setForm({...form,phone:v})}/>
 <div><label>{t("rentalType")}</label><select value={form.rental_type} onChange={e=>setForm({...form,rental_type:e.target.value})}><option value="short_term">{t("shortTerm")}</option><option value="long_term">{t("longTerm")}</option></select></div>
 <Field label={t("price")} value={form.price} set={v=>setForm({...form,price:v})} type="number"/>
 <Field label={t("start")} value={form.starts_at} set={v=>setForm({...form,starts_at:v})} type="datetime-local"/>
 <Field label={t("end")} value={form.ends_at} set={v=>setForm({...form,ends_at:v})} type="datetime-local"/></div>
 <div className="form-grid"><div><label>{t("method")}</label><select value={form.payment_method} onChange={e=>setForm({...form,payment_method:e.target.value as PaymentMethod})}><option value="cash">{t("cash")}</option><option value="bank_transfer">{t("bank")}</option><option value="stripe">Stripe</option></select></div></div>
 <label>{t("notes")}</label><textarea value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/>
 <div className="actions"><button className="secondary" onClick={()=>setOpen(false)}>{t("cancel")}</button><button className="primary small-btn" disabled={busy==="create"} onClick={createRental}>{form.payment_method==="stripe"?t("payWithStripe"):t("saveRental")}</button></div>
</Modal>}</div>}

function SettingsPage({role,lang,setLang,seasonId,onSeasonCreated}:{role:Role;lang:Lang;setLang:(v:Lang)=>void;seasonId:string;onSeasonCreated:(id:string)=>void}){const t=(k:TKey)=>tx(lang,k);const [prices,setPrices]=useState<Price[]>([]),[open,setOpen]=useState(false),[editing,setEditing]=useState<Price|null>(null),[name,setName]=useState(""),[amount,setAmount]=useState("");async function load(){const {data}=await supabase.from("prices").select("*").eq("is_active",true).order("amount");setPrices((data??[]) as Price[])}useEffect(()=>{if(role==="admin")load()},[role]);if(role!=="admin")return <div className="stack"><section className="panel"><div className="panel-head"><div><div className="eyebrow">{t("language")}</div><h2>{t("language")}</h2></div></div><p className="muted">{t("languageNote")}</p><select value={lang} onChange={e=>setLang(e.target.value as Lang)}><option value="lt">Lietuvių</option><option value="en">English</option><option value="es">Español</option></select></section></div>;function create(){setEditing(null);setName("");setAmount("");setOpen(true)}function edit(p:Price){setEditing(p);setName(p.name);setAmount(String(p.amount));setOpen(true)}async function save(){const n=Number(amount);if(!name||!Number.isFinite(n)||n<0)return;const r=editing?await supabase.from("prices").update({name,amount:n}).eq("id",editing.id):await supabase.from("prices").insert({name,amount:n,currency:"EUR",billing_period:"monthly"});if(r.error)alert(r.error.message);else{setOpen(false);load()}}async function deactivate(p:Price){await supabase.from("prices").update({is_active:false}).eq("id",p.id);load()}return <div className="stack"><SeasonManagement seasonId={seasonId} onSeasonCreated={onSeasonCreated}/><section className="panel"><div className="panel-head"><div><div className="eyebrow">{t("pricing")}</div><h2>{t("studioPrices")}</h2></div><button className="secondary" onClick={create}><Plus size={16}/>{t("addPrice")}</button></div><div className="list">{prices.map(p=><article className="card" key={p.id}><div><b>{p.name}</b><span>{t("monthly")} · EUR</span></div><div className="card-actions"><b>{money(Number(p.amount))}</b><button className="icon-btn" onClick={()=>edit(p)}><Pencil size={14}/></button><button className="icon-btn danger" onClick={()=>deactivate(p)}><Trash2 size={14}/></button></div></article>)}</div></section><section className="panel"><div className="panel-head"><div><div className="eyebrow"><Languages size={13}/></div><h2>{t("language")}</h2></div></div><p className="muted">{t("languageNote")}</p><select value={lang} onChange={e=>setLang(e.target.value as Lang)}><option value="lt">Lietuvių</option><option value="en">English</option><option value="es">Español</option></select></section>{open&&<Modal title={editing?t("editPrice"):t("addPrice")} close={()=>setOpen(false)}><Field label={t("priceName")} value={name} set={setName}/><Field label={t("monthlyAmount")} value={amount} set={setAmount} type="number"/><div className="actions"><button className="secondary" onClick={()=>setOpen(false)}>{t("cancel")}</button><button className="primary small-btn" onClick={save}>{t("savePrice")}</button></div></Modal>}</div>}

function Field({label,value,set,type="text"}:{label:string;value:string;set:(v:string)=>void;type?:string}){return <div><label>{label}</label><input type={type} value={value} onChange={e=>set(e.target.value)}/></div>}
function Modal({title,close,children}:{title:string;close:()=>void;children:any}){return <div className="backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)close()}}><section className="modal"><div className="modal-head"><h2>{title}</h2><button className="round" onClick={close}><X size={17}/></button></div>{children}</section></div>}
export default App;