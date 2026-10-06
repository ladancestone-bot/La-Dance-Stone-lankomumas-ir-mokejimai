import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function sha256(value: string) {
  const data = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function sb(path: string, init: RequestInit = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${body.slice(0, 800)}`);
  return body ? JSON.parse(body) : null;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const clean = (v: unknown) => String(v ?? "").trim();
const norm = (v: unknown) => clean(v).toLocaleLowerCase("lt-LT").normalize("NFD").replace(/[\u0300-\u036f]/g, "");

function splitName(fullName: string) {
  const parts = clean(fullName).split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return { first_name: parts[0] ?? "", last_name: "" };
  return { first_name: parts.slice(0, -1).join(" "), last_name: parts[parts.length - 1] };
}

function parseAmount(value: unknown): number | null {
  const s = clean(value).replace(",", ".");
  const m = s.match(/-?\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : null;
}

function parseIsoDate(value: unknown): string | null {
  const s = clean(value);
  const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  return m ? `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}` : null;
}

function parseIsoDateTime(value: unknown): string | null {
  const s = clean(value);
  const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})[ T](\d{1,2}):(\d{2})/);
  if (!m) return null;
  const month = Number(m[2]), day = Number(m[3]), hour = Number(m[4]), minute = Number(m[5]);
  const offset = month >= 4 && month <= 10 ? "+03:00" : "+02:00";
  return new Date(`${m[1]}-${String(month).padStart(2,"0")}-${String(day).padStart(2,"0")}T${String(hour).padStart(2,"0")}:${minute}:00${offset}`).toISOString();
}

function parseLithuanianLessonDate(value: unknown, fallbackYear: number) {
  const s = norm(value);
  const m = s.match(/(sausio|vasario|kovo|balandzio|geguzes|birzelio|liepos|rugpjucio|rugsejo|spalio|lapkricio|gruodzio)\s+(\d{1,2})\s*d/);
  if (!m) return null;
  const months: Record<string, number> = {
    sausio: 1, vasario: 2, kovo: 3, balandzio: 4, geguzes: 5, birzelio: 6,
    liepos: 7, rugpjucio: 8, rugsejo: 9, spalio: 10, lapkricio: 11, gruodzio: 12,
  };
  const month = months[m[1]], day = Number(m[2]);
  const d = new Date(Date.UTC(fallbackYear, month - 1, day));
  return d.getUTCMonth() === month - 1 && d.getUTCDate() === day
    ? `${fallbackYear}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
    : null;
}

function parseTime(value: unknown) {
  const m = clean(value).match(/(\d{1,2}):(\d{2})/);
  return m ? `${m[1].padStart(2, "0")}:${m[2]}:00` : null;
}

function parseTimeRange(value: unknown) {
  const matches = [...clean(value).matchAll(/(\d{1,2}):(\d{2})/g)];
  if (!matches.length) return { start: null, end: null };
  const start = `${matches[0][1].padStart(2, "0")}:${matches[0][2]}:00`;
  const end = matches[1] ? `${matches[1][1].padStart(2, "0")}:${matches[1][2]}:00` : null;
  return { start, end };
}

function groupNameFromLesson(lesson: string) {
  const n = norm(lesson);
  if (n.includes("5-6m") || n.includes("5–6m") || n.includes("5-6 m"))
    return "Grupė 5-6m — Antradienis / Ketvirtadienis";
  if (n.includes("7-12m") || n.includes("7–12m") || n.includes("7-12 m"))
    return (n.includes("pirmadienis") || n.includes("treciadienis"))
      ? "Grupė 7-12m — Pirmadienis / Trečiadienis"
      : "Grupė 7-12m — Antradienis / Ketvirtadienis";
  if (n.includes("13-18m") || n.includes("13–18m") || n.includes("13-18 m"))
    return (n.includes("pirmadienis") || n.includes("treciadienis"))
      ? "Grupė 13-18m — Pirmadienis / Trečiadienis"
      : "Grupė 13-18m — Antradienis / Ketvirtadienis";
  if (n.includes("suaugusi"))
    return n.includes("sekmadienis")
      ? "Suaugusieji — Sekmadienis 19:00"
      : "Suaugusieji — Pirmadienis / Trečiadienis 19:15";
  return null;
}

function paymentIsPaid(value: unknown) {
  return ["taip", "yra", "apmoketa", "apmoketas", "paid", "yes"].includes(norm(value));
}

function rentalTypeFromPurpose(value: unknown) {
  const n = norm(value);
  return n.includes("ilgalaik") || n.includes("long") ? "long_term" : "short_term";
}

