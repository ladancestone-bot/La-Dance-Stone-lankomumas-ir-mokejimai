import { useEffect, useMemo, useState } from "react";
import {
  CalendarCheck, CreditCard, LayoutDashboard, LogOut, Plus,
  Settings, UserRound, Users, UsersRound, X
} from "lucide-react";
import { supabase } from "./lib/supabase";

type Role = "admin" | "teacher";
type Section = "dashboard" | "students" | "groups" | "attendance" | "payments" | "teachers" | "settings";
type AttendanceStatus = "present" | "absent" | "sick";

type Student = {
  id: string; first_name: string; last_name: string; email: string | null;
  phone: string | null; date_of_birth: string | null; parent_name: string | null;
  parent_phone: string | null; parent_email: string | null; notes: string | null;
};
type Group = { id: string; name: string; level: string | null; description: string | null };
type Price = { id: string; name: string; amount: number; is_active: boolean };
type Charge = {
  id: string; student_id: string; group_id: string | null; amount_due: number;
  amount_paid: number; status: string; due_date: string; month: string;
  students?: { first_name: string; last_name: string } | null;
  groups?: { name: string } | null;
};

const nav: { id: Section; label: string; icon: any }[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "students", label: "Students", icon: Users },
  { id: "groups", label: "Groups", icon: UsersRound },
  { id: "attendance", label: "Attendance", icon: CalendarCheck },
  { id: "payments", label: "Payments", icon: CreditCard },
  { id: "teachers", label: "Teachers", icon: UserRound },
  { id: "settings", label: "Settings", icon: Settings },
];

const money = (n: number) =>
  new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR" }).format(n);

function App() {
  const [session, setSession] = useState<any>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [section, setSection] = useState<Section>("dashboard");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session?.user?.id) { setRole(null); return; }
    supabase.from("user_roles").select("role").eq("user_id", session.user.id)
      .then(({ data }) => {
        const roles = data ?? [];
        setRole(roles.some((r: any) => r.role === "admin") ? "admin" :
          roles.some((r: any) => r.role === "teacher") ? "teacher" : null);
      });
  }, [session?.user?.id]);

  async function login() {
    setMessage("");
    const { error } = await supabase.auth.signInWithOtp({
      email, options: { shouldCreateUser: false }
    });
    setMessage(error ? error.message : "Check your email for the secure sign-in link.");
  }

  if (!session) return (
    <main className="auth">
      <section className="auth-card">
        <div className="brand">LA DANCE STONE</div>
        <div className="eyebrow">ATTENDANCE & PAYMENTS</div>
        <h1>Studio management, in one place.</h1>
        <p>Private access for La Dance Stone administrators and teachers.</p>
        <label>Email</label>
        <input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="you@example.com" />
        <button className="primary" onClick={login} disabled={!email}>Send secure sign-in link</button>
        {message && <div className="message">{message}</div>}
      </section>
    </main>
  );

  if (!role) return (
    <main className="auth"><section className="auth-card">
      <div className="brand">LA DANCE STONE</div>
      <h1>Access pending</h1>
      <p>Your account is authenticated but has no studio role yet.</p>
      <button className="primary" onClick={() => supabase.auth.signOut()}>Sign out</button>
    </section></main>
  );

  const current = nav.find(n => n.id === section)!;
  return (
    <div className="shell">
      <header className="topbar">
        <div><div className="brand">LA DANCE STONE</div><div className="eyebrow">ATTENDANCE & PAYMENTS · {role.toUpperCase()}</div></div>
        <button className="round" onClick={() => supabase.auth.signOut()}><LogOut size={17}/></button>
      </header>
      <main className="content">
        <div className="heading"><div className="eyebrow">STUDIO MANAGEMENT</div><h1>{current.label}</h1></div>
        {section === "dashboard" && <Dashboard role={role}/>}
        {section === "students" && <Students role={role}/>}
        {section === "groups" && <Groups role={role}/>}
        {section === "attendance" && <Attendance />}
        {section === "payments" && <Payments role={role}/>}
        {section === "teachers" && <Teachers role={role}/>}
        {section === "settings" && <SettingsPage role={role}/>}
      </main>
      <nav className="nav">{nav.map(n => {
        const Icon = n.icon;
        return <button key={n.id} className={section === n.id ? "nav-btn active" : "nav-btn"} onClick={() => setSection(n.id)}>
          <Icon size={18}/><span>{n.label}</span>
        </button>
      })}</nav>
    </div>
  );
}

