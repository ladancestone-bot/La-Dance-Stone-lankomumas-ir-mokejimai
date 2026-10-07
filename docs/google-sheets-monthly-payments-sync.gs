/**
 * La Dance Stone — monthly spreadsheet -> app sync.
 *
 * Paste this into Apps Script attached to EACH monthly spreadsheet
 * (CONTEMPORARY CHILDREN and CONTEMPORARY ADULTS).
 *
 * The script reads all month tabs (Rugsėjis, Spalis, Lapkritis, ...),
 * sends the monthly roster + prices to the Supabase sync function,
 * and deliberately ignores the spreadsheet's Payment column.
 *
 * One-time setup:
 * 1. Set SCRIPT_TOKEN in Script Properties to the sync token supplied by LDS.
 * 2. Run testSync() once and authorize Google Sheets + UrlFetchApp access.
 * 3. Optionally run installHourlyTrigger() for automatic hourly sync.
 *
 * Google Apps Script runs in V8.
 */

const LDS_SYNC_URL = 'https://tqzabmlrtbrylibafjfh.supabase.co/functions/v1/sync-google-sheets-monthly-payments';
const SEASON_START_YEAR = 2026;
const MONTHS = {
  'Sausis':1,'Vasaris':2,'Kovas':3,'Balandis':4,'Gegužė':5,'Geguze':5,
  'Birželis':6,'Birzelis':6,'Liepa':7,'Rugpjūtis':8,'Rugpjutis':8,
  'Rugsėjis':9,'Rugsejis':9,'Spalis':10,'Lapkritis':11,'Gruodis':12
};

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('LA DANCE STONE')
    .addItem('↻ Sinchronizuoti mokėjimus', 'syncAllSheets')
    .addItem('✓ Patikrinti sinchronizaciją', 'testSync')
    .addItem('⏱ Įjungti automatinį sinchronizavimą', 'installHourlyTrigger')
    .addToUi();
}

function getToken_() {
  const token = PropertiesService.getScriptProperties().getProperty('SCRIPT_TOKEN');
  if (!token) throw new Error('Nėra SCRIPT_TOKEN. Įrašyk jį Apps Script → Project Settings → Script properties.');
  return token;
}

function monthDate_(sheetName) {
  const month = MONTHS[String(sheetName).trim()];
  if (!month) return null;
  const year = month >= 9 ? SEASON_START_YEAR : SEASON_START_YEAR + 1;
  return year + '-' + String(month).padStart(2,'0') + '-01';
}

function norm_(v) {
  return String(v || '').trim().toLocaleLowerCase('lt-LT')
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-z0-9]+/g,'');
}