async function findOrCreateStudent(row: any) {
  const { first_name, last_name } = splitName(row.name);
  const email = clean(row.email) || null;
  const phone = clean(row.phone) || null;
  const students = await sb("students?select=id,first_name,last_name,email,phone&is_active=eq.true");

  let student = email
    ? students.find((s: any) => norm(s.email) === norm(email))
    : null;

  if (!student && phone) student = students.find((s: any) => clean(s.phone) === phone);
  if (!student) {
    const matches = students.filter((s: any) => norm(s.first_name) === norm(first_name) && norm(s.last_name) === norm(last_name));
    if (matches.length === 1) student = matches[0];
  }

  const patch: Record<string, unknown> = { first_name, last_name, updated_at: new Date().toISOString() };
  if (email) patch.email = email;
  if (phone) patch.phone = phone;

  if (student) {
    await sb(`students?id=eq.${student.id}`, {
      method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify(patch),
    });
    return student.id;
  }

  const inserted = await sb("students", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ ...patch, registration_date: new Date().toISOString().slice(0, 10), is_active: true }),
  });
  return inserted[0].id;
}

async function syncLessonBooking(row: any) {
  const sourceSheet = clean(row.source_sheet);
  const sourceRow = Number(row.source_row);
  const name = clean(row.name);
  const existing = await sb(`drop_in_bookings?select=id&source=eq.website&source_sheet=eq.${encodeURIComponent(sourceSheet)}&source_row=eq.${sourceRow}&limit=1`);

  const studentId = await findOrCreateStudent(row);
  const year = parseIsoDate(row.date) ? Number(parseIsoDate(row.date)!.slice(0, 4)) : new Date().getUTCFullYear();
  const lessonDate = parseLithuanianLessonDate(row.lesson, year);
  const startTime = parseTime(row.lesson);

  if (!lessonDate || !startTime)
    return { status: "needs_review", source_row: sourceRow, name, reason: "Nepavyko nustatyti datos arba laiko" };

  const groupName = groupNameFromLesson(clean(row.lesson));
  if (!groupName)
    return { status: "needs_review", source_row: sourceRow, name, reason: "Nepavyko nustatyti grupės" };

  const groups = await sb(`groups?select=id,name&name=eq.${encodeURIComponent(groupName)}&limit=1`);
  if (!groups?.length)
    return { status: "needs_review", source_row: sourceRow, name, reason: `Grupė nerasta: ${groupName}` };

  const groupId = groups[0].id;
  const lessons = await sb(`drop_in_lessons?select=id&group_id=eq.${groupId}&lesson_date=eq.${lessonDate}&start_time=eq.${startTime}&limit=1`);

  let lessonId = lessons?.[0]?.id;

  if (!lessonId) {
    const insertedLesson = await sb("drop_in_lessons", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        group_id: groupId, lesson_date: lessonDate, start_time: startTime, end_time: null,
        price: 10, capacity: null, notes: "Sukurta iš Google Sheets „Viena pamoka“.", is_active: true,
      }),
    });
    lessonId = insertedLesson[0].id;
  }

  const person = splitName(name);
  const payload = {
    lesson_id: lessonId, student_id: studentId, first_name: person.first_name, last_name: person.last_name,
    email: clean(row.email) || null, phone: clean(row.phone) || null,
    status: paymentIsPaid(row.payment) ? "paid" : "pending",
    payment_method: null, source: "website", source_sheet: sourceSheet, source_row: sourceRow,
    updated_at: new Date().toISOString(),
  };

  if (existing?.length) {
    await sb(`drop_in_bookings?id=eq.${existing[0].id}`, {
      method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify(payload),
    });
    return { status: "updated", source_row: sourceRow, booking_id: existing[0].id, name };
  }

  const inserted = await sb("drop_in_bookings", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ ...payload, created_at: new Date().toISOString() }),
  });
  return { status: "created", source_row: sourceRow, booking_id: inserted[0].id, name };
}

function rentalHours(start: Date, end: Date, durationValue: unknown) {
  const duration = parseAmount(durationValue);
  if (duration && duration > 0) return duration;
  return Math.max(0.5, Math.round(((end.getTime() - start.getTime()) / 3600000) * 100) / 100);
}

