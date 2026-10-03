import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { supabase } from "./lib/supabase";

type Props = { seasonId: string; onSeasonCreated: (id: string) => void };
type Option = { id: string; name: string };

export default function SeasonManagement({ seasonId, onSeasonCreated }: Props) {
  const [seasons, setSeasons] = useState<Array<Option & { is_active: boolean }>>([]);
  const [groups, setGroups] = useState<Option[]>([]);
  const [students, setStudents] = useState<Option[]>([]);
  const [teachers, setTeachers] = useState<Option[]>([]);
  const [configs, setConfigs] = useState<Array<Option & { group_id: string }>>([]);
  const [message, setMessage] = useState("");
  const [period, setPeriod] = useState({ name: "", period_type: "regular", starts_on: "", ends_on: "" });
  const [group, setGroup] = useState({ group_id: "", name: "", category: "", age_min: "", age_max: "" });
  const [enrollment, setEnrollment] = useState({ season_group_id: "", student_id: "" });
  const [teacher, setTeacher] = useState({ season_group_id: "", teacher_id: "" });
  const [schedule, setSchedule] = useState({ season_group_id: "", weekday: "1", starts_at: "", ends_at: "", location: "" });
  const [price, setPrice] = useState({ name: "", amount: "", currency: "EUR", billing_period: "monthly" });
  const [assignment, setAssignment] = useState({ season_group_id: "", season_price_id: "", student_id: "", valid_from: "" });
  const [prices, setPrices] = useState<Option[]>([]);

  async function load() {
    const [s, g, st, t, sg, p] = await Promise.all([
      supabase.from("seasons").select("id,name,is_active").order("starts_on", { ascending: false, nullsFirst: false }),
      supabase.from("groups").select("id,name").eq("is_active", true).order("name"),
      supabase.from("students").select("id,first_name,last_name").eq("is_active", true).order("last_name"),
      supabase.from("teachers").select("id,profiles(first_name,last_name)").eq("is_active", true),
      supabase.from("season_groups").select("id,name,group_id").eq("season_id", seasonId).eq("is_active", true).order("name"),
      supabase.from("season_prices").select("id,name").eq("season_id", seasonId).eq("is_active", true).order("name"),
    ]);
    const error = s.error || g.error || st.error || t.error || sg.error || p.error;
    if (error) setMessage(error.message);
    setSeasons((s.data ?? []) as Array<Option & { is_active: boolean }>);
    setGroups((g.data ?? []) as Option[]);
    setStudents((st.data ?? []).map((x: any) => ({ id: x.id, name: `${x.first_name} ${x.last_name}` })));
    setTeachers((t.data ?? []).map((x: any) => ({ id: x.id, name: `${x.profiles?.first_name ?? ""} ${x.profiles?.last_name ?? ""}`.trim() })));
    setConfigs((sg.data ?? []) as Array<Option & { group_id: string }>);
    setPrices((p.data ?? []) as Option[]);
  }
  useEffect(() => { load(); }, [seasonId]);

  async function save(query: PromiseLike<{ error: { message: string } | null }>, after?: () => void) {
    const { error } = await query;
    if (error) setMessage(error.message);
    else { setMessage(""); after?.(); await load(); }
  }

  async function createSeason() {
    if (!period.name.trim()) return;
    const { data, error } = await supabase.from("seasons").insert({ ...period, name: period.name.trim(), starts_on: period.starts_on || null, ends_on: period.ends_on || null }).select("id").single();
    if (error) setMessage(error.message);
    else if (data) { setMessage(""); onSeasonCreated(data.id); setPeriod({ name: "", period_type: "regular", starts_on: "", ends_on: "" }); await load(); }
  }
  async function saveGroup() {
    if (!seasonId || !group.group_id) return;
    const existing = configs.find((x) => x.group_id === group.group_id);
    const payload = { season_id: seasonId, group_id: group.group_id, name: group.name.trim() || groups.find((x) => x.id === group.group_id)?.name || "", category: group.category || null, age_min: group.age_min ? Number(group.age_min) : null, age_max: group.age_max ? Number(group.age_max) : null, is_active: true };
    await save(existing
      ? supabase.from("season_groups").update(payload).eq("id", existing.id)
      : supabase.from("season_groups").insert(payload));
  }
  async function addEnrollment() {
    const config = configs.find((x) => x.id === enrollment.season_group_id);
    if (!config || !enrollment.student_id) return;
    await save(supabase.from("season_enrollments").upsert({ season_id: seasonId, season_group_id: config.id, student_id: enrollment.student_id, is_active: true }, { onConflict: "season_id,season_group_id,student_id" }));
  }
  async function assignTeacher() {
    if (!teacher.season_group_id || !teacher.teacher_id) return;
    await save(supabase.from("season_group_teachers").upsert({ season_group_id: teacher.season_group_id, teacher_id: teacher.teacher_id, is_primary: false }, { onConflict: "season_group_id,teacher_id" }));
  }
  async function addSchedule() {
    if (!schedule.season_group_id || !schedule.starts_at || !schedule.ends_at) return;
    await save(supabase.from("season_group_schedules").insert({ ...schedule, weekday: Number(schedule.weekday), location: schedule.location || null }));
  }
  async function addPrice() {
    if (!seasonId || !price.name.trim() || !Number.isFinite(Number(price.amount))) return;
    await save(supabase.from("season_prices").insert({ ...price, name: price.name.trim(), amount: Number(price.amount) }).select("id").single(),
      () => setPrice({ name: "", amount: "", currency: "EUR", billing_period: "monthly" }));
  }
  async function assignPrice() {
    if (!assignment.season_group_id || !assignment.season_price_id || !assignment.valid_from) return;
    await save(supabase.from("season_price_assignments").insert({ season_id: seasonId, ...assignment, student_id: assignment.student_id || null }));
  }
  async function toggleSeason(season: Option & { is_active: boolean }) {
    const { error } = await supabase.from("seasons").update({ is_active: !season.is_active }).eq("id", season.id);
    if (error) setMessage(error.message);
    else { setMessage(""); if (season.is_active && season.id === seasonId) onSeasonCreated(""); await load(); }
  }

  const select = (value: string, set: (v: string) => void, options: Option[], label: string) => <label>{label}<select value={value} onChange={(e) => set(e.target.value)}><option value="">—</option>{options.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>;
  const saveButton = (fn: () => void, label: string) => <button className="secondary compact" onClick={fn}><Plus size={14}/>{label}</button>;

  return <div className="stack">
    {message && <div className="alert">{message}</div>}
    <section className="panel"><div className="panel-head"><div><div className="eyebrow">Periods</div><h2>Create an activity period</h2></div></div>
      <div className="form-grid"><label>Name<input value={period.name} onChange={(e) => setPeriod({ ...period, name: e.target.value })}/></label><label>Type<input value={period.period_type} onChange={(e) => setPeriod({ ...period, period_type: e.target.value })}/></label><label>Starts<input type="date" value={period.starts_on} onChange={(e) => setPeriod({ ...period, starts_on: e.target.value })}/></label><label>Ends<input type="date" value={period.ends_on} onChange={(e) => setPeriod({ ...period, ends_on: e.target.value })}/></label></div>
      <p className="muted small">Dates are optional and configurable. Periods do not restrict other studio activities.</p>{saveButton(createSeason, "Create period")}</section>
    {seasonId ? <>
      <section className="panel"><div className="panel-head"><div><div className="eyebrow">Groups</div><h2>Configure a group for this period</h2></div></div><div className="form-grid">{select(group.group_id, (v) => setGroup({ ...group, group_id: v }), groups, "Logical group")}<label>Display name<input value={group.name} onChange={(e) => setGroup({ ...group, name: e.target.value })}/></label><label>Category<input value={group.category} onChange={(e) => setGroup({ ...group, category: e.target.value })}/></label><label>Minimum age<input type="number" value={group.age_min} onChange={(e) => setGroup({ ...group, age_min: e.target.value })}/></label><label>Maximum age<input type="number" value={group.age_max} onChange={(e) => setGroup({ ...group, age_max: e.target.value })}/></label></div>{saveButton(saveGroup, "Save group configuration")}</section>
      <section className="panel"><div className="panel-head"><div><div className="eyebrow">Enrollment and teaching</div><h2>Assign students and teachers</h2></div></div><div className="form-grid">{select(enrollment.season_group_id, (v) => setEnrollment({ ...enrollment, season_group_id: v }), configs, "Configured group")}{select(enrollment.student_id, (v) => setEnrollment({ ...enrollment, student_id: v }), students, "Student")}{saveButton(addEnrollment, "Enroll student")}{select(teacher.season_group_id, (v) => setTeacher({ ...teacher, season_group_id: v }), configs, "Configured group")}{select(teacher.teacher_id, (v) => setTeacher({ ...teacher, teacher_id: v }), teachers, "Teacher")}{saveButton(assignTeacher, "Assign teacher")}</div></section>
      <section className="panel"><div className="panel-head"><div><div className="eyebrow">Schedule</div><h2>Add a schedule slot</h2></div></div><div className="form-grid">{select(schedule.season_group_id, (v) => setSchedule({ ...schedule, season_group_id: v }), configs, "Configured group")}<label>Weekday (1 Monday – 7 Sunday)<input type="number" min="1" max="7" value={schedule.weekday} onChange={(e) => setSchedule({ ...schedule, weekday: e.target.value })}/></label><label>Starts<input type="time" value={schedule.starts_at} onChange={(e) => setSchedule({ ...schedule, starts_at: e.target.value })}/></label><label>Ends<input type="time" value={schedule.ends_at} onChange={(e) => setSchedule({ ...schedule, ends_at: e.target.value })}/></label><label>Location<input value={schedule.location} onChange={(e) => setSchedule({ ...schedule, location: e.target.value })}/></label></div>{saveButton(addSchedule, "Add schedule")}</section>
      <section className="panel"><div className="panel-head"><div><div className="eyebrow">Season prices</div><h2>Add immutable price snapshots</h2></div></div><div className="form-grid"><label>Name<input value={price.name} onChange={(e) => setPrice({ ...price, name: e.target.value })}/></label><label>Amount<input type="number" min="0" step="0.01" value={price.amount} onChange={(e) => setPrice({ ...price, amount: e.target.value })}/></label><label>Currency<input value={price.currency} onChange={(e) => setPrice({ ...price, currency: e.target.value })}/></label><label>Billing period<input value={price.billing_period} onChange={(e) => setPrice({ ...price, billing_period: e.target.value })}/></label></div>{saveButton(addPrice, "Add price snapshot")}<div className="form-grid">{select(assignment.season_group_id, (v) => setAssignment({ ...assignment, season_group_id: v }), configs, "Configured group")}{select(assignment.season_price_id, (v) => setAssignment({ ...assignment, season_price_id: v }), prices, "Price snapshot")}{select(assignment.student_id, (v) => setAssignment({ ...assignment, student_id: v }), students, "Student override (optional)")}<label>Effective from<input type="date" value={assignment.valid_from} onChange={(e) => setAssignment({ ...assignment, valid_from: e.target.value })}/></label></div><p className="muted small">Leave the student blank for a group default. A price change should use a new snapshot and a new effective assignment.</p>{saveButton(assignPrice, "Assign price")}</section>
    </> : <section className="panel empty"><p>Select an activity period above to configure its groups, enrollments, teachers, schedules and prices.</p></section>}
    <section className="panel"><div className="eyebrow">Available periods</div><div className="list">{seasons.map((x) => <article className="card" key={x.id}><div><b>{x.name}</b><span>{x.is_active ? "Available" : "Archived"}</span></div><button className="secondary compact" onClick={() => toggleSeason(x)}>{x.is_active ? "Archive period" : "Make available"}</button></article>)}</div></section>
  </div>;
}
