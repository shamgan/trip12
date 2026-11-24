/* טיול שנתי י"ב תשפ"ז – אתר הטיול. ללא איסוף מידע: הכול נשמר מקומית בטלפון (localStorage). */
'use strict';

const APP_VERSION = '2.5.7';
const LETTERS = ["א'", "ב'", "ג'", "ד'"];
const MAPS = {
  eilat: { title: 'הרי אילת', img: 'maps/eilat.webp', lat0: 29.72, lat1: 29.48, lon0: 34.84, lon1: 35.03, latRef: 29.6, vbW: 688.4, vbH: 1000,
    alt: 'מפת הרי אילת עם שלושת המסלולים: 1 נחל אמיר, 2 הר צפחות, 3 הקניון האדום, כבישים 90 ו-12 ודרכי העפר אל המסלולים.' },
  israel: { title: 'ישראל', img: 'maps/israel.webp', lat0: 33.42, lat1: 29.40, lon0: 34.15, lon1: 36.85, latRef: 31.4, vbW: 768, vbH: 1340,
    alt: 'מפת ישראל עם הכבישים הראשיים, ערים מרכזיות, רחובות כנקודת היציאה, עבדת כעצירה בהלוך, ואזור אילת מוגדל עם המסלולים וחניון יעלים.' },
  red: { title: 'הקניון האדום', img: 'maps/route-red.webp', lat0: 29.689701, lat1: 29.671079, lon0: 34.868858, lon1: 34.897415, latRef: 29.6, vbW: 900, vbH: 675,
    alt: 'מפה מפורטת של מסלול 3, הקניון האדום: קו המסלול המעגלי, נקודת ההתחלה והסיום בירוק, וכבישים ודרכי עפר בסביבה.' },
  amir: { title: 'נחל אמיר והר אמיר', img: 'maps/route-amir.webp', lat0: 29.658068, lat1: 29.620923, lon0: 34.921772, lon1: 34.953813, latRef: 29.6, vbW: 900, vbH: 1200,
    alt: 'מפה מפורטת של מסלול 1, נחל אמיר והר אמיר: קו המסלול, נקודת התחלה בירוק ונקודת סיום באדום, וכבישים ודרכי עפר בסביבה.' },
  tzfachot: { title: 'הר צפחות', img: 'maps/route-tzfachot.webp', lat0: 29.532915, lat1: 29.502266, lon0: 34.89887, lon1: 34.936728, latRef: 29.6, vbW: 900, vbH: 838,
    alt: 'מפה מפורטת של מסלול 2, הר צפחות: קו המסלול, נקודת התחלה בירוק ונקודת סיום באדום, וכבישים ודרכי עפר בסביבה.' }};

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
  /* לו"ז מהגיליון גובר, אלא אם הוא עדיין מכיל שורה ישנה שידוע שהוחלפה (staleSheet) – אז נשאר הלו"ז המעודכן מהאתר עד שהגיליון יתוקן */
  const stale = base.staleSheet || {};
  if (ov.schedule) c.days.forEach(d => { const it = ov.schedule[d.id];
    if (it && it.length && !(stale[d.id] && it.some(x => x.text === stale[d.id][0] && x.time === stale[d.id][1]))) d.items = it; });
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
  // אבטחה: רק שדות טקסט של תוכן. לא מזהים, קישורים, תאריכים, תשובות או שדות מערכת.
  const BLOCK = /^(__proto__|prototype|constructor|id|src|updatesUrl|tripDates|date|unlock|route|day|a|num|type|lat|lon|photos|mapImage|game|extras|forecastPlaces|thresholds|personalGoal|inviteTtlSec|pointsPerCorrect|contentVersion|feedback)$/;
  if (!/^(days|routes|rules|learn|quiz|checklist|allergy)$/.test(parts[0]) || parts.some(p => BLOCK.test(p)) || String(val).length > 600) return;
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
/* גיליון העדכונים: עמודות type | key | value | time
   meta,status,active/ended · meta,date,<טקסט> · meta,changes,<מה השתנה>
   schedule,d1|d2|d3,<פעילות>,<שעה>  · notice,,<הודעה> · checklist,,<פריט>
   phone,<שם>,<מספר> · feedback,d1|d2|d3|final|report,<קישור> · fix,<נתיב>,<טקסט חדש>
   שורות שמתחילות ב-# הן הערות. גרסה מחושבת אוטומטית מתוכן הגיליון – כל שינוי הוא עדכון חדש. */