function number_(v) {
  const s = String(v || '').replace(',', '.').replace(/[^0-9.-]/g,'');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function findEmail_(row) {
  for (const cell of row) {
    const s = String(cell || '').trim();
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return s;
  }
  return '';
}

function findPhone_(row) {
  for (const cell of row) {
    const s = String(cell || '').trim();
    const digits = s.replace(/[^0-9+]/g,'');
    if (/^\+?370\d{7,8}$/.test(digits) || /^0\d{8,9}$/.test(digits)) return s;
  }
  return '';
}

function findPrice_(row, priceCol) {
  // IMPORTANT: Price and Payment are both numeric.
  // Always read the dedicated Price/Kaina column so the spreadsheet's
  // Payment column is never imported as the amount due.
  if (priceCol >= 0 && priceCol < row.length) {
    const n = number_(row[priceCol]);
    if (n !== null && n >= 0 && n <= 100) return n;
  }
  return null;
}

function findPriceColumn_(values) {
  const priceLabels = /^(price|kaina|monthly price|abonemento kaina|mokestis)$/i;
  const paymentLabels = /^(payment|mok[eė]jimas|sumok[eė]ta|apmok[eė]ta)$/i;

  // Search header-like rows first. Prefer Price/Kaina and never Payment.
  for (let r = 0; r < Math.min(values.length, 30); r++) {
    for (let c = 0; c < values[r].length; c++) {
      const label = String(values[r][c] || '').trim();
      if (priceLabels.test(label) && !paymentLabels.test(label)) return c;
    }
  }

  // Fallback for the known LDS layout: Subscription -> Price -> Payment.
  // Do not use the right-most number because that can be Payment.
  for (let r = 0; r < Math.min(values.length, 30); r++) {
    const row = values[r].map(v => String(v || '').trim().toLowerCase());
    const sub = row.findIndex(v => /subscription|abonementas/.test(v));
    if (sub >= 0 && sub + 1 < row.length) return sub + 1;
  }

  return -1;
}

function detectSchedule_(text) {
  if (/pirmadien/i.test(text) && /trečiadien/i.test(text)) return 'mw';
  if (/antradien/i.test(text) && /ketvirtadien/i.test(text)) return 'tt';
  if (/monday/i.test(text) && /wednesday/i.test(text)) return 'mw';
  if (/tuesday/i.test(text) && /thursday/i.test(text)) return 'tt';
  if (/sunday\s*19[:.]?\s*00/i.test(text)) return 'sun';
  return null;
}

function groupFromHeader_(text, schedule) {
  const m = text.match(/Grupė\s+(5-6m|7-12m|13-18m)/i);
  if (!m) return null;
  const age = m[1];
  if (schedule === 'mw') return 'Grupė ' + age + ' — Pirmadienis / Trečiadienis';
  if (schedule === 'tt') return 'Grupė ' + age + ' — Antradienis / Ketvirtadienis';
  return null;
}

function adultGroupFromSchedule_(schedule) {
  if (schedule === 'mw') return 'Suaugusieji — Pirmadienis / Trečiadienis 19:15';
  if (schedule === 'sun') return 'Suaugusieji — Sekmadienis 19:00';
  return null;
}

function parseSheet_(sheet) {
  const month = monthDate_(sheet.getName());
  if (!month) return [];
  const values = sheet.getDataRange().getDisplayValues();
  const priceCol = findPriceColumn_(values);
  const rows = [];
  let schedule = null;
  let groupName = null;

  values.forEach((row, idx) => {
    const text = row.join(' ').replace(/\s+/g,' ').trim();
    if (!text) return;

    const detected = detectSchedule_(text);
    if (detected) schedule = detected;

    const childGroup = groupFromHeader_(text, schedule);
    if (childGroup) groupName = childGroup;

    const adultGroup = adultGroupFromSchedule_(schedule);
    if (adultGroup && /suaug|adult|contemporary adults/i.test(text)) groupName = adultGroup;
    if (/sunday\s*19[:.]?\s*00/i.test(text)) groupName = 'Suaugusieji — Sekmadienis 19:00';
    if (/monday\s*\/\s*wednesday\s*19[:.]?\s*15/i.test(text)) groupName = 'Suaugusieji — Pirmadienis / Trečiadienis 19:15';

    // Actual client rows start with a numeric row number and have the name in column B.
    const rowNo = String(row[0] || '').trim();
    const name = String(row[1] || '').trim();
    if (!/^\d+$/.test(rowNo) || !name) return;
    if (/^(gabija staponaitė|gabija staponait[eė])$/i.test(name) && /gabija staponait/i.test(text)) return;

    const email = findEmail_(row);
    const phone = findPhone_(row);
    const amount = findPrice_(row, priceCol);
    if (!groupName || amount === null) return;

    const identity = email || phone || name;
    rows.push({
      month,
      source_key: month + '|' + norm_(groupName) + '|' + norm_(identity),
      source_sheet: sheet.getName(),
      source_row: idx + 1,
      name,
      email,
      phone,
      group_name: groupName,
      amount_due: amount
    });
  });
  return rows;
}

function syncAllSheets() {
  const token = getToken_();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let rows = [];
  ss.getSheets().forEach(sheet => {
    rows = rows.concat(parseSheet_(sheet));
  });

  if (!rows.length) throw new Error('Nerasta nė vieno mėnesio kliento. Patikrink lapų pavadinimus ir struktūrą.');

  const response = UrlFetchApp.fetch(LDS_SYNC_URL, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({ token, rows }),
    muteHttpExceptions: true
  });
  const code = response.getResponseCode();
  const body = response.getContentText();
  if (code >= 400) throw new Error('LDS sync klaida ' + code + ': ' + body);
  Logger.log(body);
  SpreadsheetApp.getActive().toast('Sinchronizuota: ' + rows.length + ' eilučių', 'LA DANCE STONE', 5);
}

function testSync() {
  syncAllSheets();
}

function installHourlyTrigger() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'syncAllSheets')
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('syncAllSheets').timeBased().everyHours(1).create();
  SpreadsheetApp.getActive().toast('Automatinis sinchronizavimas įjungtas kas 1 val.', 'LA DANCE STONE', 5);
}
