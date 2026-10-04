/**
 * LA DANCE STONE — READ-ONLY GOOGLE SHEETS BRIDGE
 *
 * RUN IN A SEPARATE STANDALONE GOOGLE APPS SCRIPT PROJECT.
 * The original registration Sheet is NEVER modified.
 *
 * One-time setup:
 * 1. Paste this file into script.google.com.
 * 2. Run setLdsImportConfiguration().
 * 3. Enter the source Google Sheet ID, exact tab name, and private LDS token.
 * 4. Run syncLdsRegistrations() once.
 * 5. Run createHourlyTrigger().
 */

const LDS_IMPORT_URL =
  'https://tqzabmlrtbrylibafjfh.supabase.co/functions/v1/website-order-import';

function setLdsImportConfiguration() {
  const ui = SpreadsheetApp.getUi();
  const id = ui.prompt('LDS importas', 'Google Sheet ID:', ui.ButtonSet.OK_CANCEL);
  if (id.getSelectedButton() !== ui.Button.OK) return;
  const tab = ui.prompt('LDS importas', 'Tikslus lapo (tab) pavadinimas:', ui.ButtonSet.OK_CANCEL);
  if (tab.getSelectedButton() !== ui.Button.OK) return;
  const token = ui.prompt('LDS importas', 'Privatus LDS importo raktas:', ui.ButtonSet.OK_CANCEL);
  if (token.getSelectedButton() !== ui.Button.OK) return;

  PropertiesService.getScriptProperties().setProperties({
    SOURCE_SPREADSHEET_ID: id.getResponseText().trim(),
    SOURCE_SHEET_NAME: tab.getResponseText().trim(),
    LDS_IMPORT_TOKEN: token.getResponseText().trim()
  });
  ui.alert('Paruošta. Paleisk syncLdsRegistrations().');
}

function syncLdsRegistrations() {
  const p = PropertiesService.getScriptProperties();
  const spreadsheetId = p.getProperty('SOURCE_SPREADSHEET_ID');
  const sheetName = p.getProperty('SOURCE_SHEET_NAME');
  const token = p.getProperty('LDS_IMPORT_TOKEN');
  if (!spreadsheetId || !sheetName || !token) {
    throw new Error('Pirmiausia paleisk setLdsImportConfiguration().');
  }

  // READ ONLY: getDisplayValues() only. No write/delete/clear operations.
  const sheet = SpreadsheetApp.openById(spreadsheetId).getSheetByName(sheetName);
  if (!sheet) throw new Error('Source sheet not found: ' + sheetName);

  const values = sheet.getDataRange().getDisplayValues();
  if (values.length < 2) return { received: 0, processed: 0, needsReview: 0 };

  const headers = values[0].map(normalizeHeader);
  const payloadRows = values.slice(1).map((row, index) => {
    const raw = {};
    headers.forEach((h, i) => { raw[h] = row[i] ?? ''; });
    return {
      source: 'google_sheets',
      source_key: 'google_sheets:' + sheetName + ':' + (index + 2),
      sheet_name: sheetName,
      row_number: index + 2,
      order_type: detectOrderType(raw),
      customer_name: first(raw, ['vardas','name','customer_name','klientas']),
      customer_email: first(raw, ['el_pastas','email','customer_email','elpastas']),
      customer_phone: first(raw, ['telefonas','phone','customer_phone']),
      child_name: first(raw, ['vaiko_vardas','vaikas','child_name','mokinio_vardas']),
      child_birth_date: first(raw, ['vaiko_gimimo_data','gimimo_data','child_birth_date']),
      parent_name: first(raw, ['tevai','tevu_vardas','parent_name','mama_tetis']),
      parent_email: first(raw, ['tevu_el_pastas','parent_email','parent_email_address']),
      parent_phone: first(raw, ['tevu_telefonas','parent_phone']),
      group_text: first(raw, ['grupe','grupė','group','grupes_pasirinkimas','grupė_pasirinkimas']),
      lesson_text: first(raw, ['pamoka','lesson','lesson_text']),
      reservation_date: first(raw, ['data','rezervacijos_data','reservation_date']),
      start_time: first(raw, ['pradzia','pradžia','start_time']),
      end_time: first(raw, ['pabaiga','end_time']),
      purpose: first(raw, ['paskirtis','purpose']),
      amount: parseAmount(first(raw, ['suma','kaina','amount','price'])),
      paid_text: first(raw, ['apmoketa','apmokėta','paid','payment']),
      consent_signed: first(raw, ['sutikimas','consent','consent_signed']),
      raw_data: raw
    };
  }).filter(r => Object.values(r.raw_data).some(v => String(v).trim() !== ''));

  let processed = 0, needsReview = 0;
  for (let i = 0; i < payloadRows.length; i += 50) {
    const response = UrlFetchApp.fetch(LDS_IMPORT_URL, {
      method: 'post',
      contentType: 'application/json',
      headers: { 'x-website-import-token': token },
      payload: JSON.stringify({ rows: payloadRows.slice(i, i + 50) }),
      muteHttpExceptions: true
    });
    const code = response.getResponseCode();
    const body = response.getContentText();
    if (code < 200 || code >= 300) throw new Error('LDS import failed (' + code + '): ' + body.slice(0, 500));
    const result = JSON.parse(body);
    processed += Number(result.processed || 0);
    needsReview += Number(result.needs_review || 0);
  }

  return { received: payloadRows.length, processed, needsReview, syncedAt: new Date().toISOString() };
}

function create5MinuteTrigger() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'syncLdsRegistrations')
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('syncLdsRegistrations').timeBased().everyMinutes(5).create();
}

function createHourlyTrigger() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'syncLdsRegistrations')
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('syncLdsRegistrations').timeBased().everyHours(1).create();
}

function normalizeHeader(value) {
  return String(value || '').trim().toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}
function first(raw, keys) {
  for (const key of keys) if (raw[key] != null && String(raw[key]).trim() !== '') return String(raw[key]).trim();
  return null;
}
function parseAmount(value) {
  if (!value) return null;
  const n = Number(String(value).replace(/[^0-9,.-]/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}
function detectOrderType(raw) {
  const text = Object.values(raw).join(' ').toLowerCase();
  if (text.includes('sutik') || text.includes('consent')) return 'consent';
  if (text.includes('nuoma') || text.includes('rental')) return 'rental';
  if (text.includes('vienkart') || text.includes('drop')) return 'drop_in';
  if (text.includes('vaik') || text.includes('child')) return 'child';
  return 'adult';
}