function Dashboard({ role }: { role: Role }) {
  const [students, setStudents] = useState(0);
  const [groups, setGroups] = useState(0);
  const [outstanding, setOutstanding] = useState(0);

  useEffect(() => {
    supabase.from("students").select("id", { count: "exact", head: true }).eq("is_active", true)
      .then(r => setStudents(r.count ?? 0));
    supabase.from("groups").select("id", { count: "exact", head: true }).eq("is_active", true)
      .then(r => setGroups(r.count ?? 0));
    supabase.from("monthly_charges").select("amount_due,amount_paid")
      .then(({ data }) => setOutstanding((data ?? []).reduce((s: number, x: any) => s + Number(x.amount_due) - Number(x.amount_paid), 0)));
  }, []);

  return <div className="stack">
    <div className="stats">
      <div className="stat"><span>Active students</span><b>{students}</b></div>
      <div className="stat"><span>Active groups</span><b>{groups}</b></div>
      <div className="stat"><span>Outstanding</span><b>{role === "admin" ? money(outstanding) : "—"}</b></div>
    </div>
    <section className="panel empty"><CalendarCheck size={28}/><p>Today's classes will appear here when the schedule is connected.</p></section>
  </div>;
}

function Students({ role }: { role: Role }) {
  const [rows, setRows] = useState<Student[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [memberships, setMemberships] = useState<Record<string,string[]>>({});
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Student | null>(null);
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [form, setForm] = useState({first_name:"",last_name:"",email:"",phone:"",date_of_birth:"",parent_name:"",parent_phone:"",parent_email:"",notes:""});
  const [error, setError] = useState("");

  async function load() {
    const [s,g,m] = await Promise.all([
      supabase.from("students").select("*").eq("is_active",true).order("last_name"),
      supabase.from("groups").select("*").eq("is_active",true).order("name"),
      supabase.from("group_students").select("student_id,group_id").eq("is_active",true)
    ]);
    if (s.error || g.error || m.error) { setError((s.error || g.error || m.error)!.message); return; }
    setRows((s.data ?? []) as Student[]); setGroups((g.data ?? []) as Group[]);
    const map: Record<string,string[]> = {};
    (m.data ?? []).forEach((x:any) => { map[x.student_id] = [...(map[x.student_id] ?? []), x.group_id]; });
    setMemberships(map);
  }
  useEffect(() => { load(); }, []);

  function create() {
    setEditing(null); setSelectedGroups([]);
    setForm({first_name:"",last_name:"",email:"",phone:"",date_of_birth:"",parent_name:"",parent_phone:"",parent_email:"",notes:""});
    setOpen(true);
  }
  function edit(s: Student) {
    setEditing(s); setSelectedGroups(memberships[s.id] ?? []);
    setForm({first_name:s.first_name,last_name:s.last_name,email:s.email??"",phone:s.phone??"",date_of_birth:s.date_of_birth??"",parent_name:s.parent_name??"",parent_phone:s.parent_phone??"",parent_email:s.parent_email??"",notes:s.notes??""});
    setOpen(true);
  }
  async function save() {
    if (!form.first_name.trim() || !form.last_name.trim()) return;
    const payload = {...form, email: form.email || null, phone: form.phone || null, date_of_birth: form.date_of_birth || null, parent_name: form.parent_name || null, parent_phone: form.parent_phone || null, parent_email: form.parent_email || null, notes: form.notes || null};
    const r = editing
      ? await supabase.from("students").update(payload).eq("id",editing.id).select().single()
      : await supabase.from("students").insert(payload).select().single();
    if (r.error) { setError(r.error.message); return; }
    const id = (r.data as any).id;
    await supabase.from("group_students").update({is_active:false}).eq("student_id",id);
    if (selectedGroups.length) await supabase.from("group_students").upsert(selectedGroups.map(group_id => ({student_id:id,group_id,is_active:true})), {onConflict:"student_id,group_id"});
    setOpen(false); await load();
  }
  const filtered = useMemo(() => rows.filter(s => `${s.first_name} ${s.last_name} ${s.email??""} ${s.phone??""}`.toLowerCase().includes(search.toLowerCase())), [rows,search]);

  return <div className="stack">
    {error && <div className="alert">{error}</div>}
    <div className="toolbar"><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search students…"/>{role==="admin"&&<button className="secondary" onClick={create}><Plus size={16}/> Add student</button>}</div>
    <section className="list">{filtered.map(s => {
      const names = groups.filter(g=>(memberships[s.id]??[]).includes(g.id)).map(g=>g.name);
      return <article className="card" key={s.id}><div><b>{s.first_name} {s.last_name}</b><span>{s.email || s.phone || "No contact"}</span><span>{names.join(" · ") || "No group assigned"}</span></div>{role==="admin"&&<button className="secondary compact" onClick={()=>edit(s)}>Edit</button>}</article>;
    })}</section>
    {open && <Modal title={editing ? "Edit student" : "Add student"} close={()=>setOpen(false)}>
      <div className="form-grid">
        <Field label="First name" value={form.first_name} set={v=>setForm({...form,first_name:v})}/>
        <Field label="Last name" value={form.last_name} set={v=>setForm({...form,last_name:v})}/>
        <Field label="Email" value={form.email} set={v=>setForm({...form,email:v})}/>
        <Field label="Phone" value={form.phone} set={v=>setForm({...form,phone:v})}/>
        <Field label="Date of birth" type="date" value={form.date_of_birth} set={v=>setForm({...form,date_of_birth:v})}/>
        <Field label="Parent name" value={form.parent_name} set={v=>setForm({...form,parent_name:v})}/>
        <Field label="Parent phone" value={form.parent_phone} set={v=>setForm({...form,parent_phone:v})}/>
        <Field label="Parent email" value={form.parent_email} set={v=>setForm({...form,parent_email:v})}/>
      </div>
      <label>Groups</label>
      <div className="checks">{groups.map(g=><label className="check" key={g.id}><input type="checkbox" checked={selectedGroups.includes(g.id)} onChange={()=>setSelectedGroups(x=>x.includes(g.id)?x.filter(id=>id!==g.id):[...x,g.id])}/>{g.name}</label>)}</div>
      <label>Notes</label><textarea value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/>
      <div className="actions"><button className="secondary" onClick={()=>setOpen(false)}>Cancel</button><button className="primary small-btn" onClick={save}>Save student</button></div>
    </Modal>}
  </div>;
}

function Groups({ role }: { role: Role }) {
  const [rows,setRows]=useState<Group[]>([]); const [open,setOpen]=useState(false); const [editing,setEditing]=useState<Group|null>(null);
  const [name,setName]=useState(""); const [level,setLevel]=useState(""); const [description,setDescription]=useState("");
  async function load(){const {data}=await supabase.from("groups").select("*").eq("is_active",true).order("name");setRows((data??[]) as Group[])}
  useEffect(()=>{load()},[]);
  function create(){setEditing(null);setName("");setLevel("");setDescription("");setOpen(true)}
  function edit(g:Group){setEditing(g);setName(g.name);setLevel(g.level??"");setDescription(g.description??"");setOpen(true)}
  async function save(){const p={name:name.trim(),level:level||null,description:description||null};const r=editing?await supabase.from("groups").update(p).eq("id",editing.id):await supabase.from("groups").insert(p);if(r.error)alert(r.error.message);else{setOpen(false);load()}}
  if(role!=="admin") return <section className="panel empty"><p>Groups are managed by the administrator.</p></section>;
  return <div className="stack"><div className="toolbar"><span>Dynamic groups — no names are hardcoded.</span><button className="secondary" onClick={create}><Plus size={16}/> Add group</button></div><section className="list">{rows.map(g=><article className="card" key={g.id}><div><b>{g.name}</b><span>{g.level||"No level"}</span><span>{g.description||""}</span></div><button className="secondary compact" onClick={()=>edit(g)}>Edit</button></article>)}</section>
  {open&&<Modal title={editing?"Edit group":"Add group"} close={()=>setOpen(false)}><Field label="Group name" value={name} set={setName}/><Field label="Level" value={level} set={setLevel}/><label>Description</label><textarea value={description} onChange={e=>setDescription(e.target.value)}/><div className="actions"><button className="secondary" onClick={()=>setOpen(false)}>Cancel</button><button className="primary small-btn" onClick={save}>Save group</button></div></Modal>}</div>;
}

function Attendance() {
  const [groups,setGroups]=useState<Group[]>([]); const [groupId,setGroupId]=useState(""); const [date,setDate]=useState(new Date().toISOString().slice(0,10));
  const [students,setStudents]=useState<Student[]>([]); const [values,setValues]=useState<Record<string,AttendanceStatus>>({});
  const [error,setError]=useState("");
  useEffect(()=>{supabase.from("groups").select("*").eq("is_active",true).order("name").then(({data})=>setGroups((data??[]) as Group[]))},[]);
  async function load(){
    if(!groupId)return;
    const {data:m}=await supabase.from("group_students").select("student_id").eq("group_id",groupId).eq("is_active",true);
    const ids=(m??[]).map((x:any)=>x.student_id);
    if(!ids.length){setStudents([]);return}
    const {data:s}=await supabase.from("students").select("*").in("id",ids).eq("is_active",true).order("last_name");
    setStudents((s??[]) as Student[]);
    const {data:a}=await supabase.from("attendance").select("student_id,status").eq("group_id",groupId).eq("attendance_date",date);
    const map:Record<string,AttendanceStatus>={};(a??[]).forEach((x:any)=>map[x.student_id]=x.status);setValues(map);
  }
  useEffect(()=>{load()},[groupId,date]);
  async function setStatus(student_id:string,status:AttendanceStatus){
    setValues(v=>({...v,[student_id]:status}));
    const r=await supabase.from("attendance").upsert({student_id,group_id:groupId,attendance_date:date,status}, {onConflict:"student_id,group_id,attendance_date"});
    if(r.error)setError(r.error.message);
  }
  if(!groups.length)return <section className="panel empty"><p>Create a group first.</p></section>;
  return <div className="stack"><div className="filters"><select value={groupId} onChange={e=>setGroupId(e.target.value)}><option value="">Choose group</option>{groups.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}</select><input type="date" value={date} onChange={e=>setDate(e.target.value)}/></div>{error&&<div className="alert">{error}</div>}<section className="list">{students.map(s=><article className="attendance" key={s.id}><b>{s.first_name} {s.last_name}</b><div className="attendance-actions">{(["present","absent","sick"] as AttendanceStatus[]).map(status=><button className={values[s.id]===status?`att ${status} selected`:"att"} key={status} onClick={()=>setStatus(s.id,status)}>{status[0].toUpperCase()+status.slice(1)}</button>)}</div></article>)}{groupId&&!students.length&&<div className="empty">No students in this group.</div>}</section><p className="muted small">Attendance statuses are only Present, Absent and Sick.</p></div>;
}

function Payments({ role }: { role: Role }) {
  const [charges,setCharges]=useState<Charge[]>([]); const [error,setError]=useState("");
  async function load(){let q=supabase.from("monthly_charges").select("*,students(first_name,last_name),groups(name)").order("due_date",{ascending:false});const {data,error}=await q;if(error)setError(error.message);setCharges((data??[]) as Charge[])}
  useEffect(()=>{load()},[]);
  async function record(c:Charge){
    const amount=prompt(`Payment amount (remaining ${money(Number(c.amount_due)-Number(c.amount_paid))})`);
    const n=Number(amount);if(!Number.isFinite(n)||n<=0)return;
    const method=prompt("Method: cash, bank_transfer or stripe","cash") as any;
    if(!["cash","bank_transfer","stripe"].includes(method))return;
    const {error}=await supabase.rpc("record_payment",{p_monthly_charge_id:c.id,p_amount:n,p_method:method});
    if(error)setError(error.message);else load();
  }
  return <div className="stack">{error&&<div className="alert">{error}</div>}<section className="list">{charges.map(c=>{const left=Number(c.amount_due)-Number(c.amount_paid);return <article className="card" key={c.id}><div><b>{c.students?`${c.students.first_name} ${c.students.last_name}`:"Student"}</b><span>{c.groups?.name||"Studio"} · Due {c.due_date}</span><span>{money(Number(c.amount_paid))} paid · {money(left)} left</span></div><div className="pay-right"><b>{money(Number(c.amount_due))}</b><span className={`pill ${c.status}`}>{c.status.replace("_"," ")}</span>{left>0&&<button className="secondary compact" onClick={()=>record(c)}>Record payment</button>}</div></article>})}{!charges.length&&<div className="empty">No monthly charges yet.</div>}</section>{role==="teacher"&&<p className="muted small">Teacher access is limited by database RLS to assigned students.</p>}</div>;
}

function Teachers({ role }: { role: Role }) {
  const [rows,setRows]=useState<any[]>([]); const [groups,setGroups]=useState<Group[]>([]); const [open,setOpen]=useState<any>(null); const [selected,setSelected]=useState<string[]>([]);
  const [first,setFirst]=useState("");const [last,setLast]=useState("");const [email,setEmail]=useState("");const [invite,setInvite]=useState(false);
  async function load(){const [t,g,a]=await Promise.all([supabase.from("teachers").select("id,profiles(first_name,last_name,email)").eq("is_active",true),supabase.from("groups").select("*").eq("is_active",true).order("name"),supabase.from("group_teachers").select("teacher_id,group_id")]);setRows(t.data??[]);setGroups((g.data??[]) as Group[]);const map:Record<string,string[]>={};(a.data??[]).forEach((x:any)=>map[x.teacher_id]=[...(map[x.teacher_id]??[]),x.group_id]);setOpen((o:any)=>o?{...o,map}:o)}
  useEffect(()=>{load()},[]);
  async function send(){const {error}=await supabase.functions.invoke("invite-teacher",{body:{first_name:first,last_name:last,email}});if(error)alert(error.message);else{setInvite(false);setFirst("");setLast("");setEmail("");load()}}
  async function save(){if(!open)return;await supabase.from("group_teachers").delete().eq("teacher_id",open.id);if(selected.length)await supabase.from("group_teachers").insert(selected.map((group_id,i)=>({teacher_id:open.id,group_id,is_primary:i===0})));setOpen(null);load()}
  if(role!=="admin")return <section className="panel empty"><p>Teacher accounts are managed by the administrator.</p></section>;
  return <div className="stack"><div className="toolbar"><span>Invite teachers and assign only their groups.</span><button className="secondary" onClick={()=>setInvite(true)}><Plus size={16}/> Add teacher</button></div><section className="list">{rows.map(t=><article className="card" key={t.id}><div><b>{t.profiles?.first_name} {t.profiles?.last_name}</b><span>{t.profiles?.email}</span></div><button className="secondary compact" onClick={async()=>{const {data}=await supabase.from("group_teachers").select("group_id").eq("teacher_id",t.id);setSelected((data??[]).map((x:any)=>x.group_id));setOpen(t)}}>Assign groups</button></article>)}</section>
  {invite&&<Modal title="Invite teacher" close={()=>setInvite(false)}><Field label="First name" value={first} set={setFirst}/><Field label="Last name" value={last} set={setLast}/><Field label="Email" value={email} set={setEmail}/><div className="actions"><button className="secondary" onClick={()=>setInvite(false)}>Cancel</button><button className="primary small-btn" onClick={send}>Send invitation</button></div></Modal>}
  {open&&<Modal title={`${open.profiles?.first_name} ${open.profiles?.last_name}`} close={()=>setOpen(null)}><p>Select groups for this teacher.</p><div className="checks">{groups.map(g=><label className="check" key={g.id}><input type="checkbox" checked={selected.includes(g.id)} onChange={()=>setSelected(x=>x.includes(g.id)?x.filter(id=>id!==g.id):[...x,g.id])}/>{g.name}</label>)}</div><div className="actions"><button className="secondary" onClick={()=>setOpen(null)}>Cancel</button><button className="primary small-btn" onClick={save}>Save assignments</button></div></Modal>}</div>;
}

function SettingsPage({ role }: { role: Role }) {
  const [prices,setPrices]=useState<Price[]>([]);const [open,setOpen]=useState(false);const [name,setName]=useState("");const [amount,setAmount]=useState("");
  async function load(){const {data}=await supabase.from("prices").select("*").eq("is_active",true).order("amount");setPrices((data??[]) as Price[])}
  useEffect(()=>{load()},[]);
  if(role!=="admin")return <section className="panel empty"><p>Settings are available to administrators only.</p></section>;
  async function save(){const n=Number(amount);if(!name||!Number.isFinite(n)||n<0)return;const {error}=await supabase.from("prices").insert({name,amount:n,currency:"EUR",billing_period:"monthly"});if(error)alert(error.message);else{setOpen(false);setName("");setAmount("");load()}}
  return <div className="stack"><section className="panel"><div className="panel-head"><div><div className="eyebrow">PRICING</div><h2>Studio prices</h2></div><button className="secondary" onClick={()=>setOpen(true)}><Plus size={16}/> Add price</button></div><div className="list">{prices.map(p=><article className="card" key={p.id}><div><b>{p.name}</b><span>Monthly · EUR</span></div><b>{money(Number(p.amount))}</b></article>)}</div></section>{open&&<Modal title="Add price" close={()=>setOpen(false)}><Field label="Price name" value={name} set={setName}/><Field label="Monthly amount (€)" value={amount} set={setAmount} type="number"/><div className="actions"><button className="secondary" onClick={()=>setOpen(false)}>Cancel</button><button className="primary small-btn" onClick={save}>Save price</button></div></Modal>}</div>;
}

function Field({label,value,set,type="text"}:{label:string,value:string,set:(v:string)=>void,type?:string}) {
  return <div><label>{label}</label><input type={type} value={value} onChange={e=>set(e.target.value)}/></div>;
}
function Modal({title,close,children}:{title:string,close:()=>void,children:any}) {
  return <div className="backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)close()}}><section className="modal"><div className="modal-head"><h2>{title}</h2><button className="round" onClick={close}><X size={17}/></button></div>{children}</section></div>;
}
export default App;
