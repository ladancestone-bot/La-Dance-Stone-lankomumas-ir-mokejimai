import { useEffect, useMemo, useState } from "react";
import {
  CalendarCheck, CreditCard, LayoutDashboard, LogOut, Plus, Settings,
  UserRound, Users, UsersRound, X, Building2, UserPlus, ChevronRight,
  Pencil, Trash2, History, Languages
} from "lucide-react";
import { supabase } from "./lib/supabase";
import SeasonManagement from "./SeasonManagement";

type Role = "admin" | "teacher";
type Lang = "lt" | "en" | "es";
type Section = "dashboard" | "schedule" | "attendance" | "payments" | "reservations" | "students" | "groups" | "teachers" | "rentals" | "settings";
type AttendanceStatus = "present" | "absent" | "sick";
type PaymentMethod = "cash" | "bank_transfer" | "stripe";
// Keep billing in safe mode until invoice/payment reconciliation is fully verified.
const BILLING_TEST_MODE = true;

type Student = {
  id: string; first_name: string; last_name: string; email: string | null; phone: string | null;
  date_of_birth: string | null; parent_name: string | null; parent_phone: string | null;
  parent_email: string | null; notes: string | null; payment_preference?: string | null;
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
type DropBooking = { id:string; lesson_id:string; student_id:string|null; first_name:string; last_name:string; email:string|null; phone:string|null; status:string; payment_method:PaymentMethod|null; attendance_status:AttendanceStatus|null };
type Rental = { id:string; customer_name:string; customer_email:string|null; customer_phone:string|null; rental_type:string; starts_at:string; created_at?:string|null; ends_at:string; price:number; payment_status:string; payment_method:PaymentMethod|null; stripe_checkout_session_id?:string|null; stripe_payment_status?:string|null; stripe_payment_id?:string|null; paid_at?:string|null; saskaita123_invoice_id?:string|null; saskaita123_invoice_number?:string|null; saskaita123_invoice_url?:string|null; saskaita123_synced_at?:string|null; saskaita123_invoice_error?:string|null; invoice_created_at?:string|null; notes:string|null; is_active:boolean };

type TKey = keyof typeof translations.en;
const translations = {
  en: {
    dashboard:"Overview", schedule:"Schedule", students:"Students", groups:"Groups", attendance:"Attendance", payments:"Payments", reservations:"Lesson reservations", teachers:"Teachers", rentals:"Rentals", settings:"Settings",
    studioManagement:"STUDIO MANAGEMENT", privateAccess:"Private access for La Dance Stone administrators and teachers.", signIn:"Send secure sign-in link", email:"Email", accessPending:"Access pending", noRole:"Your account is authenticated but has no studio role yet.", signOut:"Sign out",
    activeStudents:"Active students", activeGroups:"Active groups", outstanding:"Outstanding", today:"Today's classes will appear here when the schedule is connected.",
    searchStudents:"Search students…", addStudent:"Add student", edit:"Edit", save:"Save", cancel:"Cancel", firstName:"First name", lastName:"Last name", phone:"Phone", dob:"Date of birth", parentName:"Parent name", parentPhone:"Parent phone", parentEmail:"Parent email", notes:"Notes", noContact:"No contact", noGroup:"No group assigned", selectGroups:"Select groups",
    addGroup:"Add group", editGroup:"Edit group", groupName:"Group name", level:"Level", description:"Description", groupManaged:"Groups are managed by the administrator.", groupDetail:"Group detail", members:"Students", groupAttendance:"Attendance", groupPayments:"Payments", back:"Back",
    chooseGroup:"Choose group", noStudents:"No students in this group.", attendanceStatuses:"Attendance statuses are only Present, Absent and Sick.", present:"Present", absent:"Absent", sick:"Sick", newParticipants:"ONE-OFF LESSONS / NEW PARTICIPANTS", paymentStatus:"Payment status", markAttendance:"Mark attendance",
    recordPayment:"Record payment", amount:"Amount", remaining:"Remaining", method:"Payment method", cash:"Cash", bank:"Bank transfer", stripe:"Card", cashTotal:"Cash", bankTotal:"Bank transfers", cardTotal:"Cards", totalReceived:"Total received", paymentHistory:"Payment history", editPayment:"Edit payment", deletePayment:"Delete payment", noCharges:"No monthly charges yet.", noHistory:"No payment history.", confirmDelete:"Delete this payment?", teacherFinanceNote:"Teacher access is limited by database permissions to assigned students.",
    inviteTeacher:"Invite teacher", addTeacher:"Add teacher", assignGroups:"Assign groups", sendInvitation:"Send invitation", substitutions:"Substitutions", addSubstitution:"Add substitution", substitute:"Substitute", starts:"Starts", ends:"Ends", saveAssignment:"Save assignments", noTeachers:"No active teachers yet.",
    addRental:"Add rental", customer:"Customer", start:"Start", end:"End", rentalType:"Rental type", shortTerm:"Short term", longTerm:"Long term", price:"Price", pending:"Pending", paid:"Paid", cancelled:"Cancelled", saveRental:"Save rental", noRentals:"No rentals yet.",
    pricing:"PRICING", paymentPreference:"Preferred payment method", bankPreference:"Bank transfer", cardPreference:"Card", cashPreference:"Cash", studioPrices:"Studio prices", addPrice:"Add price", priceName:"Price name", monthlyAmount:"Monthly amount (€)", monthly:"Monthly", language:"Language", languageNote:"Choose the app language for this device.", savePrice:"Save price", editPrice:"Edit price", deactivate:"Deactivate", active:"Active", reload:"Reload", details:"Details", contact:"Contact", invoiceCreated:"Invoice created", invoiceSent:"Invoice sent", invoiceNotSent:"Not sent", billingTest:"TEST MODE – nothing is sent to clients",
    rentalPayment:"Rental payment", payWithStripe:"Pay with Stripe", markPaidCash:"Mark paid in cash", issueInvoice:"Issue invoice", invoiceNumber:"Invoice", stripeReceipt:"Stripe receipt", invoiceError:"Invoice error", openPayment:"Open payment", paymentReceived:"Payment received", invoiceReady:"Invoice issued", notIssued:"Not issued", paidAt:"Paid at", emailRequired:"Customer email is required for Stripe payment",
  },
  lt: {
    dashboard:"Apžvalga", schedule:"Grafikas", students:"Mokiniai", groups:"Grupės", attendance:"Lankomumas", payments:"Mokėjimai", reservations:"Pamokų rezervacijos", teachers:"Mokytojai", rentals:"Nuoma", settings:"Nustatymai",
    studioManagement:"STUDIJOS VALDYMAS", privateAccess:"Privati prieiga La Dance Stone administratoriams ir mokytojams.", signIn:"Siųsti saugią prisijungimo nuorodą", email:"El. paštas", accessPending:"Prieiga laukiama", noRole:"Paskyra patvirtinta, tačiau jai dar nepriskirta studijos rolė.", signOut:"Atsijungti",
    activeStudents:"Aktyvūs mokiniai", activeGroups:"Aktyvios grupės", outstanding:"Neapmokėta", today:"Šiandienos pamokos bus rodomos, kai bus prijungtas tvarkaraštis.",
    searchStudents:"Ieškoti mokinių…", addStudent:"Pridėti mokinį", edit:"Redaguoti", save:"Išsaugoti", cancel:"Atšaukti", firstName:"Vardas", lastName:"Pavardė", phone:"Telefonas", dob:"Gimimo data", parentName:"Tėvų vardas", parentPhone:"Tėvų telefonas", parentEmail:"Tėvų el. paštas", notes:"Pastabos", noContact:"Nėra kontaktų", noGroup:"Grupė nepriskirta", selectGroups:"Pasirinkite grupes",
    addGroup:"Pridėti grupę", editGroup:"Redaguoti grupę", groupName:"Grupės pavadinimas", level:"Lygis", description:"Aprašymas", groupManaged:"Grupes valdo administratorius.", groupDetail:"Grupės informacija", members:"Mokiniai", groupAttendance:"Lankomumas", groupPayments:"Mokėjimai", back:"Atgal",
    chooseGroup:"Pasirinkite grupę", noStudents:"Šioje grupėje mokinių nėra.", attendanceStatuses:"Lankomumo statusai: Dalyvavo, Nedalyvavo ir Serga.", present:"Dalyvavo", absent:"Nedalyvavo", sick:"Serga", newParticipants:"VIENKARTINĖS PAMOKOS / NAUJI DALYVIAI", paymentStatus:"Mokėjimo būsena", markAttendance:"Pažymėti lankomumą",
    recordPayment:"Registruoti mokėjimą", amount:"Suma", remaining:"Likutis", method:"Mokėjimo būdas", cash:"Grynais", bank:"Bankiniu pavedimu", stripe:"Kortele", cashTotal:"Grynais", bankTotal:"Bankiniai pavedimai", cardTotal:"Kortelės", totalReceived:"Iš viso gauta", paymentHistory:"Mokėjimų istorija", editPayment:"Redaguoti mokėjimą", deletePayment:"Ištrinti mokėjimą", noCharges:"Mėnesinių mokėjimų nėra.", noHistory:"Mokėjimų istorijos nėra.", confirmDelete:"Ištrinti šį mokėjimą?", teacherFinanceNote:"Mokytojo prieiga ribojama jo grupių mokiniais pagal duomenų bazės teises.",
    inviteTeacher:"Pakviesti mokytoją", addTeacher:"Pridėti mokytoją", assignGroups:"Priskirti grupes", sendInvitation:"Siųsti kvietimą", substitutions:"Pavadavimai", addSubstitution:"Pridėti pavadavimą", substitute:"Pavaduojantis mokytojas", starts:"Nuo", ends:"Iki", saveAssignment:"Išsaugoti priskyrimus", noTeachers:"Aktyvių mokytojų dar nėra.",
    addRental:"Pridėti nuomą", customer:"Klientas", start:"Pradžia", end:"Pabaiga", rentalType:"Nuomos tipas", shortTerm:"Trumpalaikė", longTerm:"Ilgalaikė", price:"Kaina", pending:"Laukiama", paid:"Apmokėta", cancelled:"Atšaukta", saveRental:"Išsaugoti nuomą", noRentals:"Nuomų nėra.",
    pricing:"KAINOS", paymentPreference:"Pageidaujamas mokėjimo būdas", bankPreference:"Bankiniu pavedimu", cardPreference:"Kortele", cashPreference:"Grynais", studioPrices:"Studijos kainos", addPrice:"Pridėti kainą", priceName:"Kainos pavadinimas", monthlyAmount:"Mėnesio suma (€)", monthly:"Mėnesinis", language:"Kalba", languageNote:"Pasirinkite aplikacijos kalbą šiame įrenginyje.", savePrice:"Išsaugoti kainą", editPrice:"Redaguoti kainą", deactivate:"Deaktyvuoti", active:"Aktyvi", reload:"Atnaujinti", details:"Informacija", contact:"Kontaktai", invoiceCreated:"Sąskaita sukurta", invoiceSent:"Sąskaita išsiųsta", invoiceNotSent:"Neišsiųsta", billingTest:"TESTAVIMO REŽIMAS – klientams niekas nesiunčiama",
    rentalPayment:"Nuomos apmokėjimas", payWithStripe:"Apmokėti per Stripe", markPaidCash:"Pažymėti apmokėtą grynais", issueInvoice:"Išrašyti sąskaitą", invoiceNumber:"Sąskaita", stripeReceipt:"Stripe kvitas", invoiceError:"Sąskaitos klaida", openPayment:"Atidaryti mokėjimą", paymentReceived:"Mokėjimas gautas", invoiceReady:"Sąskaita išrašyta", notIssued:"Neišrašyta", paidAt:"Apmokėta", emailRequired:"Stripe mokėjimui būtinas kliento el. paštas",
  },
  es: {
    dashboard:"Resumen", schedule:"Horario", students:"Alumnos", groups:"Grupos", attendance:"Asistencia", payments:"Pagos", reservations:"Reservas de clases", teachers:"Profesores", rentals:"Alquiler", settings:"Ajustes",
    studioManagement:"GESTIÓN DEL ESTUDIO", privateAccess:"Acceso privado para administradores y profesores de La Dance Stone.", signIn:"Enviar enlace seguro", email:"Correo electrónico", accessPending:"Acceso pendiente", noRole:"Tu cuenta está autenticada pero aún no tiene un rol del estudio.", signOut:"Cerrar sesión",
    activeStudents:"Alumnos activos", activeGroups:"Grupos activos", outstanding:"Pendiente", today:"Las clases de hoy aparecerán cuando se conecte el horario.",
    searchStudents:"Buscar alumnos…", addStudent:"Añadir alumno", edit:"Editar", save:"Guardar", cancel:"Cancelar", firstName:"Nombre", lastName:"Apellido", phone:"Teléfono", dob:"Fecha de nacimiento", parentName:"Nombre del padre/madre", parentPhone:"Teléfono del padre/madre", parentEmail:"Correo del padre/madre", notes:"Notas", noContact:"Sin contacto", noGroup:"Sin grupo", selectGroups:"Seleccionar grupos",
    addGroup:"Añadir grupo", editGroup:"Editar grupo", groupName:"Nombre del grupo", level:"Nivel", description:"Descripción", groupManaged:"Los grupos son gestionados por el administrador.", groupDetail:"Detalle del grupo", members:"Alumnos", groupAttendance:"Asistencia", groupPayments:"Pagos", back:"Volver",
    chooseGroup:"Elegir grupo", noStudents:"No hay alumnos en este grupo.", attendanceStatuses:"Estados: Presente, Ausente y Enfermo.", present:"Presente", absent:"Ausente", sick:"Enfermo", newParticipants:"CLASES SUELTAS / NUEVOS PARTICIPANTES", paymentStatus:"Estado del pago", markAttendance:"Marcar asistencia",
    recordPayment:"Registrar pago", amount:"Importe", remaining:"Restante", method:"Método de pago", cash:"Efectivo", bank:"Transferencia", stripe:"Tarjeta", cashTotal:"Efectivo", bankTotal:"Transferencias", cardTotal:"Tarjetas", totalReceived:"Total recibido", paymentHistory:"Historial de pagos", editPayment:"Editar pago", deletePayment:"Eliminar pago", noCharges:"No hay cargos mensuales.", noHistory:"No hay historial de pagos.", confirmDelete:"¿Eliminar este pago?", teacherFinanceNote:"El acceso del profesor está limitado a sus alumnos mediante los permisos de la base de datos.",
    inviteTeacher:"Invitar profesor", addTeacher:"Añadir profesor", assignGroups:"Asignar grupos", sendInvitation:"Enviar invitación", substitutions:"Sustituciones", addSubstitution:"Añadir sustitución", substitute:"Profesor sustituto", starts:"Desde", ends:"Hasta", saveAssignment:"Guardar asignaciones", noTeachers:"No hay profesores activos.",
    addRental:"Añadir alquiler", customer:"Cliente", start:"Inicio", end:"Fin", rentalType:"Tipo de alquiler", shortTerm:"Corto plazo", longTerm:"Largo plazo", price:"Precio", pending:"Pendiente", paid:"Pagado", cancelled:"Cancelado", saveRental:"Guardar alquiler", noRentals:"No hay alquileres.",
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
const currentMonth = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`; };
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
  const [teacherProfileChosen,setTeacherProfileChosen]=useState(false);
  const t=(k:TKey)=>tx(lang,k);
  useEffect(()=>{localStorage.setItem("lds-lang",lang)},[lang]);
  useEffect(()=>{supabase.auth.getSession().then(({data})=>setSession(data.session));const {data}=supabase.auth.onAuthStateChange((_e,s)=>setSession(s));return()=>data.subscription.unsubscribe()},[]);
  useEffect(()=>{setTeacherProfileChosen(false);if(!session?.user?.id){setRole(null);return}supabase.from("user_roles").select("role").eq("user_id",session.user.id).then(({data})=>{const r=data??[];setRole(r.some((x:any)=>x.role==="admin")?"admin":r.some((x:any)=>x.role==="teacher")?"teacher":null)})},[session?.user?.id]);
  useEffect(()=>{if(!role){setSeasons([]);setSeasonId("");return}supabase.from("seasons").select("id,name").eq("is_active",true).order("starts_on",{ascending:false,nullsFirst:false}).then(({data,error})=>{if(error){setSeasons([]);return}const items=(data??[]) as Array<{id:string;name:string}>;setSeasons(items);setSeasonId(current=>items.some(s=>s.id===current)?current:"")})},[role]);
  useEffect(()=>{if(role==="teacher"&&["students","teachers","rentals","reservations"].includes(section))setSection("dashboard")},[role,section]);
  useEffect(()=>{if(role==="admin")supabase.functions.invoke("sync-stripe-payments")},[role]);
  async function login(){setMessage("");const {error}=await supabase.auth.signInWithOtp({email,options:{shouldCreateUser:false,emailRedirectTo:window.location.origin}});setMessage(error?error.message:(lang==="lt"?"Patikrinkite el. paštą ir atidarykite prisijungimo nuorodą.":lang==="es"?"Revisa tu correo y abre el enlace de acceso.":"Check your email for the secure sign-in link."))}
  if(!session)return <main className="auth"><section className="auth-card"><div className="brand">LA DANCE STONE</div><div className="eyebrow">ATTENDANCE & PAYMENTS</div><h1>{lang==="lt"?"Studijos valdymas vienoje vietoje.":lang==="es"?"Gestión del estudio en un solo lugar.":"Studio management, in one place."}</h1><p>{t("privateAccess")}</p><label>{t("email")}</label><input value={email} onChange={e=>setEmail(e.target.value)} type="email" placeholder="you@example.com"/><button className="primary" onClick={login} disabled={!email}>{t("signIn")}</button>{message&&<div className="message">{message}</div>}<div className="language-mini"><Languages size={14}/><select value={lang} onChange={e=>setLang(e.target.value as Lang)}><option value="lt">Lietuvių</option><option value="en">English</option><option value="es">Español</option></select></div></section></main>;
  if(!role)return <main className="auth"><section className="auth-card"><div className="brand">LA DANCE STONE</div><h1>{t("accessPending")}</h1><p>{t("noRole")}</p><button className="primary" onClick={()=>supabase.auth.signOut()}>{t("signOut")}</button></section></main>;
  if(role==="teacher"&&!teacherProfileChosen)return <TeacherProfileChooser lang={lang} email={session.user.email||""} onContinue={()=>setTeacherProfileChosen(true)} onSignOut={()=>supabase.auth.signOut()}/>;
  const visibleNav: { id: Section; key: TKey; icon: any }[] = role==="admin" ? [...nav,{id:"reservations",key:"reservations",icon:CalendarCheck},{id:"groups",key:"groups",icon:Users},{id:"students",key:"students",icon:UserRound},{id:"teachers",key:"teachers",icon:UsersRound},{id:"rentals",key:"rentals",icon:Building2},{id:"settings",key:"settings",icon:Settings}] : nav;
  const current=visibleNav.find(n=>n.id===section)??visibleNav[0];
  return <div className="shell"><header className="topbar"><div><div className="brand">LA DANCE STONE</div><div className="eyebrow">ATTENDANCE & PAYMENTS · {role.toUpperCase()}</div></div><div className="top-actions">{seasons.length>0&&<select aria-label="Activity period" value={seasonId} onChange={e=>setSeasonId(e.target.value)}><option value="">Legacy / all-time</option>{seasons.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select>}<select className="lang-select" value={lang} onChange={e=>setLang(e.target.value as Lang)}><option value="lt">LT</option><option value="en">EN</option><option value="es">ES</option></select><button className="round" onClick={()=>supabase.auth.signOut()} title={t("signOut")}><LogOut size={17}/></button></div></header><main className="content"><div className="heading"><div className="eyebrow">{t("studioManagement")}</div><h1>{t(current.key)}</h1></div>{section==="dashboard"&&<Dashboard role={role} lang={lang} seasonId={seasonId}/>} {section==="schedule"&&<ScheduleLink lang={lang}/>} {section==="attendance"&&<Attendance lang={lang} seasonId={seasonId}/>} {section==="payments"&&<Payments role={role} lang={lang} seasonId={seasonId}/>} {section==="reservations"&&role==="admin"&&<LessonReservations lang={lang}/>} {section==="students"&&role==="admin"&&<Students role={role} lang={lang} seasonId={seasonId}/>} {section==="groups"&&role==="admin"&&<Groups role={role} lang={lang} seasonId={seasonId}/>} {section==="teachers"&&role==="admin"&&<Teachers role={role} lang={lang}/>} {section==="rentals"&&role==="admin"&&<Rentals role={role} lang={lang}/>} {section==="settings"&&<SettingsPage role={role} lang={lang} setLang={setLang} seasonId={seasonId} onSeasonCreated={(id)=>{setSeasonId(id);supabase.from("seasons").select("id,name").eq("is_active",true).order("starts_on",{ascending:false,nullsFirst:false}).then(({data})=>setSeasons((data??[]) as Array<{id:string;name:string}>))}}/>}</main><nav className="nav">{visibleNav.map(n=>{const Icon=n.icon;return <button key={n.id} className={section===n.id?"nav-btn active":"nav-btn"} onClick={()=>setSection(n.id)}><Icon size={18}/><span>{t(n.key)}</span></button>})}</nav></div>
}

function TeacherProfileChooser({lang,email,onContinue,onSignOut}:{lang:Lang;email:string;onContinue:()=>void;onSignOut:()=>void}){
  const [team,setTeam]=useState<any[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  useEffect(()=>{
    let alive=true;
    supabase.from("teachers").select("id,profiles(first_name,last_name,email)").eq("is_active",true).then(({data,error})=>{
      if(!alive)return;
      if(error)setError(error.message);
      setTeam(data??[]);
      setLoading(false);
    });
    return()=>{alive=false};
  },[]);
  const own=team.find(x=>String(x.profiles?.email??"").toLowerCase()===email.toLowerCase());
  const fullName=(person:any)=>`${person.profiles?.first_name??""} ${person.profiles?.last_name??""}`.trim();
  const initials=(person:any)=>fullName(person).split(" ").filter(Boolean).map((x:string)=>x[0]).join("").slice(0,2).toUpperCase()||"?";
  return <main className="profile-entry">
    <section className="profile-entry-inner">
      <div className="eyebrow">LA DANCE STONE ŠOKIŲ STUDIJA</div>
      <h1>{lang==="lt"?"Kas jūs?":lang==="es"?"¿Quién eres?":"Who are you?"}</h1>
      <p className="profile-intro">{lang==="lt"?"Pasirinkite savo profilį, kad patektumėte į studijos valdymą.":lang==="es"?"Elige tu perfil para entrar a la gestión del estudio.":"Choose your profile to enter studio management."}</p>
      {loading?<div className="empty">...</div>:error?<div className="alert">{error}</div>:<div className="profile-list">
        {team.map(person=>{
          const active=own?.id===person.id;
          const name=fullName(person);
          return <button key={person.id} className={active?"profile-card active":"profile-card"} disabled={!active} onClick={onContinue}>
            <span className="profile-avatar">{initials(person)}</span>
            <span className="profile-copy"><b>{name}</b><small>{lang==="lt"?"Mokytojas / Treneris":lang==="es"?"Profesor / Entrenador":"Teacher / Trainer"}</small>{active&&<em>{lang==="lt"?"Jūsų profilis":lang==="es"?"Tu perfil":"Your profile"}</em>}</span>
            {active&&<ChevronRight size={20}/>}
          </button>
        })}
      </div>}
      {!loading&&!error&&!own&&<p className="alert">{lang==="lt"?"Šiam el. paštui mokytojo profilis dar nepriskirtas.":lang==="es"?"Este correo aún no está asignado a un perfil de profesor.":"This email is not assigned to a teacher profile yet."}</p>}
      <button className="ghost-link profile-exit" onClick={onSignOut}><LogOut size={15}/>{lang==="lt"?"Atsijungti":lang==="es"?"Cerrar sesión":"Sign out"}</button>
    </section>
  </main>
}

function ScheduleLink({lang}:{lang:Lang}){const title=lang==="lt"?"Atidaryti mokytojų grafiką":lang==="es"?"Abrir horario de profesores":"Open teacher schedule";return <section className="panel empty"><CalendarCheck size={30}/><h2>{title}</h2><p className="muted">La Dance Stone · 2026–2027</p><button className="primary" onClick={()=>window.open("https://sokiu-mokytoju-grafikas2026-2027.netlify.app/","_blank","noopener,noreferrer")}>{lang==="lt"?"Atidaryti grafiką":lang==="es"?"Abrir horario":"Open schedule"}</button></section>}

function Dashboard({role,lang,seasonId}:{role:Role;lang:Lang;seasonId:string}){
  const [monthlyClients,setMonthlyClients]=useState(0),[oneOffClients,setOneOffClients]=useState(0),[oneOffBookings,setOneOffBookings]=useState(0),[rentalClients,setRentalClients]=useState(0),[rentals,setRentals]=useState(0),[groups,setGroups]=useState(0),[outstanding,setOutstanding]=useState(0),[loading,setLoading]=useState(true);
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
      if(seasonId){
        const {data}=await supabase.from("season_enrollments").select("student_id").eq("season_id",seasonId).eq("is_active",true);
        monthly=new Set((data??[]).map((x:any)=>x.student_id).filter(Boolean)).size;
      }else{
        const {data}=await supabase.from("group_students").select("student_id").eq("is_active",true);
        monthly=new Set((data??[]).map((x:any)=>x.student_id).filter(Boolean)).size;
      }
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
      const {data:charges}=await supabase.from("monthly_charges").select("amount_due,amount_paid");
      setOutstanding((charges??[]).reduce((s:number,x:any)=>s+Math.max(0,Number(x.amount_due)-Number(x.amount_paid)),0));
      setLoading(false);
    }
    load();
    return()=>{alive=false};
  },[seasonId]);
  return <div className="stack">
    {role==="admin"&&<section className="client-overview">
      <div className="client-overview-head"><div><div className="eyebrow">KLIENTŲ APŽVALGA</div><h2>Klientai pagal paslaugą</h2><p>Šokių abonementai, vienkartinės pamokos ir studijos nuoma skaičiuojami atskirai.</p></div></div>
      <div className="client-segments">
        <article className="client-segment"><div className="client-segment-icon"><Users size={20}/></div><div><span>Mėnesiniai šokių klientai</span><b>{loading?"—":monthlyClients}</b><small>Aktyvūs šio sezono mokiniai</small></div></article>
        <article className="client-segment"><div className="client-segment-icon"><CalendarCheck size={20}/></div><div><span>Vienkartinių pamokų klientai</span><b>{loading?"—":oneOffClients}</b><small>{oneOffBookings} vienkartinės rezervacijos</small></div></article>
        <article className="client-segment"><div className="client-segment-icon"><Building2 size={20}/></div><div><span>Nuomos klientai</span><b>{loading?"—":rentalClients}</b><small>{rentals} nuomos rezervacijos</small></div></article>
      </div>
    </section>}
    <section className="stats">
      <div className="stat"><span>{tx(lang,"activeGroups")}</span><b>{loading?"—":groups}</b></div>
      <div className="stat"><span>{tx(lang,"outstanding")}</span><b>{loading?"—":money(outstanding)}</b></div>
      <div className="stat"><span>Šokių klientai šį sezoną</span><b>{loading?"—":monthlyClients}</b></div>
    </section>
    <section className="panel empty"><CalendarCheck size={28}/><p>{tx(lang,"today")}</p></section>
  </div>
}
function Students({role,lang,seasonId}:{role:Role;lang:Lang;seasonId:string}){
  const t=(k:TKey)=>tx(lang,k);
  const [rows,setRows]=useState<Student[]>([]),[groups,setGroups]=useState<Group[]>([]),[memberships,setMemberships]=useState<Record<string,string[]>>({}),[search,setSearch]=useState(""),[category,setCategory]=useState<"all"|"children"|"adults">("all"),[selectedGroupFilter,setSelectedGroupFilter]=useState("all"),[open,setOpen]=useState(false),[detail,setDetail]=useState<Student|null>(null),[editing,setEditing]=useState<Student|null>(null),[selectedGroups,setSelectedGroups]=useState<string[]>([]),[form,setForm]=useState({first_name:"",last_name:"",email:"",phone:"",date_of_birth:"",parent_name:"",parent_phone:"",parent_email:"",notes:"",payment_preference:""}),[error,setError]=useState("");
  async function load(){
    const [s,g]=await Promise.all([supabase.from("students").select("*").eq("is_active",true).order("last_name"),supabase.from("groups").select("*").eq("is_active",true).order("name")]);
    if(s.error||g.error){setError((s.error||g.error)!.message);return}
    setRows((s.data??[]) as Student[]);setGroups((g.data??[]) as Group[]);
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
  function create(){setDetail(null);setEditing(null);setSelectedGroups([]);setForm({first_name:"",last_name:"",email:"",phone:"",date_of_birth:"",parent_name:"",parent_phone:"",parent_email:"",notes:"",payment_preference:""});setOpen(true)}
  function edit(s:Student){setDetail(null);setEditing(s);setSelectedGroups(memberships[s.id]??[]);setForm({first_name:s.first_name,last_name:s.last_name,email:s.email??"",phone:s.phone??"",date_of_birth:s.date_of_birth??"",parent_name:s.parent_name??"",parent_phone:s.parent_phone??"",parent_email:s.parent_email??"",notes:s.notes??"",payment_preference:s.payment_preference??""});setOpen(true)}
  async function save(){
    if(!form.first_name.trim()||!form.last_name.trim())return;
    const payload={...form,email:form.email||null,phone:form.phone||null,date_of_birth:form.date_of_birth||null,parent_name:form.parent_name||null,parent_phone:form.parent_phone||null,parent_email:form.parent_email||null,notes:form.notes||null,payment_preference:form.payment_preference||null};
    const r=editing?await supabase.from("students").update(payload).eq("id",editing.id).select().single():await supabase.from("students").insert(payload).select().single();
    if(r.error){setError(r.error.message);return} const id=(r.data as any).id;
    if(seasonId){const {data:configs}=await supabase.from("season_groups").select("id,group_id").eq("season_id",seasonId).eq("is_active",true);const configMap:Record<string,string>={};(configs??[]).forEach((x:any)=>configMap[x.group_id]=x.id);await supabase.from("season_enrollments").update({is_active:false,ended_on:todayISO()}).eq("season_id",seasonId).eq("student_id",id);const inserts=selectedGroups.filter(gid=>configMap[gid]).map(gid=>({season_id:seasonId,season_group_id:configMap[gid],student_id:id,enrolled_on:todayISO(),is_active:true}));if(inserts.length){const ins=await supabase.from("season_enrollments").upsert(inserts,{onConflict:"season_id,season_group_id,student_id"});if(ins.error){setError(ins.error.message);return}}}
    else{await supabase.from("group_students").update({is_active:false}).eq("student_id",id);if(selectedGroups.length)await supabase.from("group_students").upsert(selectedGroups.map(group_id=>({student_id:id,group_id,is_active:true})),{onConflict:"student_id,group_id"})}
    setOpen(false);await load()
  }
  return <div className="stack">{error&&<div className="alert">{error}</div>}
    <div className="toolbar"><input value={search} onChange={e=>setSearch(e.target.value)} placeholder={t("searchStudents")}/>{role==="admin"&&<button className="secondary" onClick={create}><Plus size={16}/>{t("addStudent")}</button>}</div>
    <div className="student-filters"><div className="student-category-tabs"><button className={category==="all"?"student-category active":"student-category"} onClick={()=>setCategory("all")}>Visi</button><button className={category==="children"?"student-category active":"student-category"} onClick={()=>setCategory("children")}>Vaikai</button><button className={category==="adults"?"student-category active":"student-category"} onClick={()=>setCategory("adults")}>Suaugusieji</button></div><select className="student-group-select" value={selectedGroupFilter} onChange={e=>setSelectedGroupFilter(e.target.value)}><option value="all">Visos grupės</option>{groups.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}</select></div>
    <div className="students-summary">{filtered.length} klientai · rodomi tik šio sezono grupėse</div>
    <section className="student-groups-list">{grouped.map(({group,students})=><section className="student-group-section" key={group.id}><div className="student-group-header"><span><b>{group.name}</b><small>{students.length} mok.</small></span></div><div className="list">{students.map(s=><article className="card clickable" key={group.id+"-"+s.id} onClick={()=>setDetail(s)}><div><b>{s.first_name} {s.last_name}</b><span>{s.email||s.phone||s.parent_email||s.parent_phone||t("noContact")}</span></div><div className="card-actions">{role==="admin"&&<button className="secondary compact" onClick={e=>{e.stopPropagation();edit(s)}}><Pencil size={13}/>{t("edit")}</button>}<ChevronRight size={17}/></div></article>)}</div></section>)}{!grouped.length&&<div className="empty">Šiame sezone pagal pasirinktą filtrą mokinių nėra.</div>}</section>
    {detail&&<StudentDetail student={detail} groups={groups.filter(g=>(memberships[detail.id]??[]).includes(g.id))} lang={lang} close={()=>setDetail(null)}/>}
    {open&&<Modal title={editing?t("edit"):t("addStudent")} close={()=>setOpen(false)}><div className="form-grid"><Field label={t("firstName")} value={form.first_name} set={v=>setForm({...form,first_name:v})}/><Field label={t("lastName")} value={form.last_name} set={v=>setForm({...form,last_name:v})}/><Field label={t("email")} value={form.email} set={v=>setForm({...form,email:v})}/><Field label={t("phone")} value={form.phone} set={v=>setForm({...form,phone:v})}/><Field label={t("dob")} type="date" value={form.date_of_birth} set={v=>setForm({...form,date_of_birth:v})}/><Field label={t("parentName")} value={form.parent_name} set={v=>setForm({...form,parent_name:v})}/><Field label={t("parentPhone")} value={form.parent_phone} set={v=>setForm({...form,parent_phone:v})}/><Field label={t("parentEmail")} value={form.parent_email} set={v=>setForm({...form,parent_email:v})}/><div><label>{t("paymentPreference")}</label><select value={form.payment_preference} onChange={e=>setForm({...form,payment_preference:e.target.value})}><option value="">—</option><option value="bank_transfer">{t("bankPreference")}</option><option value="card">{t("cardPreference")}</option><option value="cash">{t("cashPreference")}</option></select></div></div><label>{t("notes")}</label><textarea value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/><label>{seasonId?"Šio sezono grupė":"Grupė"}</label><div className="checks">{groups.map(g=><label className="check" key={g.id}><input type="checkbox" checked={selectedGroups.includes(g.id)} onChange={()=>setSelectedGroups(x=>x.includes(g.id)?x.filter(id=>id!==g.id):[...x,g.id])}/>{g.name}</label>)}</div><div className="actions"><button className="secondary" onClick={()=>setOpen(false)}>{t("cancel")}</button><button className="primary small-btn" onClick={save}>{t("save")}</button></div></Modal>}
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
  const [teachers,setTeachers]=useState<any[]>([]),[teacherId,setTeacherId]=useState("");
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
      <div><b>{g.name}</b><span>{g.level||"—"}</span><span>{g.description||""}</span></div>
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

function Attendance({lang,seasonId}:{lang:Lang;seasonId:string}){const t=(k:TKey)=>tx(lang,k);const [groups,setGroups]=useState<Group[]>([]),[groupId,setGroupId]=useState(""),[date,setDate]=useState(todayISO()),[students,setStudents]=useState<Student[]>([]),[values,setValues]=useState<Record<string,AttendanceStatus>>({}),[dropLessons,setDropLessons]=useState<DropLesson[]>([]),[dropBookings,setDropBookings]=useState<DropBooking[]>([]),[error,setError]=useState("");async function loadGroups(){let q:any=supabase.from("groups").select("*").eq("is_active",true).order("name");if(seasonId){const {data:configs}=await supabase.from("season_groups").select("group_id").eq("season_id",seasonId).eq("is_active",true);const ids=(configs??[]).map(x=>x.group_id);if(!ids.length){setGroups([]);setGroupId("");return}q=q.in("id",ids)}const {data}=await q;const rows=(data??[]) as Group[];setGroups(rows);if(!rows.some(g=>g.id===groupId))setGroupId("")}async function load(){if(!groupId){setStudents([]);return}let ids:string[]=[];if(seasonId){const {data:config}=await supabase.from("season_groups").select("id").eq("season_id",seasonId).eq("group_id",groupId).maybeSingle();if(config){const {data:m}=await supabase.from("season_enrollments").select("student_id").eq("season_id",seasonId).eq("season_group_id",config.id).eq("is_active",true);ids=(m??[]).map(x=>x.student_id)}}else{const {data:m}=await supabase.from("group_students").select("student_id").eq("group_id",groupId).eq("is_active",true);ids=(m??[]).map((x:any)=>x.student_id)}if(ids.length){const {data:s}=await supabase.from("students").select("*").in("id",ids).eq("is_active",true).order("last_name");setStudents((s??[]) as Student[])}else setStudents([]);try{setValues(await loadEffectiveAttendance(groupId,date))}catch(e){setError((e as Error).message)}}async function loadDropins(){let q=supabase.from("drop_in_lessons").select("*,groups(name)").eq("lesson_date",date).eq("is_active",true).order("start_time");const {data:lessons}=await q;const ls=(lessons??[]) as DropLesson[];setDropLessons(ls);if(!ls.length){setDropBookings([]);return}const {data:bookings}=await supabase.from("drop_in_bookings").select("*").in("lesson_id",ls.map(x=>x.id));setDropBookings((bookings??[]) as DropBooking[])}useEffect(()=>{loadGroups()},[seasonId]);useEffect(()=>{load()},[groupId,date,seasonId]);useEffect(()=>{loadDropins()},[date]);async function setStatus(id:string,status:AttendanceStatus){setError("");try{await recordAttendanceStatus(id,groupId,date,status,seasonId);setValues(v=>({...v,[id]:status}))}catch(e){setError((e as Error).message)}}async function setDrop(id:string,status:AttendanceStatus){const {error}=await supabase.rpc("teacher_set_drop_in_attendance",{p_booking_id:id,p_status:status});if(error)setError(error.message);else setDropBookings(x=>x.map(b=>b.id===id?{...b,attendance_status:status}:b))}return <div className="stack"><section className="dropin-panel"><div><div className="eyebrow">{t("newParticipants")}</div><h2>{date}</h2></div>{dropLessons.map(l=>{const bs=dropBookings.filter(b=>b.lesson_id===l.id);return <div className="dropin-lesson" key={l.id}><div><b>{l.groups?.name||"Group"}</b><span>{l.start_time.slice(0,5)}{l.end_time?`–${l.end_time.slice(0,5)}`:""} · {money(Number(l.price))}</span></div><div className="dropin-people">{bs.length?bs.map(b=><div className="dropin-person" key={b.id}><div><b>{b.first_name} {b.last_name}</b><span>{b.status} · {b.payment_method||"—"}</span><span className="payment-contact">{b.email||"—"}{b.phone?" · ☎ "+b.phone:""}</span></div><div className="mini-att">{(["present","absent","sick"] as AttendanceStatus[]).map(st=><button key={st} className={b.attendance_status===st?`mini ${st}`:"mini"} onClick={()=>setDrop(b.id,st)}>{t(st as TKey)}</button>)}</div></div>):<span className="muted small">{t("noStudents")}</span>}</div></div>})}{!dropLessons.length&&<span className="muted small">{lang==="lt"?"Šiandien vienkartinių dalyvių nėra.":lang==="es"?"No hay participantes de clase suelta hoy.":"No one-off participants today."}</span>}</section><div className="filters"><select value={groupId} onChange={e=>setGroupId(e.target.value)}><option value="">{t("chooseGroup")}</option>{groups.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}</select><input type="date" value={date} onChange={e=>setDate(e.target.value)}/></div>{error&&<div className="alert">{error}</div>}<section className="list">{students.map(s=><article className="attendance" key={s.id}><b>{s.first_name} {s.last_name}</b><div className="attendance-actions">{(["present","absent","sick"] as AttendanceStatus[]).map(st=><button className={values[s.id]===st?`att ${st} selected`:"att"} key={st} onClick={()=>setStatus(s.id,st)}>{t(st as TKey)}</button>)}</div></article>)}{groupId&&!students.length&&<div className="empty">{t("noStudents")}</div>}</section><p className="muted small">{t("attendanceStatuses")}</p></div>}

function Payments({role,lang,seasonId,fixedGroupId}:{role:Role;lang:Lang;seasonId:string;fixedGroupId?:string}){
  const t=(k:TKey)=>tx(lang,k);
  const [charges,setCharges]=useState<Charge[]>([]),[payments,setPayments]=useState<Payment[]>([]),[groups,setGroups]=useState<Group[]>([]);
  const [paymentMethodPreset,setPaymentMethodPreset]=useState<PaymentMethod|null>(null);
  const [selectedGroupId,setSelectedGroupId]=useState(fixedGroupId||"all"),[error,setError]=useState(""),[paymentCharge,setPaymentCharge]=useState<Charge|null>(null),[editing,setEditing]=useState<Payment|null>(null),[showHistory,setShowHistory]=useState<Record<string,boolean>>({}),[selectedMonth,setSelectedMonth]=useState(currentMonth()),[invoiceBusy,setInvoiceBusy]=useState<string|null>(null),[addingMonth,setAddingMonth]=useState(false);

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
    if(role==="admin"){
      const {error:ensureError}=await supabase.rpc("ensure_monthly_charges",{p_month:selectedMonth+"-01"});
      if(ensureError){setError(ensureError.message);return;}
    }
    let chargeQuery:any=supabase.from("monthly_charges").select("*,students(first_name,last_name,email,phone,parent_email,parent_phone,payment_preference),groups(name)").eq("month",selectedMonth+"-01");
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
  function openPayment(c:Charge,method?:PaymentMethod){setPaymentMethodPreset(method??null);setPaymentCharge(c);}

  return <div className="stack">
    {BILLING_TEST_MODE&&<div className="alert">🛡️ {t("billingTest")}</div>}
    {error&&<div className="alert">{error}</div>}
    {role==="admin"&&<div className="muted">Stripe / grynieji / bankiniai pavedimai / Sąskaita123 – nuomos mokėjimai valdomi skiltyje „Nuoma“.</div>}
    <div className="card payment-filters">
      {!fixedGroupId&&<label className="field"><span>Grupė</span><select value={selectedGroupId} onChange={e=>setSelectedGroupId(e.target.value)}><option value="all">Visos grupės</option>{groups.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}</select></label>}
      <label className="field"><span>Mėnuo</span><input type="month" value={selectedMonth} onChange={e=>setSelectedMonth(e.target.value)}/></label>
      {role==="admin"&&!fixedGroupId&&<button className="primary month-add-btn" onClick={addMonth} disabled={addingMonth}>{addingMonth?"Kuriama…":"＋ Pridėti mėnesį"}</button>}
    </div>

    {role==="admin"&&<section className="payment-summary">
      <div className="summary-card"><span>Klientai</span><b>{charges.length}</b></div>
      <div className="summary-card"><span>Apmokėta</span><b>{money(totalPaid)}</b></div>
      <div className="summary-card"><span>Liko</span><b>{money(totalRemaining)}</b></div>
      <div className="summary-card"><span>Statusas</span><b>{paidCount}/{charges.length}</b></div>
    </section>}
    {role==="admin"&&<section className="payment-summary">
      <div className="summary-card"><span>💵 {t("cashTotal")}</span><b>{money(cashTotal)}</b></div>
      <div className="summary-card"><span>🏦 {t("bankTotal")}</span><b>{money(bankTotal)}</b></div>
      <div className="summary-card"><span>💳 {t("cardTotal")}</span><b>{money(cardTotal)}</b></div>
      <div className="summary-card"><span>{t("totalReceived")}</span><b>{money(cashTotal+bankTotal+cardTotal)}</b></div>
    </section>}
    

    <section className="panel"><div className="panel-head"><div><div className="eyebrow">KLIENTŲ MOKĖJIMAI</div><h2>Abonementų ir mėnesiniai mokėjimai</h2><p className="muted">Čia rodomi tik LDS mokinių / klientų abonementų mokėjimai. Pamokų rezervacijos ir nuoma rodomos atskirose skiltyse.</p></div></div></section>

    <section className="list">
      {charges.map(c=>{
        const left=Number(c.amount_due)-Number(c.amount_paid);
        const history=payments.filter(p=>p.monthly_charge_id===c.id);
        const invoiceId=c.saskaita123_invoice_id||c.invoice123_id;
        const invoiceNumber=c.saskaita123_invoice_number||c.invoice123_number;
        const invoiceUrl=c.saskaita123_invoice_url||c.invoice123_url;
        return <article className="card payment-card" key={c.id}>
          <div>
            <b>{c.students?`${c.students.first_name} ${c.students.last_name}`:"Student"}</b>
            <span>{c.groups?.name||"Studio"} · {c.due_date}</span>
            <span>{t("price")}: {money(Number(c.amount_due))}</span>
            <span>{t("paid")}: {money(Number(c.amount_paid))}</span>
            <span>{t("remaining")}: {money(left)}</span>
            <span className="payment-contact">📧 {c.students?.email||c.students?.parent_email||"—"} · ☎ {c.students?.phone||c.students?.parent_phone||"—"}</span>
            {invoiceId?<><span className="payment-contact">🧾 Sąskaita123: {invoiceUrl?<a href={invoiceUrl} target="_blank" rel="noreferrer">{invoiceNumber||invoiceId}</a>:(invoiceNumber||invoiceId)}</span><span className="payment-contact">✓ {t("invoiceCreated")} · {c.invoice_sent_at?t("invoiceSent"):t("invoiceNotSent")}</span></>:null}
          </div>
          <div className="pay-right">
            <b>{money(Number(c.amount_due))}</b>
            <span className={`pill ${c.status}`}>{c.status.replace("_"," ")}</span>
            {left>0&&<div className="payment-method-quick"><span>Mokėti:</span><button onClick={()=>openPayment(c,"cash")}>Grynais</button><button onClick={()=>openPayment(c,"bank_transfer")}>Bankiniu</button><button onClick={()=>openPayment(c,"stripe")}>Stripe</button></div>}
            {invoiceId?<button className="ghost-link" onClick={()=>invoiceUrl&&window.open(invoiceUrl,"_blank")}>🧾 Sąskaita</button>:c.students?.payment_preference==="cash"?<span className="muted small">💵 Sąskaita123 nenaudojama</span>:<button className="ghost-link" onClick={()=>createInvoice(c)} disabled={invoiceBusy===c.id}>🧾 {invoiceBusy===c.id?"Kuriama…":"Sukurti sąskaitą"}</button>}
            <button className="ghost-link" onClick={()=>setShowHistory(x=>({...x,[c.id]:!x[c.id]}))}><History size={13}/>{t("paymentHistory")} ({history.length})</button>
          </div>
          {history.some(p=>p.payment_method==="stripe")&&<span className="stripe-match">✓ Apmokėta per Stripe</span>}
          {showHistory[c.id]&&<div className="history-box">{history.length?history.map(p=><div className="history-row" key={p.id}><span>{new Date(p.paid_at).toLocaleDateString()} · {p.payment_method==="cash"?"💵 "+t("cash"):p.payment_method==="bank_transfer"?"🏦 "+t("bank"):"💳 "+t("stripe")}</span><b>{money(Number(p.amount))}</b>{(role==="admin"||role==="teacher")&&<div className="card-actions"><button className="icon-btn" title={t("editPayment")} onClick={()=>setEditing(p)}><Pencil size={14}/></button><button className="icon-btn danger" title={t("deletePayment")} onClick={()=>removePayment(p)}><Trash2 size={14}/></button></div>}</div>):<span className="muted small">{t("noHistory")}</span>}</div>}
        </article>
      })}
      {!charges.length&&<div className="empty">{t("noCharges")}</div>}
    </section>
    {role==="teacher"&&<p className="muted small">{t("teacherFinanceNote")}</p>}
    {paymentCharge&&<PaymentModal charge={paymentCharge} lang={lang} preferredMethod={paymentMethodPreset??undefined} close={()=>{setPaymentCharge(null);setPaymentMethodPreset(null)}} save={savePayment}/>}
    {editing&&<PaymentEditModal payment={editing} lang={lang} close={()=>setEditing(null)} save={updatePayment}/>}
  </div>
}
function PaymentModal({charge,lang,preferredMethod,close,save}:{charge:Charge;lang:Lang;preferredMethod?:PaymentMethod;close:()=>void;save:(amount:number,method:PaymentMethod)=>void}){const t=(k:TKey)=>tx(lang,k);const [amount,setAmount]=useState(String(Number(charge.amount_due)-Number(charge.amount_paid)));const preferred=(preferredMethod||charge.students?.payment_preference||"bank_transfer") as PaymentMethod;const [method,setMethod]=useState<PaymentMethod>(preferred==="cash"||preferred==="bank_transfer"||preferred==="stripe"?preferred:"bank_transfer");const label=(m:PaymentMethod)=>t(m==="bank_transfer"?"bank":m);return <Modal title={t("recordPayment")} close={close}><p><b>{charge.students?.first_name} {charge.students?.last_name}</b></p><Field label={`${t("amount")} · ${t("remaining")}: ${money(Number(charge.amount_due)-Number(charge.amount_paid))}`} value={amount} set={setAmount} type="number"/><label>{t("method")}</label><div className="method-grid">{(["cash","bank_transfer","stripe"] as PaymentMethod[]).map(m=><button key={m} className={method===m?"method active":"method"} onClick={()=>setMethod(m)}>{label(m)}</button>)}</div><div className="actions"><button className="secondary" onClick={close}>{t("cancel")}</button><button className="primary small-btn" onClick={()=>save(Number(amount),method)}>{t("save")}</button></div></Modal>}
function PaymentEditModal({payment,lang,close,save}:{payment:Payment;lang:Lang;close:()=>void;save:(amount:number,method:PaymentMethod)=>void}){const t=(k:TKey)=>tx(lang,k);const [amount,setAmount]=useState(String(payment.amount));const [method,setMethod]=useState<PaymentMethod>(payment.payment_method);return <Modal title={t("editPayment")} close={close}><Field label={t("amount")} value={amount} set={setAmount} type="number"/><label>{t("method")}</label><div className="method-grid">{(["cash","bank_transfer","stripe"] as PaymentMethod[]).map(m=><button key={m} className={method===m?"method active":"method"} onClick={()=>setMethod(m)}>{t(m==="bank_transfer"?"bank":m)}</button>)}</div><div className="actions"><button className="secondary" onClick={close}>{t("cancel")}</button><button className="primary small-btn" onClick={()=>save(Number(amount),method)}>{t("save")}</button></div></Modal>}

function LessonReservations({lang}:{lang:Lang}){
 const title=lang==="en"?"Lesson reservations":lang==="es"?"Reservas de clases":"Pamokų rezervacijos";
 const months=["Sausis","Vasaris","Kovas","Balandis","Gegužė","Birželis","Liepa","Rugpjūtis","Rugsėjis","Spalis","Lapkritis","Gruodis"];
 const d=new Date(),[year,setYear]=useState(d.getFullYear()),[month,setMonth]=useState(d.getMonth()+1),[tab,setTab]=useState<"groups"|"dropin">("groups"),[orders,setOrders]=useState<any[]>([]),[lessons,setLessons]=useState<DropLesson[]>([]),[bookings,setBookings]=useState<DropBooking[]>([]),[error,setError]=useState(""),[loading,setLoading]=useState(true);
 async function load(){setLoading(true);const [a,b]=await Promise.all([supabase.from("website_orders").select("*").in("order_type",["adult","child"]).order("created_at",{ascending:false}),supabase.from("drop_in_lessons").select("*,groups(name)").eq("is_active",true).order("lesson_date",{ascending:false})]);if(a.error||b.error){setError((a.error||b.error)!.message);setLoading(false);return}setOrders(a.data||[]);const ls=(b.data||[]) as DropLesson[];setLessons(ls);if(ls.length){const q=await supabase.from("drop_in_bookings").select("*").in("lesson_id",ls.map(x=>x.id)).order("id",{ascending:false});setBookings(q.data||[]);if(q.error)setError(q.error.message)}else setBookings([]);setLoading(false)}
 useEffect(()=>{load()},[]);
 const key=`${year}-${String(month).padStart(2,"0")}`, group=orders.filter(o=>String(o.reservation_date||"").startsWith(key)),lm=new Map(lessons.map(x=>[x.id,x])),drop=bookings.map(x=>({b:x,l:lm.get(x.lesson_id)})).filter(x=>x.l&&String(x.l.lesson_date||"").startsWith(key));
 const groups=Array.from(new Map(group.map(o=>[`${o.child_name||o.customer_name}|${o.parent_email||o.customer_email}|${o.group_text||o.lesson_text}|${o.reservation_date}|${o.start_time}`,o])).values()),drops=Array.from(new Map(drop.map(x=>[`${x.b.email}|${x.b.first_name}|${x.b.last_name}|${x.b.lesson_id}`,x])).values()),rows=tab==="groups"?groups:drops;
 const total=tab==="groups"?groups.reduce((n,o)=>n+Number(o.amount||0),0):drops.reduce((n,x)=>n+Number(x.l?.price||0),0),clients=new Set(rows.map((x:any)=>tab==="groups"?String(x.parent_email||x.customer_email||x.customer_name||x.child_name).toLowerCase():String(x.b.email||x.b.first_name+" "+x.b.last_name).toLowerCase())).size;
 const years=Array.from(new Set([d.getFullYear(),...orders.map(o=>Number(String(o.reservation_date||"").slice(0,4))),...lessons.map(x=>Number(String(x.lesson_date||"").slice(0,4)))] )).filter(Boolean).sort((a,b)=>b-a);
 return <div className="stack">{error&&<div className="alert">{error}</div>}<section className="panel"><div className="panel-head"><div><div className="eyebrow">REZERVACIJOS</div><h2>{title}</h2></div><button className="secondary" onClick={load}>↻ Atnaujinti</button></div><div className="toolbar"><label className="field compact-field"><span>Metai</span><select value={year} onChange={e=>setYear(+e.target.value)}>{years.map(y=><option key={y}>{y}</option>)}</select></label><label className="field compact-field"><span>Mėnuo</span><select value={month} onChange={e=>setMonth(+e.target.value)}>{months.map((m,i)=><option key={m} value={i+1}>{m}</option>)}</select></label></div><div className="rental-payment-summary"><div><span>{months[month-1]} {year}</span><b>{rows.length}</b><small>rezervacijos</small></div><div><span>Klientai</span><b>{clients}</b><small>unikalūs</small></div><div><span>Suma</span><b>{money(total)}</b><small>viso</small></div></div><div className="rental-filters"><button className={tab==="groups"?"active":""} onClick={()=>setTab("groups")}>Grupių rezervacijos</button><button className={tab==="dropin"?"active":""} onClick={()=>setTab("dropin")}>Vienkartinės pamokos</button></div></section>{loading?<div className="empty">Kraunama…</div>:<section className="list">{tab==="groups"?groups.map(o=><article className="card rental-card" key={o.id}><div style={{minWidth:0,flex:1}}><b>{o.child_name||o.customer_name||o.parent_name||"—"}</b><span>{o.order_type==="child"?"Vaiko rezervacija":"Suaugusiojo rezervacija"} · {o.group_text||o.lesson_text||"—"}</span><span>{o.reservation_date||"—"}{o.start_time?" · "+String(o.start_time).slice(0,5)+(o.end_time?"–"+String(o.end_time).slice(0,5):""):""}</span><span>{o.parent_email||o.customer_email||"—"}</span></div><div className="pay-right"><b>{o.amount!=null?money(+o.amount):"—"}</b><span className="pill paid">{o.status==="processed"?"Patvirtinta":o.status||"—"}</span></div></article>):drops.map(({b,l})=><article className="card rental-card" key={b.id}><div style={{minWidth:0,flex:1}}><b>{b.first_name} {b.last_name}</b><span>{l?.groups?.name||"—"} · {l?.lesson_date||"—"} · {String(l?.start_time||"").slice(0,5)}{l?.end_time?"–"+String(l.end_time).slice(0,5):""}</span><span>{b.email||"—"}</span></div><div className="pay-right"><b>{money(+(l?.price||0))}</b><span className={b.status==="paid"?"pill paid":"pill pending"}>{b.status==="paid"?"Apmokėta":"Laukiama"}</span></div></article>)}{!rows.length&&<div className="empty">Šį mėnesį rezervacijų nėra.</div>}</section>}</div>
}function Teachers({role,lang}:{role:Role;lang:Lang}){const t=(k:TKey)=>tx(lang,k);const [rows,setRows]=useState<any[]>([]),[groups,setGroups]=useState<Group[]>([]),[invite,setInvite]=useState(false),[open,setOpen]=useState<any|null>(null),[selected,setSelected]=useState<string[]>([]),[first,setFirst]=useState(""),[last,setLast]=useState(""),[email,setEmail]=useState(""),[subs,setSubs]=useState<any[]>([]),[subOpen,setSubOpen]=useState(false),[subForm,setSubForm]=useState({group_id:"",teacher_id:"",starts_on:todayISO(),ends_on:todayISO(),notes:""}),[error,setError]=useState("");async function load(){const [tq,gq,aq,sq]=await Promise.all([supabase.from("teachers").select("id,profile_id,profiles(first_name,last_name,email)").eq("is_active",true),supabase.from("groups").select("*").eq("is_active",true).order("name"),supabase.from("group_teachers").select("teacher_id,group_id"),supabase.from("teacher_substitutions").select("*,groups(name),teachers(id,profiles(first_name,last_name))").order("starts_on",{ascending:false})]);setRows(tq.data??[]);setGroups((gq.data??[]) as Group[]);setSubs(sq.data??[]);const map:Record<string,string[]>={};(aq.data??[]).forEach((x:any)=>map[x.teacher_id]=[...(map[x.teacher_id]??[]),x.group_id]);setOpen((o:any)=>o?{...o,map}:o)}useEffect(()=>{if(role==="admin")load()},[role]);async function send(){const {error}=await supabase.functions.invoke("invite-teacher",{body:{first_name:first,last_name:last,email}});if(error)setError(error.message);else{setInvite(false);setFirst("");setLast("");setEmail("");load()}}async function save(){if(!open)return;await supabase.from("group_teachers").delete().eq("teacher_id",open.id);if(selected.length)await supabase.from("group_teachers").insert(selected.map((group_id,i)=>({teacher_id:open.id,group_id,is_primary:i===0})));setOpen(null);load()}async function saveSub(){const {error}=await supabase.from("teacher_substitutions").insert(subForm);if(error)setError(error.message);else{setSubOpen(false);setSubForm({group_id:"",teacher_id:"",starts_on:todayISO(),ends_on:todayISO(),notes:""});load()}}async function deleteSub(id:string){if(!confirm(lang==="lt"?"Ištrinti pavadavimą?":lang==="es"?"¿Eliminar la sustitución?":"Delete substitution?"))return;const {error}=await supabase.from("teacher_substitutions").delete().eq("id",id);if(error)setError(error.message);else load()}if(role!=="admin")return <section className="panel empty"><p>{t("groupManaged")}</p></section>;return <div className="stack">{error&&<div className="alert">{error}</div>}<div className="toolbar"><span>{t("assignGroups")}</span><button className="secondary" onClick={()=>setInvite(true)}><Plus size={16}/>{t("addTeacher")}</button></div><section className="list">{rows.map(tch=><article className="card" key={tch.id}><div><b>{tch.profiles?.first_name} {tch.profiles?.last_name}</b><span>{tch.profiles?.email}</span></div><button className="secondary compact" onClick={async()=>{const {data}=await supabase.from("group_teachers").select("group_id").eq("teacher_id",tch.id);setSelected((data??[]).map((x:any)=>x.group_id));setOpen(tch)}}>{t("assignGroups")}</button></article>)}</section>{!rows.length&&<div className="empty">{t("noTeachers")}</div>}<section className="panel"><div className="panel-head"><div><div className="eyebrow">{t("substitutions")}</div><h2>{t("substitutions")}</h2></div><button className="secondary" onClick={()=>setSubOpen(true)}><UserPlus size={16}/>{t("addSubstitution")}</button></div><div className="list">{subs.map(s=><article className="card" key={s.id}><div><b>{s.groups?.name}</b><span>{s.teachers?.profiles?.first_name} {s.teachers?.profiles?.last_name}</span><span>{s.starts_on} → {s.ends_on}</span></div><button className="icon-btn danger" onClick={()=>deleteSub(s.id)}><Trash2 size={14}/></button></article>)}{!subs.length&&<span className="muted small">—</span>}</div></section>{invite&&<Modal title={t("inviteTeacher")} close={()=>setInvite(false)}><Field label={t("firstName")} value={first} set={setFirst}/><Field label={t("lastName")} value={last} set={setLast}/><Field label={t("email")} value={email} set={setEmail}/><div className="actions"><button className="secondary" onClick={()=>setInvite(false)}>{t("cancel")}</button><button className="primary small-btn" onClick={send}>{t("sendInvitation")}</button></div></Modal>}{open&&<Modal title={`${open.profiles?.first_name} ${open.profiles?.last_name}`} close={()=>setOpen(null)}><div className="checks">{groups.map(g=><label className="check" key={g.id}><input type="checkbox" checked={selected.includes(g.id)} onChange={()=>setSelected(x=>x.includes(g.id)?x.filter(id=>id!==g.id):[...x,g.id])}/>{g.name}</label>)}</div><div className="actions"><button className="secondary" onClick={()=>setOpen(null)}>{t("cancel")}</button><button className="primary small-btn" onClick={save}>{t("saveAssignment")}</button></div></Modal>}{subOpen&&<Modal title={t("addSubstitution")} close={()=>setSubOpen(false)}><label>{t("groups")}</label><select value={subForm.group_id} onChange={e=>setSubForm({...subForm,group_id:e.target.value})}><option value="">—</option>{groups.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}</select><label>{t("substitute")}</label><select value={subForm.teacher_id} onChange={e=>setSubForm({...subForm,teacher_id:e.target.value})}><option value="">—</option>{rows.map(r=><option key={r.id} value={r.id}>{r.profiles?.first_name} {r.profiles?.last_name}</option>)}</select><div className="form-grid"><Field label={t("starts")} type="date" value={subForm.starts_on} set={v=>setSubForm({...subForm,starts_on:v})}/><Field label={t("ends")} type="date" value={subForm.ends_on} set={v=>setSubForm({...subForm,ends_on:v})}/></div><div className="actions"><button className="secondary" onClick={()=>setSubOpen(false)}>{t("cancel")}</button><button className="primary small-btn" onClick={saveSub}>{t("save")}</button></div></Modal>}</div>}

function Rentals({role,lang}:{role:Role;lang:Lang}){const t=(k:TKey)=>tx(lang,k);
const [rows,setRows]=useState<Rental[]>([]),[open,setOpen]=useState(false),[busy,setBusy]=useState<string|null>(null),[error,setError]=useState(""),[paymentFilter,setPaymentFilter]=useState<"all"|"cash"|"bank_transfer"|"stripe">("all"),[selectedRentalMonth,setSelectedRentalMonth]=useState(currentMonth());
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
  starts_at:new Date(form.starts_at).toISOString(),ends_at:new Date(form.ends_at).toISOString(),price:Number(form.price),
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
<div className="toolbar"><div><b>{t("rentals")}</b></div><div className="toolbar-actions"><label className="field compact-field"><span>Mėnuo</span><input type="month" value={selectedRentalMonth} onChange={e=>setSelectedRentalMonth(e.target.value)}/></label><button className="secondary" onClick={reset}><Plus size={16}/>{t("addRental")}</button></div></div>
<section className="rental-payment-summary"><div><span>{new Date(`${selectedRentalMonth}-01T00:00:00`).toLocaleDateString("lt-LT",{month:"long",year:"numeric"})}</span><b>{rows.length}</b><small>rezervacijos šį mėnesį</small></div><div><span>Gauti mokėjimai</span><b>{money(rows.filter(r=>r.payment_status==="paid").reduce((s,r)=>s+Number(r.price),0))}</b><small>{rows.filter(r=>r.payment_status==="paid").length} apmokėta nuoma</small></div><div><span>Laukiama</span><b>{money(rows.filter(r=>r.payment_status==="pending").reduce((s,r)=>s+Number(r.price),0))}</b><small>{rows.filter(r=>r.payment_status==="pending").length} laukia</small></div><div><span>Nuoma iš viso</span><b>{money(rows.reduce((s,r)=>s+Number(r.price),0))}</b><small>šio mėnesio rezervacijos</small></div></section><div className="rental-filters"><button className={paymentFilter==="all"?"active":""} onClick={()=>setPaymentFilter("all")}>Visi</button><button className={paymentFilter==="cash"?"active":""} onClick={()=>setPaymentFilter("cash")}>Grynais</button><button className={paymentFilter==="bank_transfer"?"active":""} onClick={()=>setPaymentFilter("bank_transfer")}>Bankiniu</button><button className={paymentFilter==="stripe"?"active":""} onClick={()=>setPaymentFilter("stripe")}>Stripe</button></div><section className="list">{rows.filter(r=>paymentFilter==="all"||r.payment_method===paymentFilter).map(r=><article className="card rental-card" key={r.id}>
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
  <span>{r.rental_type==="short_term"?t("shortTerm"):t("longTerm")} · {money(Number(r.price))} · {r.customer_email||"—"}</span>
  {r.paid_at&&<span>{t("paidAt")}: {new Date(r.paid_at).toLocaleString("lt-LT",{dateStyle:"short",timeStyle:"short"})}</span>}
  {r.saskaita123_invoice_number&&<span>{t("invoiceNumber")}: {r.saskaita123_invoice_number} · {t("invoiceReady")}</span>}
  {r.saskaita123_invoice_error&&<span className="muted">{t("invoiceError")}: {r.saskaita123_invoice_error}</span>}
 </div>
 <div className="pay-right">
  <span className={`pill ${r.payment_status}`}>{r.payment_status==="paid"?t("paid"):r.payment_status==="cancelled"?t("cancelled"):t("pending")}</span>
  <b>{r.payment_method==="stripe"?"Stripe":r.payment_method==="cash"?t("cash"):r.payment_method==="bank_transfer"?t("bank"):"—"}</b>
  {r.payment_status!=="paid"&&r.payment_status!=="cancelled"&&<div className="rental-method-quick"><span>Mokėjimas:</span><button className={r.payment_method==="cash"?"active":""} onClick={()=>setRentalPaymentMethod(r,"cash")}>Grynais</button><button className={r.payment_method==="bank_transfer"?"active":""} onClick={()=>setRentalPaymentMethod(r,"bank_transfer")}>Bankiniu</button><button className={r.payment_method==="stripe"?"active":""} onClick={()=>setRentalPaymentMethod(r,"stripe")}>Stripe</button></div>}
  <div className="actions">
   {r.payment_status!=="paid"&&r.payment_method==="stripe"&&<button className="secondary small-btn" disabled={busy===r.id} onClick={()=>startStripePayment(r)}>{t("payWithStripe")}</button>}
   {r.payment_status!=="paid"&&r.payment_method==="cash"&&<button className="secondary small-btn" disabled={busy===r.id} onClick={()=>markCashPaid(r)}>{t("markPaidCash")}</button>}{r.payment_status!=="paid"&&r.payment_method==="bank_transfer"&&<button className="secondary small-btn" disabled={busy===r.id} onClick={()=>markBankPaid(r)}>Pažymėti apmokėtą pavedimu</button>}
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