function normTime(t) { const m = /^(\d{1,2}):(\d{2})/.exec(String(t || '').trim()); return m ? m[1].padStart(2, '0') + ':' + m[2] : ''; }
function hashRows(rows) { const s = JSON.stringify(rows.filter(r => !(r[0] || '').trim().startsWith('#'))); let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }
function sheetToOverrides(rows) {
  const ov = { version: hashRows(rows), date: '', changes: '', status: 'active', schedule: {}, notices: [], checklist: [], phones: [], feedback: {}, fixes: [] };
  rows.forEach(r => {
    const [type, key, value, extra] = [(r[0] || '').trim().toLowerCase(), (r[1] || '').trim(), (r[2] || '').trim(), (r[3] || '').trim()];
    if (type === 'meta') { if (key === 'status') ov.status = value.toLowerCase() || 'active'; else if (key === 'date') ov.date = value; else if (key === 'changes') ov.changes = value; }
    else if (type === 'schedule' && /^d\d$/.test(key) && value) (ov.schedule[key] = ov.schedule[key] || []).push({ time: normTime(extra), text: value });
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
  /* בדיקת גרסה חדשה של האתר עצמו (קוד, מפות, תוכן קבוע) */
  try {
    const sw = await fetch('sw.js?t=' + Date.now(), { cache: 'no-store' });
    const m = sw.ok && (await sw.text()).match(/CACHE\s*=\s*'trip12-([\w.]+)'/);
    if (m && m[1] !== APP_VERSION) {
      try { const reg = await navigator.serviceWorker.getRegistration(); reg && reg.update(); } catch (e) {}
      return modal('יש גרסה חדשה של האתר 🆕', `<p>הגרסה בטלפון: ${esc(APP_VERSION)} · גרסה חדשה: ${esc(m[1])}.</p>
        <p><b>כדי לקבל אותה:</b> סגרו את האתר לגמרי ופתחו אותו מחדש.</p>
        <ul class="small"><li><b>אם הותקן כאפליקציה:</b> סוגרים אותו גם מרשימת האפליקציות הפתוחות (מחליקים למעלה) ופותחים שוב מהאייקון.</li>
        <li><b>אם נפתח בדפדפן:</b> סוגרים את הלשונית ופותחים שוב את הקישור.</li></ul>
        <p class="small muted">אחרי הפתיחה מחדש לחצו שוב "בדוק עדכונים" כדי לקבל גם את העדכונים מהצוות.</p>`, [['הבנתי']]);
    }
  } catch (e) {}
  if (!C.updatesUrl) return modal('אין עדכונים כרגע', '<p>יש לך את הגרסה העדכנית. הצוות מעדכן את האתר מדי פעם.</p>', [['סגור']]);
  try {
    const res = await fetch(C.updatesUrl + (C.updatesUrl.includes('?') ? '&' : '?') + 't=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) throw new Error(res.status);
    const ov = sheetToOverrides(parseCSV(await res.text()));
    const cur = LS.get('overrides', null);
    if (cur && ov.version === cur.version) return modal('אין עדכון חדש', '<p>יש לך את הגרסה העדכנית.</p>', [['סגור']]);
    modal('יש עדכון חדש', `<p><b>מה השתנה:</b> ${esc(ov.changes || 'עדכון מידע מהצוות')}</p>${ov.date ? `<p class="small muted">עודכן: ${esc(ov.date)}</p>` : ''}<p>להוריד את העדכון לטלפון?</p>`,
      [['הורד עדכון', () => { if (!ov.date) ov.date = new Date().toLocaleString('he-IL', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' }); LS.set('overrides', ov); LS.set('lastCheck', new Date().toISOString()); rebuild(); route(); toast('העדכון הורד בהצלחה'); }], ['לא עכשיו']]);
  } catch (e) {
    modal('לא הצלחנו לבדוק עדכונים', '<p>ייתכן שהקליטה חלשה. האתר ממשיך לעבוד עם המידע הקיים.</p>', [['סגור']]);
  }
}
function updateCard() {
  const v = LS.get('overrides', null);
  return `<div class="card soft update-strip"><div><b>🔄 עדכונים מהצוות</b><div class="small muted">${v && v.date ? 'עודכן לאחרונה: ' + esc(v.date) : 'הצוות מעדכן מדי פעם – בדקו כשיש קליטה'}</div></div>
    <button class="btn secondary" data-act="update">בדוק עדכונים</button></div>`;
}
/* ---------- end of trip: deactivate ---------- */
function isEnded() {
  if (LS.get('ended', false)) return true;
  const end = Date.parse(C.tripDates.end + 'T23:59:59+02:00') + (C.endDays || 14) * 864e5;
  return Date.now() > end;
}
function endApp() {
  try { Object.keys(localStorage).filter(k => k.startsWith('trip12.')).forEach(k => localStorage.removeItem(k)); } catch (e) {}
  LS.set('ended', true); stopGeo();
}
async function checkEndFlag() {
  // בדיקה שקטה, רק אם יש אינטרנט: האם הצוות הודיע שהטיול הסתיים. לא נשלח שום מידע.
  if (!navigator.onLine || !C.updatesUrl || LS.get('ended', false)) return;
  try {
    const res = await fetch(C.updatesUrl + (C.updatesUrl.includes('?') ? '&' : '?') + 't=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) return;
    const ov = sheetToOverrides(parseCSV(await res.text()));
    if (ov.status === 'ended') { endApp(); route(); }
  } catch (e) {}
}
function viewEnded() {
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  return `<div class="card" style="text-align:center;margin-top:20px"><div style="font-size:3rem" aria-hidden="true">🏜️</div>
    <h1>הטיול הסתיים</h1><p>תודה שטיילתם איתנו! מקווים שנהניתם.</p><p class="muted">אתר הטיול כבר לא פעיל. כל המידע שנשמר בטלפון (ניקוד, סימונים) נמחק.</p>
    <p><b>עכשיו אפשר למחוק את האתר מהטלפון:</b></p></div>
  <div class="card"><h2>${ios ? 'אייפון' : 'אנדרואיד'}</h2><ol class="steps">${ios
    ? '<li>לחיצה ארוכה על האייקון "טיול י״ב" במסך הבית.</li><li>בוחרים <b>"הסר אפליקציה"</b> או <b>"מחק סימניה"</b> ומאשרים.</li><li>למחיקת שאריות: הגדרות ← Safari ← מתקדם ← נתוני אתרים ← מחיקת האתר.</li>'
    : '<li>לחיצה ארוכה על האייקון "טיול י״ב" במסך הבית.</li><li>בוחרים <b>"הסרה"</b> ומאשרים.</li><li>למחיקת שאריות: Chrome ← ⋮ ← הגדרות ← הגדרות אתרים ← כל האתרים ← בוחרים את האתר ← "ניקוי והאפסה".</li>'}</ol>
    <p class="small muted">לא הוספתם את האתר למסך הבית? אין מה למחוק – פשוט סגרו את הלשונית.</p></div>
  <div class="card"><h2>${ios ? 'אנדרואיד' : 'אייפון'}</h2><ol class="steps">${ios
    ? '<li>לחיצה ארוכה על האייקון במסך הבית.</li><li>בוחרים <b>"הסרה"</b> ומאשרים.</li>'
    : '<li>לחיצה ארוכה על האייקון במסך הבית.</li><li>בוחרים <b>"הסר אפליקציה"</b> או <b>"מחק סימניה"</b> ומאשרים.</li>'}</ol></div>
  <p class="footer-note">מגמת גאוגרפיה, תיכון דה-שליט · נבנה בעזרת בינה מלאכותית</p>`;
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

function allergyCard(big) { const x = C.allergy; if (!x) return '';
  return big ? `<div class="card allergy" role="note"><h2><span aria-hidden="true">🥜</span> ${esc(x.title)}</h2><p>${esc(x.text)}</p><p class="small">${esc(x.tip)}</p></div>`
             : `<div class="strip" role="note"><b><span aria-hidden="true">🥜</span> ${esc(x.title)}.</b> ${esc(x.text)}</div>`; }
function heroBlock(img, alt, kicker, title, extra = '') {
  return `<section class="hero" style="background-image:url('${esc(img)}')"><span class="sr-only">${esc(alt)}</span>
    ${extra}<div class="hero-txt"><div class="hero-k">${kicker}</div><h1>${esc(title)}</h1></div></section>`;
}
function dayChips(active) {
  return `<nav class="daychips" aria-label="ימי הטיול">${C.days.map((x, i) => `<a href="#schedule" data-goday="${x.id}" class="${x.id === active ? 'on' : ''}" ${x.id === active ? 'aria-current="date"' : ''}>יום ${i + 1}<small>${fmtDate(x.date)}</small></a>`).join('')}</nav>`;
}
function nextCard(day) {
  const i = nextItemIndex(day); const it = i >= 0 ? day.items[i] : day.items[0];
  const after = i >= 0 ? day.items[i + 1] : day.items[1];
  return `<a class="next" href="#schedule" data-goday="${day.id}"><div class="next-t">${it.time ? esc(it.time) : '•'}<small>${i >= 0 ? 'הבא בתור' : 'מתחילים'}</small></div>
    <div><b>${esc(it.text)}</b>${after ? `<p>${after.time ? `<b class="at">ב-${esc(after.time)}</b> ` : 'אחר כך: '}${esc(after.text)}</p>` : ''}</div></a>`;
}
function photoTiles() {
  const ph = id => { const r = routeOf(id); return r && r.photos && r.photos[0] ? r.photos[0].src : ''; };
  return `<div class="tiles">
    <a class="tile photo" href="#routes" style="background-image:url('${ph('amir')}')"><span>המסלולים</span></a>
    <a class="tile photo" href="#maps" style="background-image:url('${ph('tzfachot')}')"><span>מפות</span></a>
    <a class="tile c-sea" href="#quiz"><i aria-hidden="true">❓</i><span>חידון</span></a>
    <a class="tile c-sun" href="#rules"><i aria-hidden="true">📋</i><span>נהלים</span></a></div>`;
}
function viewNow() {
  const t = today(), d = todayDay();
  let h = '';
  const notices = C.notices.map(n => `<div class="strip info" role="note"><b>📣 הודעה מהצוות:</b> ${esc(n)}</div>`).join('');
  const notSaved = (!navigator.serviceWorker || !navigator.serviceWorker.controller) ? `<div class="strip info"><b>📲 האתר עוד לא שמור בטלפון.</b> השאירו אותו פתוח עם אינטרנט עד שיופיע "✓ נשמר בטלפון". <a href="#install">איך שומרים</a></div>` : '';
  if (t < C.tripDates.start) {
    const days = Math.round((new Date(C.tripDates.start) - new Date(t)) / 864e5);
    const r = routeOf(C.days[0].route);
    h += heroBlock(r.photos[0].src, r.photos[0].alt, 'לקראת הטיול · הרי אילת', days === 1 ? 'מחר יוצאים!' : `עוד ${days} ימים`);
    h += dayChips(null) + '<div class="pad">' + notices + allergyCard() + notSaved;
    h += `<h2 class="sec-h">היום הראשון</h2>` + nextCard(C.days[0]);
    h += `<div class="card soft"><h2>לפני שיוצאים</h2><ol class="steps"><li>מחכים שלמעלה יופיע <b>"✓ נשמר בטלפון"</b>.</li><li>מוסיפים למסך הבית (רשות).</li><li>עוברים על הנהלים ועל רשימת הציוד.</li></ol>
      <div class="row"><a class="btn" href="#install">📲 שמירה בטלפון</a><a class="btn secondary" href="#checklist">🎒 ציוד</a></div></div>`;
  } else if (d) {
    const r = routeOf(d.route); const n = C.days.indexOf(d) + 1;
    h += heroBlock(r.photos[0].src, r.photos[0].alt, `${esc(d.weekday)} · יום ${n} מתוך ${C.days.length}`, d.title);
    h += dayChips(d.id) + '<div class="pad">' + notices + window.TripExtras.forecastCard() + (d.id === C.days[0].id ? allergyCard() : '') + notSaved;
    h += nextCard(d) + window.TripExtras.challengeCard();
    h += `<a class="routecard" href="#route-${r.id}"><img src="${esc((r.photos[1] || r.photos[0]).src)}" alt=""><div><div class="kicker">המסלול של היום</div><b>${badge(r)}${esc(r.name)}</b><span>${esc(r.facts.slice(0, 2).map(f => f[1]).join(' · '))}</span></div></a>`;
    h += `<a class="strip feedback" href="#feedback"><b>💬 משוב יומי</b> – ספרו לנו איך היה. אנונימי לגמרי.</a>`;
  } else {
    const r = routeOf('tzfachot');
    h += heroBlock(r.photos[0].src, r.photos[0].alt, 'הרי אילת · תשפ"ז', 'תודה שטיילתם איתנו!');
    h += '<div class="pad">' + notices + `<div class="card"><p>נשמח לשמוע מה חשבתם על הטיול כולו. המשוב אנונימי לגמרי.</p><a class="btn block" href="#feedback">משוב סיום הטיול</a></div>`;
  }
  h += photoTiles() + `<div class="tiles two"><a class="tile c-sea2" href="#bus"><i aria-hidden="true">🚌</i><span>משחקי אוטובוס</span></a><a class="tile c-night" href="#sky"><i aria-hidden="true">🌌</i><span>שמי הלילה</span></a></div><a class="gamecard" href="#game"><span aria-hidden="true">✨</span><div><b>שמי המדבר</b><small>משחק שיתופי בזוגות – כל חבר/ה חדש/ה = כוכב</small></div></a>` + updateCard() + footer() + '</div>';
  return h;
}

function viewSchedule() {
  const sel = LS.get('schedDay', (todayDay() || C.days[0]).id);
  const d = C.days.find(x => x.id === sel) || C.days[0];
  return `<h1>לוח זמנים</h1>
    <div class="daytabs" role="tablist" aria-label="בחירת יום">${C.days.map((x, i) => `<button role="tab" aria-selected="${x.id === d.id}" data-day="${x.id}">יום ${i + 1}<span class="sub">${fmtDate(x.date)}</span></button>`).join('')}</div>
    <div class="card" role="tabpanel"><div class="kicker">${esc(d.weekday)}</div><h2>${esc(d.title)}</h2>${schedList(d, d.date === today())}</div>
    <p class="small muted">הלו"ז עשוי להשתנות. הוראות הצוות בשטח הן הקובעות.</p>${updateCard()}${footer()}`;
}

function mapViewer(key, opts = {}) {
  return `${opts.geo ? `<button class="btn block" data-geo="${key}" aria-pressed="false">📍 הצג את המיקום שלי</button>` : ''}
    <div class="maptools">
      <button class="btn secondary" data-zoom="1" aria-label="הגדל מפה">＋ הגדל</button>
      <button class="btn secondary" data-zoom="-1" aria-label="הקטן מפה">－ הקטן</button>
    </div>
    <div class="mapwrap" id="mapwrap"><div class="mapinner" id="mapinner" style="width:100%">
      <img src="${esc(opts.img)}" alt="${esc(opts.alt)}"><div class="dot" id="geodot" hidden></div></div></div>
    <div id="geomsg" class="small" role="status" aria-live="polite"></div>
    ${opts.credit ? `<div class="credit">${opts.credit}</div>` : ''}`;
}
function viewMaps() {
  let sel = LS.get('mapSel', 'eilat'); if (!MAPS[sel]) sel = 'eilat';
  const tabs = [['eilat', 'הרי אילת'], ['israel', 'ישראל'], ['red', 'יום 1: הקניון האדום'], ['amir', 'יום 2: נחל אמיר'], ['tzfachot', 'יום 3: הר צפחות']];
  const m = MAPS[sel];
  const body = mapViewer(sel, { img: m.img, alt: m.alt, geo: true, credit: 'נתוני גבולות וחוף: © OpenStreetMap contributors, Natural Earth. תוואי המסלולים מבוסס על מפות סימון שבילים. המפה להתמצאות בלבד – לא לניווט.' });
  return `<h1>מפות</h1><div class="seg" role="group" aria-label="בחירת מפה">${tabs.map(([k, l]) => `<button data-map="${k}" aria-pressed="${k === sel}">${esc(l)}</button>`).join('')}</div>
    ${sel === 'eilat' ? '<p class="small">מסלול 1: נחל אמיר · מסלול 2: הר צפחות · מסלול 3: הקניון האדום</p>' : ''}
    ${routeOf(sel) ? `<p class="small"><span style="color:#2e7d32" aria-hidden="true">●</span> ירוק: נקודת התחלה${sel === 'red' ? ' וסיום (מסלול מעגלי)' : ' · <span style="color:#c62828" aria-hidden="true">●</span> אדום: נקודת סיום'} · קו מקווקו: דרך עפר. התוואי מקורב.</p>` : ''}
    ${body}<p class="small muted">המיקום מוצג רק בטלפון שלך ולא נשלח לאף אחד. ה-GPS עובד גם בלי קליטה, אבל צורך סוללה – כבו אותו כשלא צריך.</p>${footer()}`;
}
function viewRoutes() {
  return `<h1>המסלולים</h1>` + C.days.map((d, i) => { const r = routeOf(d.route); const p = (r.photos || [])[0];
    return `<a class="routecard big" href="#route-${r.id}">${p ? `<img src="${esc(p.src)}" alt="">` : ''}<div><div class="kicker">יום ${i + 1} · ${esc(d.weekday)} ${fmtDate(d.date)}</div><b>${badge(r)}${esc(r.name)}</b><span>${esc(r.facts.slice(0, 2).map(f => f[1]).join(' · '))}</span></div></a>`; }).join('') +
    `<div class="card soft"><h2>⛺ לינה: חאן יעלים</h2><p>בצומת יטבתה, כ-150 מטר מזרחית לפונדק יטבתה. שני הלילות של הטיול.</p></div>
     <div class="card soft"><h2>🏬 אייס מול, אילת</h2><p>ביקור ביום השלישי, אחרי מסלול הר צפחות ואום רשרש. <a href="#rules">הנהלים לאייס מול</a></p></div>` + footer();
}
function viewRoute(id) {
  const r = routeOf(id); if (!r) return viewRoutes();
  const d = C.days.find(x => x.id === r.day); const n = C.days.indexOf(d) + 1;
  const fact = k => (r.facts.find(f => f[0] === k) || [, ''])[1];
  const stats = [[fact('אורך').replace('כ-', '').replace(' ק"מ', ''), 'ק"מ'], [fact('דרגת קושי'), 'דרגת קושי'], [fact('סוג').split(' ')[0], 'סוג מסלול']].filter(s => s[0]);
  const other = r.facts.filter(f => !['אורך', 'דרגת קושי', 'סוג'].includes(f[0]));
  const photos = r.photos || []; const hp = photos[1] || photos[0];
  return heroBlock(hp.src, hp.alt, `יום ${n} · ${esc(d.weekday)} ${fmtDate(d.date)}`, r.name, `<a class="hero-back" href="#routes">→ כל המסלולים</a>`).replace('<h1>', `<h1>${badge(r)}`) +
    `<div class="stats">${stats.map(([v, l]) => `<div><b>${esc(v)}</b><small>${esc(l)}</small></div>`).join('')}</div><div class="pad">
    <div class="card"><h2>על המסלול</h2><p>${esc(r.about)}</p>
      <dl class="facts">${other.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl></div>
    ${photos.length ? `<div class="thumbs">${photos.map(p => `<figure><img src="${esc(p.src)}" alt="${esc(p.alt)}" loading="lazy"><figcaption>${esc(p.alt)}</figcaption></figure>`).join('')}</div><p class="small muted">צילום: נדב שמגר, מגמת גאוגרפיה (טיול תשפ"ו)</p>` : ''}
    <div class="card warn"><h2>⚠️ דגשים למסלול</h2>${r.rules.map(t => `<div class="rule"><span aria-hidden="true">•</span><div>${esc(t)}</div></div>`).join('')}
      <a class="textlink" href="#rules">כל הנהלים ←</a></div>
    <div class="row"><a class="btn" href="#learn-${r.id}">🪨 העשרה</a><button class="btn secondary" data-openmap="${r.id}">🗺️ על המפה</button></div>
    ${footer()}</div>`;
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
  return `<p><a class="textlink" href="#learn">→ כל נושאי ההעשרה</a></p><h1>${esc(l.title)}</h1>` +
    l.cards.map(c => `<article class="card"><h2>${esc(c.title)}</h2><p>${esc(c.text)}</p>${c.ask ? `<p class="small"><b>שאלה למחשבה:</b> ${esc(c.ask)}</p>` : ''}</article>`).join('') + footer();
}

function viewChecklist() {
  const done = LS.get('check', {});
  return `<h1>רשימת ציוד</h1>${allergyCard(true)}<p class="small muted">הסימונים נשמרים רק בטלפון שלך.</p><div class="card">` +
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
  const T = (href, e, l, c) => `<a class="tile ${c}" href="#${href}"><i aria-hidden="true">${e}</i><span>${l}</span></a>`;
  return `<h1>עוד</h1><div class="tiles">
    ${T('game', '✨', 'שמי המדבר – משחק', 'c-night')}${T('bus', '🚌', 'משחקי אוטובוס', 'c-sea2')}${T('sky', '🌌', 'שמי הלילה', 'c-night2')}${T('routes', '🥾', 'המסלולים', 'c-terra')}${T('learn', '🪨', 'העשרה', 'c-sea')}
    ${T('rules', '📋', 'נהלים', 'c-sun')}${T('checklist', '🎒', 'רשימת ציוד', 'c-sand')}
    ${T('feedback', '💬', 'משוב אנונימי', 'c-sand')}${T('report', '🛠️', 'דיווח על טעות', 'c-sand')}
    ${T('install', '📲', 'התקנה והסרה', 'c-sand')}${T('a11y', '♿', 'נגישות', 'c-sand')}
    ${T('about', 'ℹ️', 'אודות והצהרות', 'c-sand')}</div><br>${phones}${updateCard()}${footer()}`;
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
    return `<p><a class="textlink" href="#quiz">→ כל הפרקים</a></p><div class="card"><h1>סיימת את הפרק!</h1><div class="score">${s.score}</div><p>מתוך ${ch.questions.length * C.quiz.pointsPerCorrect} נקודות אפשריות.</p></div>` +
      ch.questions.map((q, i) => `<div class="card"><b>${i + 1}. ${esc(q.q)}</b><p class="small">התשובה הנכונה: ${esc(q.o[q.a])}</p><p class="small muted">${esc(q.e)}</p></div>`).join('') + footer();
  }
  const q = ch.questions[idx], order = s.order[idx];
  return `<p><a class="textlink" href="#quiz">→ כל הפרקים</a></p><div class="small muted">${esc(ch.title)} · שאלה ${idx + 1} מתוך ${ch.questions.length}</div>
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
  const installed = isStandalone();
  return `<h1>📲 התקנה כאפליקציה</h1>
  ${installed ? `<div class="strip info"><b>✓ האפליקציה כבר מותקנת אצלכם.</b> אפשר לפתוח אותה מהאייקון במסך הבית.</div>` : ''}
  ${installEvt && !installed ? `<button class="btn block" data-act="doinstall">📲 התקנה עכשיו</button>` : ''}
  <div class="card"><h2>למה כדאי?</h2><ul class="benefits">
    <li><b>אייקון במסך הבית</b> – נפתח בלחיצה אחת, במסך מלא, כמו כל אפליקציה.</li>
    <li><b>עובד בלי קליטה</b> – המפות, הלו"ז, הנהלים, החידון והמשחק שמורים בטלפון.</li>
    <li><b>קל וחסכוני</b> – לא תופס כמעט מקום, ולא צריך חנות אפליקציות.</li>
    <li><b>תמיד מעודכן</b> – כשיש קליטה, העדכונים מהצוות מגיעים בלחיצה על "בדוק עדכונים".</li></ul>
    <p class="small muted">ההתקנה היא רשות. אפשר גם להשתמש בקישור רגיל בדפדפן.</p></div>
  <div class="card ai"><h2>🔒 בטוח ופרטי</h2><ul class="benefits">
    <li>זה אתר של בית הספר – לא אפליקציה של חברה חיצונית, בלי פרסומות ובלי מטרות רווח.</li>
    <li><b>אין הרשמה ואין איסוף מידע.</b> לא מבקשים שם, טלפון או מייל, ושום מידע לא נשלח לאף אחד.</li>
    <li><b>אין הרשאות מיוחדות.</b> ההתקנה לא מבקשת גישה לשום דבר בטלפון. רק אם תבחרו בעצמכם, הטלפון ישאל: מיקום – כדי להציג אתכם על המפה; מצלמה – כדי לסרוק קוד במשחק. אפשר לסרב, וכל השאר ימשיך לעבוד.</li>
    <li>אין שיתוף מידע עם גורמים אחרים, אין עוגיות מעקב ואין סטטיסטיקות.</li>
    <li>בסוף הטיול האתר נסגר, והמידע שנשמר בטלפון נמחק.</li></ul></div>
  <div class="seg" role="group" aria-label="סוג הטלפון"><button data-os="android" aria-pressed="${sel === 'android'}">אנדרואיד</button><button data-os="ios" aria-pressed="${sel === 'ios'}">אייפון</button></div>
  <div class="os ${sel === 'android' ? 'on' : ''}">
    <div class="card"><h2>התקנה – אנדרואיד</h2><ol class="steps">
      <li>פותחים את האתר בדפדפן <b>Chrome</b>.</li><li>לוחצים על תפריט שלוש הנקודות ⋮ למעלה.</li>
      <li>בוחרים <b>"הוספה למסך הבית"</b> או <b>"התקנת אפליקציה"</b> ומאשרים.</li><li>האייקון "טיול י״ב" יופיע במסך הבית.</li></ol></div>
    <div class="card"><h2>הסרה – אנדרואיד</h2><ol class="steps"><li>לחיצה ארוכה על האייקון במסך הבית.</li><li>בוחרים <b>"הסרה"</b> ומאשרים.</li>
      <li>למחיקת המידע השמור: Chrome ← ⋮ ← הגדרות ← הגדרות אתרים ← כל האתרים ← בוחרים את האתר ← "ניקוי והאפסה".</li></ol></div></div>
  <div class="os ${sel === 'ios' ? 'on' : ''}">
    <div class="card"><h2>התקנה – אייפון</h2><ol class="steps">
      <li>פותחים את האתר בדפדפן <b>Safari</b>.</li>
      <li>לוחצים על כפתור <b>השיתוף</b> (ריבוע עם חץ למעלה). בגרסאות חדשות: קודם <b>…</b> ליד שורת הכתובת, ואז "שיתוף".</li>
      <li>גוללים ובוחרים <b>"הוסף למסך הבית"</b>, ולוחצים <b>"הוסף"</b>.</li></ol></div>
    <div class="card"><h2>הסרה – אייפון</h2><ol class="steps"><li>לחיצה ארוכה על האייקון במסך הבית.</li><li>בוחרים <b>"הסר אפליקציה"</b> או <b>"מחק סימניה"</b> ומאשרים.</li>
      <li>למחיקת המידע השמור: הגדרות ← Safari ← מתקדם ← נתוני אתרים ← מחיקת האתר.</li></ol></div></div>
  <div class="card soft"><h2>שימוש בלי קליטה</h2><ol class="steps">
    <li>פותחים את האתר פעם אחת עם אינטרנט ומחכים לסימון <b>"✓ נשמר בטלפון"</b> למעלה.</li>
    <li>בודקים: מצב טיסה, סוגרים ופותחים שוב.</li>
    <li>באייפון כדאי לפתוח גם בערב שלפני הטיול.</li></ol>
    <p class="small muted">שמות הכפתורים יכולים להשתנות מעט בין דגמים. הסרה מוחקת גם את הניקוד והכוכבים השמורים.</p></div>
  <button class="btn secondary block" data-act="closeinstall">✕ סגירה</button>${footer()}`;
}
function viewA11y() {
  const s = LS.get('a11y', {});
  return `<h1>נגישות</h1><div class="card"><h2>התאמות</h2>
    <p>גודל טקסט:</p><div class="seg" role="group" aria-label="גודל טקסט">
      <button data-fs="" aria-pressed="${!s.fs}">רגיל</button><button data-fs="big" aria-pressed="${s.fs === 'big'}">גדול</button><button data-fs="bigger" aria-pressed="${s.fs === 'bigger'}">גדול מאוד</button></div>
    <label class="check"><input type="checkbox" data-a11y="contrast" ${s.contrast ? 'checked' : ''}><span>ניגודיות גבוהה</span></label>
    <label class="check"><input type="checkbox" data-a11y="nomotion" ${s.nomotion ? 'checked' : ''}><span>ביטול אנימציות</span></label>
    <p class="small muted">אפשר גם להגדיל את התצוגה בתנועת צביטה, ולהשתמש בקורא המסך של הטלפון.</p></div>
  ${window.TripExtras.modesCard()}
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
    <li>בבדיקת עדכונים, הטלפון מוריד תוכן מבית הספר ולא שולח שום מידע. בכל פתיחה עם אינטרנט האתר בודק בשקט רק דבר אחד – אם הצוות הודיע שהטיול הסתיים.</li>
    <li>בסיום הטיול האתר מפסיק לפעול, וכל המידע שנשמר בטלפון נמחק.</li>
    <li>האתר לא משתמש בעוגיות מעקב, בפרסומות או בשירותי סטטיסטיקה.</li>
    <li>בבוקר ימי הטיול, אם יש קליטה, האתר מוריד תחזית מזג אוויר משירות Open-Meteo – עבור מיקום המסלול הקבוע, לא המיקום שלכם. לא נשלח שום מידע עליכם.</li>
    <li>המשוב אנונימי לחלוטין. לא נאספים שם, מייל או כל פרט מזהה.</li></ul></div>
  <div class="card"><h2>האתר אינו כלי בטיחות</h2><ul>
    <li>האתר נועד להסבר והעשרה בלבד. הוא אינו אמצעי ניווט ואינו כלי בטיחות.</li>
    <li>המפות להתמצאות בלבד, ואינן מדויקות לניווט בשטח.</li>
    <li>כל הנחיה בשטח ניתנת על ידי הצוות, והוראות הצוות קודמות תמיד.</li>
    <li>בזמן הליכה במסלול – הטלפון בכיס.</li></ul></div>
  <div class="card"><h2>מקורות</h2><p>התוכן הוכן בידי מגמת הגאוגרפיה בעזרת בינה מלאכותית, וייתכנו בו אי-דיוקים. תוואי המסלולים מבוסס על מפות סימון שבילים. נתוני מפה: © OpenStreetMap contributors, Natural Earth.</p>
  <p class="small muted">גרסת אתר ${APP_VERSION} · תוכן מ-${esc(C.updatedAt)}${ov ? ` · עדכון צוות${ov.date ? ' מ-' + esc(ov.date) : ''}` : ''}</p></div>${footer()}`;
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
/* ---------- התקדמות במסלול / זמן נסיעה משוער (מחושב בטלפון בלבד, הערכה גסה) ---------- */
const TRACKS = {"amir":[[29.64827,34.94246],[29.64781,34.94194],[29.64786,34.94118],[29.64766,34.94095],[29.64694,34.94083],[29.64557,34.94119],[29.64353,34.93968],[29.6423,34.93834],[29.64214,34.9363],[29.64092,34.93659],[29.63888,34.938],[29.6372,34.93806],[29.63394,34.93894],[29.63221,34.94076],[29.63109,34.94111],[29.63018,34.94181],[29.62666,34.94293],[29.62467,34.94288],[29.62452,34.94311]],"tzfachot":[[29.52751,34.91109],[29.52713,34.91074],[29.52642,34.9106],[29.5255,34.91007],[29.52516,34.90967],[29.52516,34.90929],[29.52534,34.90894],[29.52526,34.90871],[29.52343,34.90737],[29.52297,34.9072],[29.52174,34.90729],[29.52126,34.90697],[29.52026,34.90663],[29.5196,34.9068],[29.51805,34.90669],[29.51675,34.90821],[29.51525,34.9085],[29.51374,34.90825],[29.51313,34.90834],[29.51285,34.9086],[29.51273,34.90895],[29.5126,34.91055],[29.51194,34.91081],[29.51171,34.91128],[29.51113,34.91189],[29.51113,34.91239],[29.51059,34.91291],[29.51057,34.91323],[29.51103,34.91343],[29.51118,34.9139],[29.5118,34.91465],[29.51182,34.91503],[29.5118,34.91529],[29.51149,34.91579],[29.51159,34.91625],[29.51149,34.9166],[29.51058,34.91823],[29.50994,34.91902],[29.50997,34.91957],[29.51043,34.92004],[29.5103,34.92068],[29.51074,34.92114],[29.51059,34.9217],[29.51036,34.92187]],"red":[[29.67922,34.87506],[29.68029,34.8752],[29.68081,34.87529],[29.68108,34.87557],[29.68149,34.8758],[29.68173,34.87628],[29.6818,34.87665],[29.6818,34.87725],[29.68187,34.87737],[29.68171,34.87774],[29.68152,34.87867],[29.68162,34.87954],[29.68161,34.88043],[29.6815,34.88055],[29.68101,34.88074],[29.68045,34.88136],[29.68026,34.88178],[29.68026,34.88236],[29.68041,34.8827],[29.68121,34.88378],[29.68224,34.88434],[29.68266,34.88466],[29.68309,34.88483],[29.68321,34.88538],[29.68321,34.88581],[29.68316,34.88606],[29.68301,34.88618],[29.6822,34.88591],[29.68173,34.88595],[29.68127,34.88611],[29.68046,34.88708],[29.67998,34.8874],[29.6796,34.88753],[29.67913,34.88752],[29.67932,34.88657],[29.67921,34.88723],[29.67914,34.88737],[29.67898,34.88736],[29.67913,34.88737],[29.67905,34.88773],[29.67908,34.88823],[29.67939,34.88865],[29.67949,34.88914],[29.6794,34.88939],[29.67908,34.88987],[29.67875,34.89026],[29.6786,34.89034],[29.67833,34.89026],[29.67784,34.88972],[29.67755,34.88958],[29.67717,34.88965],[29.67752,34.88958],[29.67777,34.88882],[29.6783,34.88848],[29.6784,34.88763],[29.67853,34.88745],[29.67883,34.88736],[29.67916,34.88736],[29.67933,34.88647],[29.67926,34.88591],[29.67883,34.88508],[29.67857,34.88494],[29.67743,34.88463],[29.67717,34.88445],[29.67701,34.88423],[29.67684,34.88335],[29.67649,34.88285],[29.67638,34.88223],[29.67645,34.88155],[29.67673,34.88069],[29.67672,34.88015],[29.67639,34.87971],[29.67619,34.87833],[29.67598,34.87816],[29.67582,34.87815],[29.67562,34.87782],[29.67532,34.87775],[29.67563,34.87784],[29.67585,34.87754],[29.6761,34.87739],[29.67632,34.87706],[29.67677,34.87675],[29.67704,34.87617],[29.67741,34.87603],[29.678,34.87595],[29.67829,34.87575],[29.67922,34.87506]]};
const STOPS = {
  d1: [['עבדת', '10:00', 30.7935, 34.7733], ['הקניון האדום', '15:00', 29.67922, 34.87506], ['חאן יעלים', '24:00', 29.887, 35.062]],
  d2: [['תחילת מסלול נחל אמיר', '15:00', 29.64827, 34.94246], ['יטבתה', '17:00', 29.886, 35.06], ['חאן יעלים', '24:00', 29.887, 35.062]],
  d3: [['תחילת מסלול הר צפחות', '11:30', 29.52751, 34.91109], ['אום רשרש', '13:30', 29.5525, 34.9556], ['אייס מול', '17:00', 29.5545, 34.9615], ['בית הספר ברחובות', '24:00', 31.895, 34.81]]
};
function kmBetween(a, b) {
  const k = Math.PI / 180, x = (b[1] - a[1]) * k * Math.cos((a[0] + b[0]) / 2 * k), y = (b[0] - a[0]) * k;
  return Math.hypot(x, y) * 6371;
}
function trackProgress(p) {
  let best = null;
  for (const [id, pts] of Object.entries(TRACKS)) {
    let along = 0, b = null;
    for (let i = 1; i < pts.length; i++) {
      const A = pts[i - 1], B = pts[i], seg = kmBetween(A, B);
      const ky = 111.2, kx = 111.2 * Math.cos(A[0] * Math.PI / 180);
      const vx = (B[1] - A[1]) * kx, vy = (B[0] - A[0]) * ky, wx = (p[1] - A[1]) * kx, wy = (p[0] - A[0]) * ky;
      const s = Math.max(0, Math.min(1, (vx * wx + vy * wy) / ((vx * vx + vy * vy) || 1)));
      const d = Math.hypot(wx - s * vx, wy - s * vy);
      if (!b || d < b.d) b = { d, at: along + s * seg };
      along += seg;
    }
    if (!best || b.d < best.d) best = { id, d: b.d, at: b.at, total: along };
  }
  return best;
}
function etaText(min) {
  if (min < 50) return `כ-${Math.max(10, Math.round(min / 10) * 10)} דקות`;
  const q = Math.round(min / 30) / 2, h = Math.floor(q), half = q - h;
  if (h === 1) return half ? 'כשעה וחצי' : 'כשעה';
  if (h === 2 && !half) return 'כשעתיים';
  return `כ-${h}${half ? ' וחצי' : ''} שעות`;
}
function whereInfo(la, lo) {
  const p = [la, lo], tp = trackProgress(p);
  if (tp && tp.d < 0.3) {
    const r = routeOf(tp.id), pct = Math.min(100, Math.round(tp.at / tp.total * 10) * 10);
    return `🥾 ${r ? esc(r.name) + ': ' : ''}עברנו בערך ${pct}% מהמסלול. (הערכה בלבד. בדרך יש עצירות הדרכה, ולכן אין כאן זמן לסיום. המדריך יודע כמה נשאר באמת.)`;
  }
  const now = new Date(), iso = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
  const day = C.days.find(d => d.date === iso), list = day && STOPS[day.id]; if (!list) return '';
  const hm = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
  const st = list.find(s => hm < s[1]) || list[list.length - 1];
  const km = kmBetween(p, [st[2], st[3]]);
  if (km < 2) return `📍 אתם באזור ${esc(st[0])}.`;
  return `🚌 זמן נסיעה משוער עד ${esc(st[0])}: ${etaText(km * 1.3 / 65 * 60)}. (הערכה גסה לפי המרחק, בלי עצירות ופקקים.)`;
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
    if (x < 0 || x > 1 || y < 0 || y > 1) { dot.hidden = true; const info = whereInfo(la, lo), html = 'המיקום שלך מחוץ לתחום המפה הזאת.' + (info ? '<br>' + info : ''); if (msg.dataset.last !== html) { msg.dataset.last = html; msg.innerHTML = html; } return; }
    dot.hidden = false; dot.style.left = (x * 100) + '%'; dot.style.top = (y * 100) + '%';
    const info = whereInfo(la, lo), html = `המיקום שלך מסומן בנקודה כחולה (דיוק של כ-${Math.round(accuracy)} מ').${info ? '<br>' + info : ''}`;
    if (msg.dataset.last !== html) { msg.dataset.last = html; msg.innerHTML = html; }
  }, err => { msg.textContent = err.code === 1 ? 'לא ניתן אישור לגישה למיקום. אפשר לשנות זאת בהגדרות הטלפון.' : 'לא הצלחנו לאתר מיקום כרגע. נסו שוב בשטח פתוח.'; stopGeo(); btn.setAttribute('aria-pressed', 'false'); btn.textContent = '📍 הצג את המיקום שלי'; },
  { enableHighAccuracy: true, maximumAge: 15000, timeout: 30000 });
}

/* ---------- header toggles (נגישות / התקנה) ---------- */
let backHash = '#now';
function togglePage(p) {
  const cur = (location.hash || '#now').slice(1);
  if (cur === p) location.hash = backHash || '#now';
  else { if (cur !== 'a11y' && cur !== 'install') backHash = '#' + cur; location.hash = '#' + p; }
}
function syncHeaderBtns() {
  const cur = (location.hash || '#now').slice(1);
  const a = $('#a11yBtn'), i = $('#installBtn');
  if (a) { a.setAttribute('aria-expanded', cur === 'a11y'); a.classList.toggle('on', cur === 'a11y'); }
  if (i) { i.setAttribute('aria-expanded', cur === 'install'); i.classList.toggle('on', cur === 'install'); i.textContent = cur === 'install' ? '✕ סגירה' : '📲 להתקנה כאפליקציה';
    i.hidden = isStandalone() && cur !== 'install'; }
}
const isStandalone = () => (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
let installEvt = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; if ((location.hash || '').slice(1) === 'install') route(); });
async function doInstall() {
  if (!installEvt) return;
  installEvt.prompt(); const r = await installEvt.userChoice.catch(() => null); installEvt = null;
  toast(r && r.outcome === 'accepted' ? 'האפליקציה נוספה למסך הבית 🎉' : 'אפשר להתקין גם מאוחר יותר'); route();
}

/* ---------- router ---------- */
const TITLES = { now: 'עכשיו', schedule: 'לוח זמנים', maps: 'מפות', quiz: 'חידון', more: 'עוד', routes: 'המסלולים', rules: 'נהלים', learn: 'העשרה', checklist: 'רשימת ציוד', feedback: 'משוב', install: 'התקנה והסרה', report: 'דיווח על טעות', game: 'שמי המדבר', bus: 'משחקי אוטובוס', sky: 'שמי הלילה', a11y: 'נגישות', about: 'אודות' };
function route() {
  stopGeo(); zoom = 1;
  if (isEnded()) { $('#main').innerHTML = viewEnded(); document.querySelector('.tabbar').style.display = 'none'; document.title = 'הטיול הסתיים'; return; }
  const h = (location.hash || '#now').slice(1);
  const [page, arg] = h.includes('-') ? [h.slice(0, h.indexOf('-')), h.slice(h.indexOf('-') + 1)] : [h, null];
  const views = { now: viewNow, schedule: viewSchedule, maps: viewMaps, quiz: () => viewQuiz(arg), more: viewMore, routes: viewRoutes, route: () => viewRoute(arg),
    report: viewReport, game: () => window.TripGame.view(arg), bus: () => window.TripExtras.viewBus(arg), sky: () => window.TripExtras.viewSky(), rules: viewRules, learn: () => viewLearn(arg), checklist: viewChecklist, feedback: viewFeedback, install: viewInstall, a11y: viewA11y, about: viewAbout };
  const v = views[page] || viewNow;
  $('#main').innerHTML = v();
  document.body.classList.toggle('bleed', page === 'now' || page === 'route' || !views[page]);
  const tab = { now: 'now', schedule: 'schedule', maps: 'maps', quiz: 'quiz' }[page] || 'more';
  document.querySelectorAll('.tabbar a').forEach(a => { if (a.dataset.tab === tab) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  document.title = (TITLES[page] || 'טיול') + ' · טיול שנתי י"ב';
  syncHeaderBtns();
}
window.addEventListener('hashchange', () => { if (!$('#modal').hidden) $('#modal').hidden = true; route(); window.scrollTo(0, 0); $('#main').focus({ preventScroll: true }); });

document.addEventListener('click', e => {
  const t = e.target.closest('button, [data-act], [data-goday]'); if (!t) return;
  if (t.dataset.act === 'update') return checkUpdates();
  if (t.dataset.day) { LS.set('schedDay', t.dataset.day); return route(); }
  if (t.dataset.goday) { LS.set('schedDay', t.dataset.goday); }
  if (t.dataset.map) { LS.set('mapSel', t.dataset.map); return route(); }
  if (t.dataset.openmap) { LS.set('mapSel', MAPS[t.dataset.openmap] ? t.dataset.openmap : 'eilat'); location.hash = '#maps'; return; }
  if (t.dataset.zoom) return setZoom(+t.dataset.zoom);
  if (t.dataset.geo) return toggleGeo(t);
  if (t.dataset.ans !== undefined && t.classList.contains('quiz-opt')) return answer(t);
  if (t.dataset.os) { LS.set('os', t.dataset.os); return route(); }
  if (t.dataset.fs !== undefined) { const s = LS.get('a11y', {}); s.fs = t.dataset.fs; LS.set('a11y', s); applyA11y(); return route(); }
  if (t.id === 'a11yBtn') return togglePage('a11y');
  if (t.id === 'installBtn') return togglePage('install');
  if (t.dataset.act === 'doinstall') return doInstall();
  if (t.dataset.act === 'closeinstall') return togglePage('install');
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
  try { ready = !!(await caches.has('trip12-' + APP_VERSION)) && !!navigator.serviceWorker.controller; } catch (e) {}
  const on = navigator.onLine;
  chip.textContent = ready ? '✓ נשמר בטלפון' : (on ? '⏳ שומר…' : '⚠ אין חיבור');
  chip.dataset.short = ready ? '✓' : (navigator.onLine ? '⏳' : '⚠');
  chip.setAttribute('aria-label', ready ? (on ? 'האתר שמור ומוכן לעבודה ללא אינטרנט' : 'אין חיבור – האתר עובד מהזיכרון') : (on ? 'שומר את האתר לשימוש ללא אינטרנט' : 'אין חיבור לאינטרנט'));
  chip.title = chip.getAttribute('aria-label');
}
window.addEventListener('online', netStatus); window.addEventListener('offline', netStatus);
if ('serviceWorker' in navigator) {
  let hadController = !!navigator.serviceWorker.controller, reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController && !reloaded) { reloaded = true; location.reload(); } hadController = true; netStatus(); });
  navigator.serviceWorker.addEventListener('message', e => { if (e.data === 'cached') { LS.set('cached', true); netStatus(); } });
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(reg => { if (navigator.onLine) reg.update().catch(() => {}); return navigator.serviceWorker.ready; }).then(r => { r.active && r.active.postMessage('check'); }).catch(() => {});
}

/* ---------- start ---------- */
(async function init() {
  applyA11y();
  try { BASE = await (await fetch('data/content.json')).json(); }
  catch (e) { $('#main').innerHTML = '<div class="card notice">לא הצלחנו לטעון את התוכן. פתחו את האתר פעם אחת עם אינטרנט.</div>'; return; }
  rebuild(); route(); netStatus(); checkEndFlag();
  if (!isEnded() && !LS.get('agreed', false)) {
    modal('ברוכים הבאים לאתר הטיול', `<p><b>טיול שנתי י"ב תשפ"ז</b> – מופק על ידי מגמת גאוגרפיה, תיכון דה-שליט.</p>
      <ul><li>מיזם בית ספרי לרווחת התלמידים, לשימוש פנימי בלבד וללא כוונות רווח. אין להעביר את הקישור מחוץ לטיול.</li>
      <li>השימוש רשות. אין הרשמה, ואין איסוף מידע אישי.</li>
      <li>🤖 האתר והתוכן נבנו בעזרת בינה מלאכותית – ייתכנו טעויות.</li>
      <li>האתר אינו כלי ניווט או בטיחות. הוראות הצוות קודמות תמיד.</li></ul>
      <div class="card notice" style="margin:10px 0 0"><b>📲 כדי שהאתר יעבוד גם בלי קליטה:</b>
      <ol class="steps" style="margin:6px 0 0"><li>השאירו את האתר פתוח עד שלמעלה יופיע <b>"✓ נשמר בטלפון"</b>.</li>
      <li>מומלץ להוסיף למסך הבית: ${/iphone|ipad|ipod/i.test(navigator.userAgent) ? 'ב-Safari: כפתור השיתוף (או … ואז "שיתוף") ← <b>"הוסף למסך הבית"</b>' : 'ב-Chrome: תפריט ⋮ ← <b>"הוספה למסך הבית"</b>'}.</li>
      <li>בדיקה: מצב טיסה, סגירה ופתיחה מחדש.</li></ol>
      <a href="#install">הוראות מלאות (התקנה והסרה)</a></div>
      <p class="small"><a href="#about">לקריאת ההצהרות המלאות</a></p>`, [['קראתי והבנתי', () => LS.set('agreed', true)]]);
  }
})();
