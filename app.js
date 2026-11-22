/* טיול שנתי י"ב תשפ"ז – אתר הטיול. ללא איסוף מידע: הכול נשמר מקומית בטלפון (localStorage). */
'use strict';

const APP_VERSION = '1.0.3';
const LETTERS = ["א'", "ב'", "ג'", "ד'"];
const MAPS = {
  eilat: { title: 'הרי אילת', img: 'maps/eilat.webp', lat0: 29.72, lat1: 29.48, lon0: 34.84, lon1: 35.03, latRef: 29.6, vbW: 688.4, vbH: 1000,
    alt: 'מפת הרי אילת עם שלושת המסלולים: 1 נחל אמיר, 2 הר צפחות, 3 הקניון האדום, כבישים 90 ו-12 ודרכי העפר אל המסלולים.' },
  israel: { title: 'ישראל', img: 'maps/israel.webp', lat0: 33.42, lat1: 29.40, lon0: 34.15, lon1: 36.85, latRef: 31.4, vbW: 768, vbH: 1340,
    alt: 'מפת ישראל עם הכבישים הראשיים, ערים מרכזיות, רחובות כנקודת היציאה, ואזור אילת מוגדל עם המסלולים וחניון יעלים.' }
};

/* ---------- storage helpers (local only) ---------- */
const LS = {
  get(k, d) { try { const v = localStorage.getItem('trip12.' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('trip12.' + k, JSON.stringify(v)); } catch (e) {} }
};
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = s => document.querySelector(s);

let BASE = null;   // content.json
let C = null;      // content after overrides
let geoWatch = null;

/* ---------- content + overrides from staff updates ---------- */
function applyOverrides(base, ov) {
  const c = JSON.parse(JSON.stringify(base));
  if (!ov) return c;
  if (ov.schedule) c.days.forEach(d => { if (ov.schedule[d.id] && ov.schedule[d.id].length) d.items = ov.schedule[d.id]; });
  if (ov.notices) c.notices = ov.notices;
  if (ov.checklist && ov.checklist.length) c.checklist = ov.checklist;
  if (ov.phones) c.phones = ov.phones;
  if (ov.feedback) Object.assign(c.feedback, ov.feedback);
  (ov.fixes || []).forEach(([path, val]) => setPath(c, path, val));
  c.updateVersion = ov.version; c.updateDate = ov.date; c.updateChanges = ov.changes;
  return c;
}
function setPath(obj, path, val) {
  // נתיב כמו routes.amir.about או rules.2.items.3.text – מספרים נספרים מ-1, ובמערכים אפשר גם לפי id
  const parts = String(path).split('.');
  let o = obj;
  const step = (cur, p) => {
    if (Array.isArray(cur)) return /^\d+$/.test(p) ? cur[Number(p) - 1] : cur.find(x => x && x.id === p);
    return cur && typeof cur === 'object' ? cur[p] : undefined;
  };
  for (let i = 0; i < parts.length - 1; i++) { o = step(o, parts[i]); if (o == null) return; }
  let last = parts[parts.length - 1];
  if (Array.isArray(o) && /^\d+$/.test(last)) { const i = Number(last) - 1; if (i >= 0 && i < o.length && typeof o[i] !== 'object') o[i] = val; return; }
  if (o && typeof o === 'object' && last in o && typeof o[last] !== 'object') o[last] = val;
}
function rebuild() { C = applyOverrides(BASE, LS.get('overrides', null)); }

/* CSV parser (handles quotes) */
function parseCSV(text) {
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
    else if (ch === '"' && cell === '') q = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.map(r => r.map(x => x.trim())).filter(r => r.some(x => x !== ''));
}
/* Sheet format: type | key | value | extra
   meta,version,<number> | meta,date,<text> | meta,changes,<text>
   schedule,<d1|d2|d3>,<time>,<text>
   notice,,<text>        | checklist,,<text>
   phone,<name>,<number> | feedback,<d1|d2|d3|final|report>,<url>
   fix,<path>,<new text>   e.g. fix,routes.1.about,<טקסט>  (מספור מ-1) */
function sheetToOverrides(rows) {
  const ov = { version: 0, date: '', changes: '', schedule: {}, notices: [], checklist: [], phones: [], feedback: {}, fixes: [] };
  rows.forEach(r => {
    const [type, key, value, extra] = [(r[0] || '').toLowerCase(), r[1] || '', r[2] || '', r[3] || ''];
    if (type === 'meta') { if (key === 'version') ov.version = Number(value) || 0; else if (key === 'date') ov.date = value; else if (key === 'changes') ov.changes = value; }
    else if (type === 'schedule' && /^d\d$/.test(key)) (ov.schedule[key] = ov.schedule[key] || []).push({ time: value, text: extra });
    else if (type === 'notice' && value) ov.notices.push(value);
    else if (type === 'checklist' && value) ov.checklist.push(value);
    else if (type === 'phone' && key && value) ov.phones.push({ name: key, number: value });
    else if (type === 'feedback' && key && /^https:\/\//.test(value)) ov.feedback[key] = value;
    else if (type === 'fix' && key && value) ov.fixes.push([key, value]);
  });
  return ov;
}

async function checkUpdates() {
  if (!navigator.onLine) return modal('אין חיבור לאינטרנט', '<p>האתר ממשיך לעבוד עם המידע שכבר שמור בטלפון. נסו שוב כשתהיה קליטה.</p>', [['סגור']]);
  if (!C.updatesUrl) return modal('אין עדכונים כרגע', '<p>יש לך את הגרסה העדכנית. הצוות מעדכן את האתר מדי פעם.</p>', [['סגור']]);
  try {
    const res = await fetch(C.updatesUrl + (C.updatesUrl.includes('?') ? '&' : '?') + 't=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) throw new Error(res.status);
    const ov = sheetToOverrides(parseCSV(await res.text()));
    const cur = LS.get('overrides', null);
    if (cur && ov.version <= cur.version) return modal('אין עדכון חדש', '<p>יש לך את הגרסה העדכנית.</p>', [['סגור']]);
    modal('יש עדכון חדש', `<p><b>מה השתנה:</b> ${esc(ov.changes || 'עדכון מידע מהצוות')}</p>${ov.date ? `<p class="small muted">עודכן: ${esc(ov.date)}</p>` : ''}<p>להוריד את העדכון לטלפון?</p>`,
      [['הורד עדכון', () => { LS.set('overrides', ov); LS.set('lastCheck', new Date().toISOString()); rebuild(); route(); toast('העדכון הורד בהצלחה'); }], ['לא עכשיו']]);
  } catch (e) {
    modal('לא הצלחנו לבדוק עדכונים', '<p>ייתכן שהקליטה חלשה. האתר ממשיך לעבוד עם המידע הקיים.</p>', [['סגור']]);
  }
}
function updateCard() {
  const v = LS.get('overrides', null);
  return `<div class="card soft"><div class="row" style="align-items:center;justify-content:space-between">
    <div><b>עדכונים מהצוות</b><div class="small muted">${v && v.date ? 'עודכן לאחרונה: ' + esc(v.date) : 'הצוות מעדכן את האתר מדי פעם. מומלץ לבדוק כשיש קליטה.'}</div></div>
    <button class="btn secondary" data-act="update">בדוק עדכונים</button></div></div>`;
}

/* ---------- modal + toast ---------- */
let lastFocus = null;
function modal(title, html, actions) {
  lastFocus = document.activeElement;
  $('#modalTitle').textContent = title; $('#modalBody').innerHTML = html;
  const box = $('#modalActions'); box.innerHTML = '';
  (actions || [['סגור']]).forEach(([label, fn], i) => {
    const b = document.createElement('button'); b.className = 'btn' + (i ? ' secondary' : ''); b.textContent = label;
    b.onclick = () => { closeModal(); fn && fn(); }; box.appendChild(b);
  });
  $('#modal').hidden = false; box.querySelector('button').focus();
}
function closeModal() { $('#modal').hidden = true; lastFocus && lastFocus.focus && lastFocus.focus(); }
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#modal').hidden) closeModal(); });
function toast(msg) { const t = document.createElement('div'); t.setAttribute('role', 'status'); t.className = 'card notice'; t.style.cssText = 'position:fixed;bottom:84px;right:12px;left:12px;z-index:60;text-align:center;font-weight:700'; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 2600); }

/* ---------- dates ---------- */
const today = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const todayDay = () => C.days.find(d => d.date === today());
const fmtDate = iso => { const [y, m, d] = iso.split('-'); return `${+d}.${+m}`; };
function nextItemIndex(day) {
  const now = new Date(); const mins = now.getHours() * 60 + now.getMinutes();
  let idx = -1;
  day.items.forEach((it, i) => { const m = /^(\d{1,2}):(\d{2})$/.exec(it.time || ''); if (m && idx === -1 && (+m[1] * 60 + +m[2]) >= mins) idx = i; });
  return idx;
}

/* ---------- views ---------- */
function schedList(day, highlight) {
  const allPending = day.items.every(i => !i.time);
  const nx = highlight ? nextItemIndex(day) : -1;
  if (allPending) return '<p class="small muted">זו התוכנית הכללית של היום. השעות המדויקות יפורסמו בעדכון.</p><ol class="plan">' +
    day.items.map(it => `<li>${esc(it.text)}</li>`).join('') + '</ol>';
  return '<ul class="sched">' + day.items.map((it, i) => `<li class="${i === nx ? 'next' : ''}">
      <span class="t ${it.time ? '' : 'pending'}">${it.time ? esc(it.time) : '<span aria-label="ללא שעה">•</span>'}</span>
      <span>${esc(it.text)}${i === nx ? ' <b>(הבא בתור)</b>' : ''}</span></li>`).join('') + '</ul>';
}
const routeOf = id => C.routes.find(r => r.id === id);
const badge = r => `<span class="badge b-${r.id}" aria-label="מסלול ${r.num}">${r.num}</span>`;

function viewNow() {
  const t = today(), d = todayDay();
  let h = '';
  C.notices.forEach(n => { h += `<div class="card notice" role="note"><b>הודעה מהצוות:</b> ${esc(n)}</div>`; });
  if (t < C.tripDates.start) {
    const days = Math.round((new Date(C.tripDates.start) - new Date(t)) / 864e5);
    h += `<div class="card"><div class="kicker">לקראת הטיול</div><h1>${days === 1 ? 'מחר יוצאים!' : `עוד ${days} ימים לטיול`}</h1>
      <p>שלושה ימים בהרי אילת: הקניון האדום, נחל אמיר והר צפחות, ולינה בחאן יעלים.</p></div>
      <div class="card soft"><h2>מה עושים לפני הטיול</h2><ol class="steps">
      <li>פותחים את האתר פעם אחת עם אינטרנט ומחכים לסימון <b>"✓ ללא רשת"</b> למעלה – הוא אומר שהאתר שמור בטלפון.</li>
      <li>אפשר (לא חובה) להוסיף את האתר למסך הבית – <a href="#install">איך עושים את זה</a>.</li>
      <li>עוברים על <a href="#rules">הנהלים</a> ועל <a href="#checklist">רשימת הציוד</a>.</li></ol></div>`;
  } else if (d) {
    const r = routeOf(d.route);
    h += `<div class="card"><div class="kicker">${esc(d.weekday)} · ${fmtDate(d.date)}</div><h1>${esc(d.title)}</h1>${schedList(d, true)}</div>`;
    if (r) h += `<div class="card soft"><h2>${badge(r)}${esc(r.name)}</h2><p>${esc(r.about)}</p><div class="row"><a class="btn" href="#route-${r.id}">פרטי המסלול</a><a class="btn secondary" href="#learn-${r.id}">העשרה</a></div></div>`;
    h += `<div class="card"><h2>משוב יומי</h2><p>בסוף היום – ספרו לנו איך היה. המשוב אנונימי לגמרי.</p><a class="btn secondary" href="#feedback">למשוב</a></div>`;
  } else if (t > C.tripDates.end) {
    h += `<div class="card"><h1>תודה שטיילתם איתנו!</h1><p>נשמח לשמוע מה חשבתם על הטיול כולו. המשוב אנונימי לגמרי.</p><a class="btn" href="#feedback">משוב סיום הטיול</a></div>`;
  }
  h += updateCard();
  h += `<div class="tiles">
    <a class="tile" href="#maps"><span class="e" aria-hidden="true">🗺️</span>מפות</a>
    <a class="tile" href="#routes"><span class="e" aria-hidden="true">🥾</span>המסלולים</a>
    <a class="tile" href="#rules"><span class="e" aria-hidden="true">📋</span>נהלים</a>
    <a class="tile" href="#quiz"><span class="e" aria-hidden="true">❓</span>חידון</a></div>`;
  return h + footer();
}

function viewSchedule() {
  const sel = LS.get('schedDay', (todayDay() || C.days[0]).id);
  const d = C.days.find(x => x.id === sel) || C.days[0];
  return `<h1>לוח זמנים</h1>
    <div class="daytabs" role="tablist" aria-label="בחירת יום">${C.days.map((x, i) => `<button role="tab" aria-selected="${x.id === d.id}" data-day="${x.id}">יום ${i + 1} · ${fmtDate(x.date)}</button>`).join('')}</div>
    <div class="card" role="tabpanel"><div class="kicker">${esc(d.weekday)}</div><h2>${esc(d.title)}</h2>${schedList(d, d.date === today())}</div>
    <p class="small muted">הלו"ז עשוי להשתנות. הוראות הצוות בשטח הן הקובעות.</p>${updateCard()}${footer()}`;
}

function mapViewer(key, opts = {}) {
  return `<div class="maptools">
      <button class="btn secondary" data-zoom="1" aria-label="הגדל מפה">＋ הגדל</button>
      <button class="btn secondary" data-zoom="-1" aria-label="הקטן מפה">－ הקטן</button>
      ${opts.geo ? `<button class="btn" data-geo="${key}" aria-pressed="false">📍 הצג את המיקום שלי</button>` : ''}
    </div>
    <div class="mapwrap" id="mapwrap"><div class="mapinner" id="mapinner" style="width:100%">
      <img src="${esc(opts.img)}" alt="${esc(opts.alt)}"><div class="dot" id="geodot" hidden></div></div></div>
    <div id="geomsg" class="small" role="status" aria-live="polite"></div>
    ${opts.credit ? `<div class="credit">${opts.credit}</div>` : ''}`;
}
function viewMaps() {
  let sel = LS.get('mapSel', 'eilat'); if (!MAPS[sel]) sel = 'eilat';
  const tabs = [['eilat', 'הרי אילת – המסלולים'], ['israel', 'ישראל']];
  const m = MAPS[sel];
  const body = mapViewer(sel, { img: m.img, alt: m.alt, geo: true, credit: 'נתוני גבולות וחוף: © OpenStreetMap contributors, Natural Earth. תוואי המסלולים מבוסס על מפות סימון שבילים. המפה להתמצאות בלבד – לא לניווט.' });
  return `<h1>מפות</h1><div class="seg" role="group" aria-label="בחירת מפה">${tabs.map(([k, l]) => `<button data-map="${k}" aria-pressed="${k === sel}">${esc(l)}</button>`).join('')}</div>
    ${sel === 'eilat' ? '<p class="small">מסלול 1: נחל אמיר · מסלול 2: הר צפחות · מסלול 3: הקניון האדום</p>' : ''}
    ${body}<p class="small muted">המיקום מוצג רק בטלפון שלך ולא נשלח לאף אחד. ה-GPS עובד גם בלי קליטה, אבל צורך סוללה – כבו אותו כשלא צריך.</p>${footer()}`;
}
function viewRoutes() {
  return `<h1>המסלולים</h1>` + C.days.map((d, i) => { const r = routeOf(d.route); return `<a class="card" style="display:block;text-decoration:none;color:inherit" href="#route-${r.id}">
    <div class="kicker">יום ${i + 1} · ${esc(d.weekday)} ${fmtDate(d.date)}</div><h2>${badge(r)}${esc(r.name)}</h2>
    <div class="small muted">${esc(r.facts.slice(0, 2).map(f => f[1]).join(' · '))}</div></a>`; }).join('') +
    `<div class="card soft"><h2>⛺ לינה: חאן יעלים</h2><p>בצומת יטבתה, כ-150 מטר מזרחית לפונדק יטבתה. שני הלילות של הטיול.</p></div>
     <div class="card soft"><h2>🏬 אייס מול, אילת</h2><p>ביקור ביום השלישי, אחרי מסלול הר צפחות ואום רשרש. <a href="#rules">הנהלים לאייס מול</a></p></div>` + footer();
}
function viewRoute(id) {
  const r = routeOf(id); if (!r) return viewRoutes();
  const d = C.days.find(x => x.id === r.day);
  return `<p><a href="#routes">→ כל המסלולים</a></p><div class="card"><div class="kicker">${d ? esc(d.weekday) + ' ' + fmtDate(d.date) : ''}</div>
    <h1>${badge(r)}${esc(r.name)}</h1><p>${esc(r.about)}</p>
    <dl class="facts">${r.facts.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
    <div class="row"><button class="btn" data-openmap="${r.id}">על המפה</button><a class="btn secondary" href="#learn-${r.id}">העשרה</a></div></div>
    <div class="card"><h2>דגשים למסלול הזה</h2>${r.rules.map(t => `<div class="rule"><span aria-hidden="true">•</span><div>${esc(t)}</div></div>`).join('')}
    <p class="small muted"><a href="#rules">כל הנהלים</a></p></div>${footer()}`;
}

function viewRules() {
  return `<h1>נהלי הטיול</h1><div class="card ai">הנהלים כאן להסבר והיכרות בלבד. כל הנחיה בשטח ניתנת על ידי הצוות, והוראות הצוות קודמות תמיד.</div>` +
    C.rules.map(s => `<section class="card"><h2><span aria-hidden="true">${s.icon}</span> ${esc(s.title)}</h2>${s.items.map(it => `<div class="rule"><span aria-hidden="true">•</span><div>
      ${esc(it.text)}${it.strict ? '<span class="strict">איסור מוחלט</span>' : ''}
      ${it.why ? `<details class="why"><summary>למה?</summary><p>${esc(it.why)}</p></details>` : ''}</div></div>`).join('')}</section>`).join('') +
    `<div class="card soft"><h2>ההנחיות לכל מסלול</h2>${C.routes.map(r => `<p><a href="#route-${r.id}">${esc(r.name)}</a></p>`).join('')}</div>` + footer();
}

function viewLearn(id) {
  const list = C.learn;
  if (!id) return `<h1>העשרה</h1><p>הסברים קצרים לקריאה בעצירות, באוטובוס או בערב – לא תוך כדי הליכה.</p>` +
    list.map(l => `<a class="card" style="display:block;text-decoration:none;color:inherit" href="#learn-${l.id}"><h2>${esc(l.title)}</h2><div class="small muted">${l.cards.length} כרטיסים</div></a>`).join('') + footer();
  const l = list.find(x => x.id === id) || list[0];
  return `<p><a href="#learn">→ כל נושאי ההעשרה</a></p><h1>${esc(l.title)}</h1>` +
    l.cards.map(c => `<article class="card"><h2>${esc(c.title)}</h2><p>${esc(c.text)}</p>${c.ask ? `<p class="small"><b>שאלה למחשבה:</b> ${esc(c.ask)}</p>` : ''}</article>`).join('') + footer();
}

function viewChecklist() {
  const done = LS.get('check', {});
  return `<h1>רשימת ציוד</h1><p class="small muted">הסימונים נשמרים רק בטלפון שלך.</p><div class="card">` +
    C.checklist.map((t, i) => `<label class="check ${done[t] ? 'done' : ''}"><input type="checkbox" data-check="${esc(t)}" ${done[t] ? 'checked' : ''}><span>${esc(t)}</span></label>`).join('') +
    `</div>${updateCard()}${footer()}`;
}

function viewFeedback() {
  const items = [...C.days.map((d, i) => [d.id, `משוב יום ${i + 1} – ${d.title}`]), ['final', 'משוב סיום הטיול']];
  return `<h1>משוב</h1><div class="card ai"><b>המשוב אנונימי לחלוטין.</b> לא נאספים שם, מייל או כל פרט מזהה. אנא אל תכתבו במשוב פרטים מזהים – שלכם או של אחרים.<br>שליחת משוב דורשת חיבור לאינטרנט.</div>` +
    items.map(([k, l]) => { const u = C.feedback[k]; return `<div class="card"><h2>${esc(l)}</h2>${u ? `<a class="btn" href="${esc(u)}" target="_blank" rel="noopener">פתיחת טופס המשוב</a>` : '<p class="muted">הקישור יפורסם בקרוב. בדקו עדכונים מאוחר יותר.</p>'}</div>`; }).join('') + updateCard() + footer();
}

function viewReport() {
  const u = C.feedback.report;
  return `<h1>דיווח על טעות או בעיה</h1>
  <div class="card"><p>מצאתם טעות בתוכן, מידע לא מעודכן, משהו שלא עובד או משהו לא נגיש? ספרו לנו – נבדוק ונתקן בעדכון הבא.</p>
  <p class="small"><b>כדאי לכתוב:</b> באיזה מסך זה היה, מה לא תקין, ומה צריך להיות לדעתכם.</p>
  ${u ? `<a class="btn" href="${esc(u)}" target="_blank" rel="noopener">פתיחת טופס הדיווח</a>` : '<p class="muted">טופס הדיווח יפורסם בקרוב. בינתיים אפשר לפנות לכל מורה מלווה.</p>'}</div>
  <div class="card ai">הדיווח אנונימי. לא נאספים שם, מייל או כל פרט מזהה – אנא אל תכתבו פרטים מזהים. שליחה דורשת חיבור לאינטרנט.<br><b>זה לא ערוץ לבעיה בשטח:</b> בכל עניין בטיחות, בריאות או מצוקה – פונים מיד למורה.</div>
  ${updateCard()}${footer()}`;
}
function viewMore() {
  const phones = C.phones && C.phones.length ? `<div class="card"><h2>טלפוני הצוות</h2>${C.phones.map(p => `<p><b>${esc(p.name)}:</b> <span dir="ltr">${esc(p.number)}</span></p>`).join('')}</div>` : '';
  return `<h1>עוד</h1><div class="tiles">
    <a class="tile" href="#routes"><span class="e" aria-hidden="true">🥾</span>המסלולים</a>
    <a class="tile" href="#learn"><span class="e" aria-hidden="true">🪨</span>העשרה</a>
    <a class="tile" href="#rules"><span class="e" aria-hidden="true">📋</span>נהלים</a>
    <a class="tile" href="#checklist"><span class="e" aria-hidden="true">🎒</span>רשימת ציוד</a>
    <a class="tile" href="#feedback"><span class="e" aria-hidden="true">💬</span>משוב אנונימי</a>
    <a class="tile" href="#report"><span class="e" aria-hidden="true">🛠️</span>דיווח על טעות</a>
    <a class="tile" href="#install"><span class="e" aria-hidden="true">📲</span>התקנה והסרה</a>
    <a class="tile" href="#a11y"><span class="e" aria-hidden="true">♿</span>נגישות</a>
    <a class="tile" href="#about"><span class="e" aria-hidden="true">ℹ️</span>אודות והצהרות</a></div><br>${phones}${updateCard()}${footer()}`;
}

/* ---------- quiz ---------- */
function quizState() { return LS.get('quiz', {}); }
function chapterOpen(ch) { return !ch.unlock || Date.now() >= Date.parse(ch.unlock); }
function totalScore() { const s = quizState(); return Object.values(s).reduce((a, c) => a + (c.score || 0), 0); }
function viewQuiz(chId) {
  const chapters = C.quiz.chapters;
  if (!chId) {
    const st = quizState();
    return `<h1>חידון הטיול</h1><div class="card soft"><div class="small muted">הניקוד שלך (נשמר רק בטלפון)</div><div class="score">${totalScore()}</div></div>
      <p class="small muted">פרק חדש נפתח בכל ערב, אחרי המסלול. בזמן הליכה – הטלפון בכיס 🙂</p>` +
      chapters.map(ch => { const open = chapterOpen(ch), s = st[ch.id] || {}, answered = Object.keys(s.answers || {}).length;
        return `<div class="card"><h2>${esc(ch.title)}</h2><p class="small muted">${ch.questions.length} שאלות${answered ? ` · ענית על ${answered} · ${s.score || 0} נקודות` : ''}</p>
        ${open ? `<a class="btn ${answered >= ch.questions.length ? 'secondary' : ''}" href="#quiz-${ch.id}">${answered >= ch.questions.length ? 'צפייה בתשובות' : answered ? 'המשך' : 'התחל'}</a>`
               : `<p>🔒 ייפתח ב-${new Date(ch.unlock).toLocaleString('he-IL', { weekday: 'long', hour: '2-digit', minute: '2-digit' })}</p>`}</div>`; }).join('') + footer();
  }
  const ch = chapters.find(c => c.id === chId); if (!ch || !chapterOpen(ch)) return viewQuiz();
  const st = quizState(); const s = st[ch.id] = st[ch.id] || { answers: {}, score: 0, order: null };
  if (!s.order) { s.order = ch.questions.map(q => shuffle([0, 1, 2, 3].slice(0, q.o.length))); LS.set('quiz', st); }
  const qi = ch.questions.findIndex((_, i) => !(i in s.answers));
  const idx = qi === -1 ? null : qi;
  if (idx === null) {
    return `<p><a href="#quiz">→ כל הפרקים</a></p><div class="card"><h1>סיימת את הפרק!</h1><div class="score">${s.score}</div><p>מתוך ${ch.questions.length * C.quiz.pointsPerCorrect} נקודות אפשריות.</p></div>` +
      ch.questions.map((q, i) => `<div class="card"><b>${i + 1}. ${esc(q.q)}</b><p class="small">התשובה הנכונה: ${esc(q.o[q.a])}</p><p class="small muted">${esc(q.e)}</p></div>`).join('') + footer();
  }
  const q = ch.questions[idx], order = s.order[idx];
  return `<p><a href="#quiz">→ כל הפרקים</a></p><div class="small muted">${esc(ch.title)} · שאלה ${idx + 1} מתוך ${ch.questions.length}</div>
    <div class="progress" aria-hidden="true"><i style="width:${(idx / ch.questions.length) * 100}%"></i></div>
    <div class="card"><h2 id="qtext">${esc(q.q)}</h2><div role="group" aria-labelledby="qtext">
    ${order.map((oi, pos) => `<button class="quiz-opt" data-ans="${oi}" data-ch="${ch.id}" data-q="${idx}"><span class="lt" aria-hidden="true">${LETTERS[pos]}</span><span>${esc(q.o[oi])}</span></button>`).join('')}
    </div><div id="qfeedback" role="status" aria-live="polite"></div></div>${footer()}`;
}
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function answer(btn) {
  const chId = btn.dataset.ch, qi = +btn.dataset.q, ans = +btn.dataset.ans;
  const ch = C.quiz.chapters.find(c => c.id === chId), q = ch.questions[qi];
  const st = quizState(); const s = st[chId]; if (qi in s.answers) return;
  s.answers[qi] = ans; const ok = ans === q.a; if (ok) s.score += C.quiz.pointsPerCorrect; LS.set('quiz', st);
  document.querySelectorAll('.quiz-opt').forEach(b => { b.disabled = true; const a = +b.dataset.ans; if (a === q.a) b.classList.add('correct'); else if (a === ans) b.classList.add('wrong'); });
  $('#qfeedback').innerHTML = `<p class="verdict ${ok ? 'ok' : 'bad'}">${ok ? '✓ נכון!' : '✗ לא נכון.'} ${ok ? '' : 'התשובה הנכונה: ' + esc(q.o[q.a])}</p><p>${esc(q.e)}</p>
    <button class="btn block" id="qnext">${qi + 1 < ch.questions.length ? 'לשאלה הבאה' : 'לסיכום הפרק'}</button>`;
  $('#qnext').onclick = () => { route(); window.scrollTo(0, 0); }; $('#qnext').focus();
}

/* ---------- static pages ---------- */
function viewInstall() {
  const ua = navigator.userAgent; const ios = /iphone|ipad|ipod/i.test(ua); const sel = LS.get('os', ios ? 'ios' : 'android');
  return `<h1>איך משתמשים באתר</h1>
  <div class="card ai"><b>השימוש באתר הוא רשות ולא חובה.</b> אין צורך בהתקנה ואין צורך בהרשמה – מספיק לפתוח את הקישור. אפשר, למי שרוצה, להוסיף את האתר למסך הבית כמו אפליקציה.</div>
  <div class="card"><h2>1. הכנה לשימוש בלי קליטה</h2><ol class="steps">
    <li>פותחים את האתר פעם אחת כשיש אינטרנט (עדיף בבית, ב-Wi-Fi).</li>
    <li>מחכים שלמעלה יופיע <b>"✓ ללא רשת"</b> – כלומר האתר שמור בטלפון.</li>
    <li>בודקים: מעבירים את הטלפון למצב טיסה, סוגרים את האתר ופותחים שוב. אם הוא נפתח – הכול מוכן.</li>
    <li>באייפון: כדאי לפתוח את האתר גם בערב שלפני הטיול, כדי שהמידע יישמר.</li></ol></div>
  <div class="seg" role="group" aria-label="סוג הטלפון"><button data-os="android" aria-pressed="${sel === 'android'}">אנדרואיד</button><button data-os="ios" aria-pressed="${sel === 'ios'}">אייפון</button></div>
  <div class="os ${sel === 'android' ? 'on' : ''}">
    <div class="card"><h2>2. הוספה למסך הבית (רשות) – אנדרואיד</h2><ol class="steps">
      <li>פותחים את האתר בדפדפן <b>Chrome</b>.</li><li>לוחצים על תפריט שלוש הנקודות ⋮ למעלה.</li>
      <li>בוחרים <b>"הוספה למסך הבית"</b> או <b>"התקנת אפליקציה"</b> ומאשרים.</li><li>האייקון יופיע במסך הבית.</li></ol></div>
    <div class="card"><h2>3. הסרה – אנדרואיד</h2><ol class="steps"><li>לחיצה ארוכה על האייקון במסך הבית.</li><li>בוחרים <b>"הסרה"</b> (או גוררים אל "הסר").</li>
      <li>כדי למחוק גם את המידע השמור: Chrome ← הגדרות ← הגדרות אתרים ← בוחרים את האתר ← "ניקוי והאפסה".</li></ol></div></div>
  <div class="os ${sel === 'ios' ? 'on' : ''}">
    <div class="card"><h2>2. הוספה למסך הבית (רשות) – אייפון</h2><ol class="steps">
      <li>פותחים את האתר בדפדפן <b>Safari</b>.</li>
      <li>בגרסאות החדשות (iOS 26): לוחצים על כפתור <b>שלוש הנקודות (…)</b> ליד שורת הכתובת, ואז על <b>"שיתוף"</b>. בגרסאות קודמות: לוחצים ישר על כפתור השיתוף (ריבוע עם חץ למעלה).</li>
      <li>גוללים ובוחרים <b>"הוסף למסך הבית"</b>. לא מופיע? בתחתית הרשימה בוחרים "עריכת פעולות" ומוסיפים אותו.</li>
      <li>משאירים את האפשרות <b>"פתח כאפליקציית רשת"</b> פעילה, אם היא מופיעה, ולוחצים <b>"הוסף"</b>.</li></ol></div>
    <div class="card"><h2>3. הסרה – אייפון</h2><ol class="steps"><li>לחיצה ארוכה על האייקון במסך הבית.</li><li>בוחרים <b>"הסר אפליקציה"</b> או <b>"מחק סימניה"</b> ומאשרים.</li>
      <li>כדי למחוק גם את המידע השמור: הגדרות ← Safari ← מתקדם ← נתוני אתרים ← מחיקת האתר.</li></ol></div></div>
  <p class="small muted">שמות הכפתורים יכולים להשתנות מעט בין גרסאות של טלפונים ודפדפנים. הסרה מוחקת גם את הניקוד ואת הסימונים השמורים.</p>
  <div class="card soft"><h2>שאלות נפוצות</h2>
    <p><b>לא מופיעה אפשרות להוספה למסך הבית?</b> ודאו שפתחתם ב-Chrome (אנדרואיד) או ב-Safari (אייפון). אפשר גם פשוט להשתמש באתר מהדפדפן.</p>
    <p><b>האתר לא נפתח בלי קליטה?</b> פתחו אותו שוב עם אינטרנט וחכו לסימון "✓ ללא רשת".</p>
    <p><b>איך מקבלים מידע מעודכן?</b> כשיש קליטה, לוחצים "בדוק עדכונים" במסך "עכשיו".</p></div>${footer()}`;
}
function viewA11y() {
  const s = LS.get('a11y', {});
  return `<h1>נגישות</h1><div class="card"><h2>התאמות</h2>
    <p>גודל טקסט:</p><div class="seg" role="group" aria-label="גודל טקסט">
      <button data-fs="" aria-pressed="${!s.fs}">רגיל</button><button data-fs="big" aria-pressed="${s.fs === 'big'}">גדול</button><button data-fs="bigger" aria-pressed="${s.fs === 'bigger'}">גדול מאוד</button></div>
    <label class="check"><input type="checkbox" data-a11y="contrast" ${s.contrast ? 'checked' : ''}><span>ניגודיות גבוהה</span></label>
    <label class="check"><input type="checkbox" data-a11y="nomotion" ${s.nomotion ? 'checked' : ''}><span>ביטול אנימציות</span></label>
    <p class="small muted">אפשר גם להגדיל את התצוגה בתנועת צביטה, ולהשתמש בקורא המסך של הטלפון.</p></div>
  <div class="card"><h2>הצהרת נגישות</h2>
    <p>האתר נבנה במטרה לעמוד בתקן הישראלי 5568 ברמה AA (המבוסס על WCAG 2.0): ניגודיות צבעים, אפשרות להגדלת טקסט, תמיכה בקוראי מסך, טקסט חלופי למפות ולתמונות, ניווט במקלדת, והבחנה בין מסלולים גם במספר ולא רק בצבע.</p>
    <p>האתר הוא מיזם בית ספרי שנבנה בזמן קצר בעזרת בינה מלאכותית, וייתכן שחלקים ממנו עדיין אינם נגישים במלואם. כל המידע החיוני נמסר גם על ידי הצוות, וניתן לקבל אותו בדרך מותאמת, כולל עותק מודפס.</p>
    <p><b>נתקלתם בקושי?</b> פנו לנדב שמגר, רכז הטיולים, או לכל מורה מלווה.</p></div>${footer()}`;
}
function aiNote() { return `<div class="card ai">🤖 <b>האתר והתוכן נבנו בעזרת בינה מלאכותית</b> ונבדקו על ידי הצוות, אך ייתכנו בהם טעויות ואי-דיוקים. בכל מקרה של ספק – הוראות הצוות הן הקובעות.</div>`; }
function viewAbout() {
  const ov = LS.get('overrides', null);
  return `<h1>אודות והצהרות</h1>
  <div class="card"><h2>טיול שנתי י"ב תשפ"ז</h2><p>מופק על ידי <b>מגמת גאוגרפיה, תיכון דה-שליט</b>.</p></div>
  ${aiNote()}
  <div class="card"><h2>מיזם בית ספרי לרווחת התלמידים</h2><p>האתר נוצר בבית הספר ללוות את הטיול השנתי של שכבת י"ב, לרווחת התלמידים ולשימוש פנים-בית-ספרי בלבד, ללא כוונות רווח. הוא כולל מפות, לוח זמנים, מידע על המסלולים, נהלים, תוכן העשרה וחידון.</p></div>
  <div class="card"><h2>שימוש רשות</h2><p>השימוש באתר הוא רשות ולא חובה. אין צורך בהתקנה ואין צורך בהרשמה. כל המידע החיוני נמסר גם על ידי הצוות.</p></div>
  <div class="card"><h2>לשימוש פנימי בלבד</h2><p>האתר מיועד לתלמידי השכבה ולצוות המלווה בלבד. אין להעביר אותו או את הקישור אליו מחוץ לטיול.</p></div>
  <div class="card"><h2>פרטיות</h2><ul>
    <li>האתר לא אוסף, לא שומר ולא שולח מידע אישי. אין בו הרשמה, ואין צורך להזין שם או כל פרט מזהה.</li>
    <li>המיקום, אם תאפשרו אותו, משמש רק להצגת הנקודה שלכם על המפה, בתוך הטלפון. הוא לא נשלח לאף אחד.</li>
    <li>הניקוד בחידון ורשימת הציוד נשמרים רק בטלפון שלכם.</li>
    <li>בבדיקת עדכונים, הטלפון מוריד תוכן מבית הספר ולא שולח שום מידע.</li>
    <li>האתר לא משתמש בעוגיות מעקב, בפרסומות או בשירותי סטטיסטיקה.</li>
    <li>המשוב אנונימי לחלוטין. לא נאספים שם, מייל או כל פרט מזהה.</li></ul></div>
  <div class="card"><h2>האתר אינו כלי בטיחות</h2><ul>
    <li>האתר נועד להסבר והעשרה בלבד. הוא אינו אמצעי ניווט ואינו כלי בטיחות.</li>
    <li>המפות להתמצאות בלבד, ואינן מדויקות לניווט בשטח.</li>
    <li>כל הנחיה בשטח ניתנת על ידי הצוות, והוראות הצוות קודמות תמיד.</li>
    <li>בזמן הליכה במסלול – הטלפון בכיס.</li></ul></div>
  <div class="card"><h2>מקורות</h2><p>התוכן הוכן בידי מגמת הגאוגרפיה בעזרת בינה מלאכותית, וייתכנו בו אי-דיוקים. תוואי המסלולים מבוסס על מפות סימון שבילים. נתוני מפה: © OpenStreetMap contributors, Natural Earth.</p>
  <p class="small muted">גרסת אתר ${APP_VERSION} · תוכן מ-${esc(C.updatedAt)}${ov ? ` · עדכון צוות מס' ${esc(ov.version)}${ov.date ? ' (' + esc(ov.date) + ')' : ''}` : ''}</p></div>${footer()}`;
}
function footer() { return `<p class="footer-note">🤖 נבנה בעזרת בינה מלאכותית – ייתכנו טעויות · מגמת גאוגרפיה, תיכון דה-שליט · <a href="#report">דיווח על טעות</a> · <a href="#about">אודות</a></p>`; }

/* ---------- map zoom + geolocation ---------- */
let zoom = 1;
function setZoom(dz) {
  const inner = $('#mapinner'), wrap = $('#mapwrap'); if (!inner) return;
  const old = zoom; zoom = Math.min(4, Math.max(1, zoom + dz * 0.5));
  const cx = (wrap.scrollLeft + wrap.clientWidth / 2) / (inner.offsetWidth || 1), cy = (wrap.scrollTop + wrap.clientHeight / 2) / (inner.offsetHeight || 1);
  inner.style.width = (zoom * 100) + '%';
  requestAnimationFrame(() => { wrap.scrollLeft = cx * inner.offsetWidth - wrap.clientWidth / 2; wrap.scrollTop = cy * inner.offsetHeight - wrap.clientHeight / 2; });
  if (old !== zoom) toast(zoom === 1 ? 'תצוגה מלאה' : `הגדלה ×${zoom}`);
}
function stopGeo() { if (geoWatch !== null) { navigator.geolocation.clearWatch(geoWatch); geoWatch = null; } }
function toggleGeo(btn) {
  const key = btn.dataset.geo, m = MAPS[key], msg = $('#geomsg'), dot = $('#geodot');
  if (geoWatch !== null) { stopGeo(); dot.hidden = true; btn.setAttribute('aria-pressed', 'false'); btn.textContent = '📍 הצג את המיקום שלי'; msg.textContent = 'הצגת המיקום כובתה.'; return; }
  if (!('geolocation' in navigator)) { msg.textContent = 'הטלפון לא תומך בהצגת מיקום.'; return; }
  if (!LS.get('geoExplained', false)) {
    return modal('הצגת המיקום על המפה', '<p>כדי להראות איפה אתם על המפה, הטלפון יבקש אישור לגישה למיקום.</p><p>המיקום מוצג רק אצלכם בטלפון ולא נשלח לאף אחד. אפשר לכבות בכל רגע.</p>',
      [['המשך', () => { LS.set('geoExplained', true); toggleGeo(btn); }], ['ביטול']]);
  }
  msg.textContent = 'מאתר מיקום…';
  btn.setAttribute('aria-pressed', 'true'); btn.textContent = '⏹ כבה הצגת מיקום';
  geoWatch = navigator.geolocation.watchPosition(p => {
    const { latitude: la, longitude: lo, accuracy } = p.coords;
    const kx = (m.vbH / (m.lat0 - m.lat1)) * Math.cos(m.latRef * Math.PI / 180);
    const x = (lo - m.lon0) * kx / m.vbW, y = (m.lat0 - la) / (m.lat0 - m.lat1);
    if (x < 0 || x > 1 || y < 0 || y > 1) { dot.hidden = true; msg.textContent = 'המיקום שלך מחוץ לתחום המפה הזאת.'; return; }
    dot.hidden = false; dot.style.left = (x * 100) + '%'; dot.style.top = (y * 100) + '%';
    msg.textContent = `המיקום שלך מסומן בנקודה כחולה (דיוק של כ-${Math.round(accuracy)} מ').`;
  }, err => { msg.textContent = err.code === 1 ? 'לא ניתן אישור לגישה למיקום. אפשר לשנות זאת בהגדרות הטלפון.' : 'לא הצלחנו לאתר מיקום כרגע. נסו שוב בשטח פתוח.'; stopGeo(); btn.setAttribute('aria-pressed', 'false'); btn.textContent = '📍 הצג את המיקום שלי'; },
  { enableHighAccuracy: true, maximumAge: 15000, timeout: 30000 });
}

/* ---------- router ---------- */
const TITLES = { now: 'עכשיו', schedule: 'לוח זמנים', maps: 'מפות', quiz: 'חידון', more: 'עוד', routes: 'המסלולים', rules: 'נהלים', learn: 'העשרה', checklist: 'רשימת ציוד', feedback: 'משוב', install: 'התקנה והסרה', report: 'דיווח על טעות', a11y: 'נגישות', about: 'אודות' };
function route() {
  stopGeo(); zoom = 1;
  const h = (location.hash || '#now').slice(1);
  const [page, arg] = h.includes('-') ? [h.slice(0, h.indexOf('-')), h.slice(h.indexOf('-') + 1)] : [h, null];
  const views = { now: viewNow, schedule: viewSchedule, maps: viewMaps, quiz: () => viewQuiz(arg), more: viewMore, routes: viewRoutes, route: () => viewRoute(arg),
    report: viewReport, rules: viewRules, learn: () => viewLearn(arg), checklist: viewChecklist, feedback: viewFeedback, install: viewInstall, a11y: viewA11y, about: viewAbout };
  const v = views[page] || viewNow;
  $('#main').innerHTML = v();
  const tab = { now: 'now', schedule: 'schedule', maps: 'maps', quiz: 'quiz' }[page] || 'more';
  document.querySelectorAll('.tabbar a').forEach(a => { if (a.dataset.tab === tab) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  document.title = (TITLES[page] || 'טיול') + ' · טיול שנתי י"ב';
}
window.addEventListener('hashchange', () => { if (!$('#modal').hidden) $('#modal').hidden = true; route(); window.scrollTo(0, 0); $('#main').focus({ preventScroll: true }); });

document.addEventListener('click', e => {
  const t = e.target.closest('button, [data-act]'); if (!t) return;
  if (t.dataset.act === 'update') return checkUpdates();
  if (t.dataset.day) { LS.set('schedDay', t.dataset.day); return route(); }
  if (t.dataset.map) { LS.set('mapSel', t.dataset.map); return route(); }
  if (t.dataset.openmap) { LS.set('mapSel', 'eilat'); location.hash = '#maps'; return; }
  if (t.dataset.zoom) return setZoom(+t.dataset.zoom);
  if (t.dataset.geo) return toggleGeo(t);
  if (t.dataset.ans !== undefined && t.classList.contains('quiz-opt')) return answer(t);
  if (t.dataset.os) { LS.set('os', t.dataset.os); return route(); }
  if (t.dataset.fs !== undefined) { const s = LS.get('a11y', {}); s.fs = t.dataset.fs; LS.set('a11y', s); applyA11y(); return route(); }
  if (t.id === 'a11yBtn') { location.hash = '#a11y'; }
});
document.addEventListener('change', e => {
  const t = e.target;
  if (t.dataset.check !== undefined) { const d = LS.get('check', {}); d[t.dataset.check] = t.checked; LS.set('check', d); t.closest('.check').classList.toggle('done', t.checked); }
  if (t.dataset.a11y) { const s = LS.get('a11y', {}); s[t.dataset.a11y] = t.checked; LS.set('a11y', s); applyA11y(); }
});
function applyA11y() { const s = LS.get('a11y', {}); document.body.classList.toggle('big', s.fs === 'big'); document.body.classList.toggle('bigger', s.fs === 'bigger'); document.body.classList.toggle('contrast', !!s.contrast); document.body.classList.toggle('nomotion', !!s.nomotion); }

/* ---------- offline status ---------- */
async function netStatus() {
  const chip = $('#netchip'); let ready = false;
  try { ready = !!(await caches.has('trip12-' + APP_VERSION)) && LS.get('cached', false); } catch (e) {}
  const on = navigator.onLine;
  chip.textContent = ready ? '✓ ללא רשת' : (on ? '⏳ שומר…' : '⚠ אין חיבור');
  chip.setAttribute('aria-label', ready ? (on ? 'האתר שמור ומוכן לעבודה ללא אינטרנט' : 'אין חיבור – האתר עובד מהזיכרון') : (on ? 'שומר את האתר לשימוש ללא אינטרנט' : 'אין חיבור לאינטרנט'));
  chip.title = chip.getAttribute('aria-label');
}
window.addEventListener('online', netStatus); window.addEventListener('offline', netStatus);
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', e => { if (e.data === 'cached') { LS.set('cached', true); netStatus(); } });
  navigator.serviceWorker.register('sw.js').then(reg => navigator.serviceWorker.ready).then(r => { r.active && r.active.postMessage('check'); }).catch(() => {});
}

/* ---------- start ---------- */
(async function init() {
  applyA11y();
  try { BASE = await (await fetch('data/content.json')).json(); }
  catch (e) { $('#main').innerHTML = '<div class="card notice">לא הצלחנו לטעון את התוכן. פתחו את האתר פעם אחת עם אינטרנט.</div>'; return; }
  rebuild(); route(); netStatus();
  if (!LS.get('agreed', false)) {
    modal('ברוכים הבאים לאתר הטיול', `<p><b>טיול שנתי י"ב תשפ"ז</b> – מופק על ידי מגמת גאוגרפיה, תיכון דה-שליט.</p>
      <ul><li>מיזם בית ספרי לרווחת התלמידים, לשימוש פנימי בלבד וללא כוונות רווח. אין להעביר את הקישור מחוץ לטיול.</li>
      <li>השימוש רשות. אין הרשמה, ואין איסוף מידע אישי.</li>
      <li>🤖 האתר והתוכן נבנו בעזרת בינה מלאכותית – ייתכנו טעויות.</li>
      <li>האתר אינו כלי ניווט או בטיחות. הוראות הצוות קודמות תמיד.</li></ul>
      <p class="small"><a href="#about">לקריאת ההצהרות המלאות</a></p>`, [['קראתי והבנתי', () => LS.set('agreed', true)]]);
  }
})();