async function syncRental(row: any) {
  const sourceSheet = clean(row.source_sheet);
  const sourceRow = Number(row.source_row);
  const name = clean(row.name);
  const submittedDate = parseIsoDate(row.date);
  const year = submittedDate ? Number(submittedDate.slice(0, 4)) : new Date().getUTCFullYear();
  const m = norm(row.day).match(/(sausio|vasario|kovo|balandzio|geguzes|birzelio|liepos|rugpjucio|rugsejo|spalio|lapkricio|gruodzio)\s+(\d{1,2})\s*d/);

  if (!m) return { status: "needs_review", source_row: sourceRow, name, reason: "Nepavyko nustatyti nuomos datos" };

  const months: Record<string, number> = {
    sausio: 1, vasario: 2, kovo: 3, balandzio: 4, geguzes: 5, birzelio: 6,
    liepos: 7, rugpjucio: 8, rugsejo: 9, spalio: 10, lapkricio: 11, gruodzio: 12,
  };
  const rentalDate = `${year}-${String(months[m[1]]).padStart(2, "0")}-${String(Number(m[2])).padStart(2, "0")}`;
  const range = parseTimeRange(row.time);
  if (!range.start) return { status: "needs_review", source_row: sourceRow, name, reason: "Nepavyko nustatyti nuomos laiko" };

  const start = new Date(`${rentalDate}T${range.start}Z`);
  let end = range.end ? new Date(`${rentalDate}T${range.end}Z`) : new Date(start.getTime() + 3600000);
  if (end <= start) end = new Date(end.getTime() + 86400000);

  const hours = rentalHours(start, end, row.duration);
  const price = Math.round(hours * 20 * 100) / 100;

  // Match the exact Sheets row first. If an older import used another source value,
  // reuse the existing rental by customer + exact start/end instead of creating a duplicate.
  const sourceMatches = await sb(`studio_rentals?select=id&source=eq.google_sheets&source_sheet=eq.${encodeURIComponent(sourceSheet)}&source_row=eq.${sourceRow}&limit=1`);
  let existing = sourceMatches;
  if (!existing?.length) {
    existing = await sb(`studio_rentals?select=id&customer_name=ilike.${encodeURIComponent(name)}&starts_at=eq.${encodeURIComponent(start.toISOString())}&ends_at=eq.${encodeURIComponent(end.toISOString())}&is_active=eq.true&limit=1`);
  }

  const payload = {
    customer_name: name || "Nežinomas klientas",
    customer_email: clean(row.email) || null,
    customer_phone: clean(row.phone) || null,
    rental_type: rentalTypeFromPurpose(row.purpose),
    starts_at: start.toISOString(), ends_at: end.toISOString(),
    reserved_at: parseIsoDateTime(row.date),
    price,
    payment_status: paymentIsPaid(row.payment) ? "paid" : "pending",
    payment_method: null, is_active: true, source: "google_sheets",
    source_sheet: sourceSheet, source_row: sourceRow,
    notes: clean(row.duration) ? `Trukmė: ${clean(row.duration)} · 20 €/val.` : "20 €/val.",
    updated_at: new Date().toISOString(),
  };

  if (existing?.length) {
    await sb(`studio_rentals?id=eq.${existing[0].id}`, {
      method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify(payload),
    });
    return { status: "updated", source_row: sourceRow, rental_id: existing[0].id, name, hours, price };
  }

  const inserted = await sb("studio_rentals", {
    method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(payload),
  });
  return { status: "created", source_row: sourceRow, rental_id: inserted[0].id, name, hours, price };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  try {
    const body = await req.json();
    const token = clean(body?.token ?? req.headers.get("x-google-sheets-sync-token"));
    if (!token) return json({ error: "Missing sync token" }, 401);

    const tokenHash = await sha256(token);
    const tokens = await sb(`website_import_tokens?select=id&token_hash=eq.${tokenHash}&is_active=eq.true&limit=1`);
    if (!tokens?.length) return json({ error: "Invalid sync token" }, 401);

    const reservations = Array.isArray(body?.reservations) ? body.reservations : [];
    const rentals = Array.isArray(body?.rentals) ? body.rentals : [];

    const result = {
      ok: true, reservations_received: reservations.length, rentals_received: rentals.length,
      reservations_created: 0, reservations_updated: 0, rentals_created: 0, rentals_updated: 0,
      needs_review: 0, review_items: [] as unknown[], errors: [] as unknown[],
    };

    for (const row of reservations) {
      try {
        const r = await syncLessonBooking(row);
        if (r.status === "created") result.reservations_created++;
        else if (r.status === "updated") result.reservations_updated++;
        else {
          result.needs_review++;
          result.review_items.push({ type: "reservation", source_row: row?.source_row, name: row?.name, reason: r.reason });
        }
      } catch (e) {
        result.errors.push({ type: "reservation", source_row: row?.source_row, error: e instanceof Error ? e.message : String(e) });
      }
    }

    for (const row of rentals) {
      try {
        const r = await syncRental(row);
        if (r.status === "created") result.rentals_created++;
        else if (r.status === "updated") result.rentals_updated++;
        else {
          result.needs_review++;
          result.review_items.push({ type: "rental", source_row: row?.source_row, name: row?.name, reason: r.reason });
        }
      } catch (e) {
        result.errors.push({ type: "rental", source_row: row?.source_row, error: e instanceof Error ? e.message : String(e) });
      }
    }

    await sb(`website_import_tokens?id=eq.${tokens[0].id}`, {
      method: "PATCH", headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ last_used_at: new Date().toISOString() }),
    });

    return json(result);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});