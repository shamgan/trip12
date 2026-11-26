/* תוספות: משחקי אוטובוס, מצב חיסכון, אתגר שעתי, מדריך שמי הלילה, תחזית בוקר.
   ללא איסוף מידע. התחזית בלבד פונה לשירות Open-Meteo עם קואורדינטות קבועות של המסלול (לא המיקום שלכם). */
'use strict';
(function () {
  const E = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const S = {
    get(k, d) { try { const v = localStorage.getItem('trip12.x.' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('trip12.x.' + k, JSON.stringify(v)); } catch (e) {} }
  };
  const X = () => C.extras || {};
  const pad = n => String(n).padStart(2, '0');
  const todayISO = () => { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

  /* ================= מצב חיסכון ומצב לילה ================= */
  function applyModes() {
    const m = S.get('modes', {});
    /* מצב לילה אדום כבה לבד בבוקר (06:00–17:00), כדי שהמסך לא יישאר כהה למחרת */
    const h = new Date().getHours();
    if (m.night && h >= 6 && h < 17) { m.night = false; S.set('modes', m); }
    document.body.classList.toggle('saver', !!(m.saver || m.night));
    document.body.classList.toggle('nightred', !!m.night);
    const tc = document.querySelector('meta[name="theme-color"]'); if (tc) tc.content = m.night ? '#000000' : m.saver ? '#111111' : '#b8461f';
  }
  function setMode(k, v) { const m = S.get('modes', {}); m[k] = v; S.set('modes', m); applyModes(); if (k === 'saver' && v && window.stopGeo) window.stopGeo(); }
  function modesCard() {
    const m = S.get('modes', {});
    return `<div class="card"><h2>🔋 חיסכון בסוללה</h2>
      <label class="check"><input type="checkbox" data-x="saver" ${m.saver ? 'checked' : ''}><span><b>מצב חיסכון</b> – מסך כהה, בלי תמונות ובלי אנימציות</span></label>
      <label class="check"><input type="checkbox" data-x="night" ${m.night ? 'checked' : ''}><span><b>מצב לילה אדום</b> – לצפייה בכוכבים בלי לסנוור את העיניים</span></label>
      <ul class="benefits small"><li>הורידו את בהירות המסך.</li><li>במסלול: מצב טיסה – ה-GPS עדיין עובד אם צריך.</li><li>כבו את "הצג את המיקום שלי" כשלא צריך.</li><li>מטען נייד בתיק – הוא ברשימת הציוד.</li></ul></div>`;
  }
  async function batteryHint() {
    try {
      if (!navigator.getBattery || S.get('modes', {}).saver || S.get('battHinted', '') === todayISO()) return;
      const b = await navigator.getBattery();
      if (!b.charging && b.level <= 0.2) {
        S.set('battHinted', todayISO());
        window.modal && window.modal('הסוללה חלשה 🔋', `<p>נשארו בערך ${Math.round(b.level * 100)}%. להפעיל מצב חיסכון?</p>`, [['הפעלת מצב חיסכון', () => setMode('saver', true)], ['לא עכשיו']]);
      }
    } catch (e) {}
  }

  /* ================= אתגר שעתי ================= */
  function challengeCard() {
    const list = X().challenges || []; if (!list.length) return '';
    const d = new Date(), h = d.getHours();
    /* רק בזמן הטיול בשטח – לא בנסיעה הארוכה בהלוך ובחזור */
    const dayIdx = C.days.findIndex(x => x.date === todayISO()); if (dayIdx < 0) return '';
    const win = (X().challengeWindows || {})[C.days[dayIdx].id] || ['07:00', '22:00'];
    const hm = pad(h) + ':' + pad(d.getMinutes());
    if (hm < win[0] || hm >= win[1]) return '';
    const i = (dayIdx * 16 + h) % list.length;
    const done = S.get('chDone', {}); const key = todayISO() + '-' + h;
    return `<div class="card challenge"><div class="kicker">🎯 האתגר של השעה ${pad(h)}:00–${pad(h + 1)}:00</div><p class="ch-text">${E(list[i])}</p>
      <button class="btn ${done[key] ? 'secondary' : ''} block" data-x="chdone" data-k="${key}" aria-pressed="${!!done[key]}">${done[key] ? '✓ עשינו!' : 'עשינו את זה'}</button>
      <p class="small muted">אתגר חדש בכל שעה עגולה. לא חובה – רק בשביל הכיף, ותמיד בכבוד לכולם.</p></div>`;
  }

  /* ================= תחזית בוקר ================= */
  const WCODE = { 0: 'בהיר ☀️', 1: 'בהיר ברובו 🌤️', 2: 'מעונן חלקית ⛅', 3: 'מעונן ☁️', 45: 'ערפל 🌫️', 48: 'ערפל 🌫️', 51: 'טפטוף 🌦️', 53: 'טפטוף 🌦️', 55: 'טפטוף 🌦️', 61: 'גשם קל 🌧️', 63: 'גשם 🌧️', 65: 'גשם חזק 🌧️', 80: 'ממטרים 🌦️', 81: 'ממטרים 🌧️', 82: 'ממטרים חזקים ⛈️', 95: 'סופת רעמים ⛈️', 96: 'סופת רעמים ⛈️', 99: 'סופת רעמים ⛈️' };
  function forecastWindow() {
    const d = C.days.find(x => x.date === todayISO()); if (!d) return null;
    const now = new Date(), m = now.getHours() * 60 + now.getMinutes();
    const [eh, em] = (X().forecastUntil || '08:30').split(':').map(Number);
    if (m < 4 * 60 || m >= eh * 60 + em) return null;
    return d;
  }
  async function fetchForecast(d) {
    const loc = (X().forecastPlaces || {})[d.id]; if (!loc || !navigator.onLine) return;
    const cache = S.get('fc', null); if (cache && cache.day === d.id && Date.now() - cache.t < 45 * 60e3) return;
    if (fetchForecast.busy) return; fetchForecast.busy = true; setTimeout(() => fetchForecast.busy = false, 15000);
    const url = 'https://api.open-meteo.com/v1/forecast?latitude=' + loc.lat + '&longitude=' + loc.lon +
      '&hourly=temperature_2m,precipitation_probability,wind_speed_10m,uv_index,weather_code&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunset&timezone=Asia%2FJerusalem&forecast_days=1';
    try {
      const r = await fetch(url, { cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer' }); if (!r.ok) throw 0;
      const j = await r.json(); S.set('fc', { day: d.id, t: Date.now(), place: loc.name, j });
      if ((location.hash || '#now') === '#now' && window.route) window.route();
    } catch (e) { S.set('fcFail', Date.now()); if ((location.hash || '#now') === '#now' && window.route) window.route(); }
  }
  function forecastCard() {
    const d = forecastWindow(); if (!d) return '';
    const fc = S.get('fc', null);
    if (!fc || fc.day !== d.id) { const failed = Date.now() - S.get('fcFail', 0) < 10 * 60e3; if (!failed) fetchForecast(d); return navigator.onLine && !failed ? `<div class="card weather"><div class="kicker">🌤️ התחזית למסלול היום</div><p class="small">טוען תחזית עדכנית…</p></div>` : ''; }
    fetchForecast(d);
    const j = fc.j, dl = j.daily || {}, hr = j.hourly || {};
    const idx = (hr.time || []).map((t, i) => [t.slice(11, 13), i]).filter(([h]) => +h >= 8 && +h <= 15).map(([, i]) => i);
    const v = (k, i) => (hr[k] || [])[i];
    const maxWind = Math.max(...idx.map(i => v('wind_speed_10m', i) || 0)), maxUv = Math.max(...idx.map(i => v('uv_index', i) || 0));
    const codeMid = v('weather_code', idx[Math.floor(idx.length / 2)]);
    const age = Math.round((Date.now() - fc.t) / 60000);
    const tips = [];
    if (maxUv >= 6) tips.push('קרם הגנה וכובע – קרינה גבוהה');
    if ((dl.temperature_2m_min || [])[0] <= 14) tips.push('בבוקר קר – שכבה חמה, אפשר להוריד אחר כך');
    if ((dl.temperature_2m_max || [])[0] >= 28) tips.push('חם – לשתות הרבה, לא לחכות לצמא');
    if (maxWind >= 30) tips.push('רוח חזקה – לסגור היטב כובע ותיק');
    return `<div class="card weather"><div class="kicker">🌤️ התחזית למסלול היום · ${E(fc.place)}</div>
      <div class="w-row"><div class="w-big">${Math.round((dl.temperature_2m_max || [])[0])}°<small>מקסימום</small></div>
      <div class="w-big">${Math.round((dl.temperature_2m_min || [])[0])}°<small>מינימום</small></div>
      <div class="w-big">${(dl.precipitation_probability_max || [])[0] ?? '–'}%<small>סיכוי לגשם</small></div></div>
      <p><b>${E(WCODE[codeMid] || '')}</b> · רוח עד ${Math.round(maxWind)} קמ"ש · קרינת UV עד ${Math.round(maxUv)}</p>
      <div class="w-hours">${idx.filter((_, k) => k % 2 === 0).map(i => `<div><b>${hr.time[i].slice(11, 16)}</b>${Math.round(v('temperature_2m', i))}°</div>`).join('')}</div>
      ${tips.length ? `<ul class="benefits">${tips.map(t => `<li>${E(t)}</li>`).join('')}</ul>` : ''}
      <p class="small muted">עודכן לפני ${age < 1 ? 'פחות מדקה' : age + ' דק\''} · מקור: Open-Meteo · מוצג עד ${E(X().forecastUntil || '08:30')}. התחזית לידיעה בלבד – ההחלטות בשטח הן של הצוות.</p></div>`;
  }

  /* ================= מדריך שמי הלילה ================= */
  function moon() {
    const syn = 29.530588853, ref = Date.UTC(2000, 0, 6, 18, 14);
    const age = (((Date.now() - ref) / 864e5) % syn + syn) % syn;
    const ill = Math.round((1 - Math.cos(2 * Math.PI * age / syn)) / 2 * 100);
    const name = age < 1.5 || age > 28 ? 'מולד (ירח חדש)' : age < 6.4 ? 'סהר מתמלא' : age < 8.4 ? 'רבע ראשון' : age < 13.8 ? 'ירח מתמלא' : age < 15.8 ? 'ירח מלא' : age < 21.1 ? 'ירח מתמעט' : age < 23.1 ? 'רבע אחרון' : 'סהר מתמעט';
    return { ill, name, full: age >= 13.8 && age < 15.8 };
  }
  function skySvg() {
    // סכמה פשוטה של שמי הערב (כ-20:00, סוף נובמבר, מבט כללי) – לא מפה מדויקת
    const st = (x, y, r = 1.1, c = '#fff') => `<circle cx="${x}" cy="${y}" r="${r}" fill="${c}"/>`;
    const L = (pts) => `<polyline points="${pts.map(p => p.join(',')).join(' ')}" fill="none" stroke="#9fb7ff" stroke-opacity=".55" stroke-width=".5"/>`;
    const T = (x, y, t, a = 'middle') => `<text x="${x}" y="${y}" font-size="3.6" fill="#ffd27a" text-anchor="${a}" font-weight="700">${t}</text>`;
    let s = `<svg viewBox="0 0 200 110" class="nightsky" role="img" aria-label="שרטוט פשוט של שמי הערב: הירח במזרח, כימה במזרח, קסיופאה בצפון, כוכב הצפון, ואוריון שעולה מאוחר יותר במזרח"><rect width="200" height="110" fill="#0b1026" rx="6"/>`;
    for (let i = 0; i < 90; i++) s += st((i * 73) % 200, (i * 41) % 92, .3, '#fff');
    s += `<path d="M0 98 L30 92 L55 96 L80 88 L110 95 L140 89 L170 94 L200 90 L200 110 L0 110Z" fill="#1d1a2b"/>`;
    s += T(18, 106, 'מערב') + T(70, 106, 'צפון') + T(130, 106, 'מזרח') + T(185, 106, 'דרום');
    // Polaris + Cassiopeia (north)
    s += st(70, 62, 1.4) + T(70, 58, 'כוכב הצפון');
    s += L([[52, 34], [58, 40], [64, 33], [70, 39], [76, 31]]) + [[52, 34], [58, 40], [64, 33], [70, 39], [76, 31]].map(p => st(p[0], p[1])).join('') + T(64, 27, 'קסיופאה (W)');
    // Pleiades (east)
    s += [[118, 40], [120, 38], [121, 41], [123, 39], [119, 42], [122, 37]].map(p => st(p[0], p[1], .7)).join('') + T(121, 33, 'כימה');
    // Orion rising (east, low)
    s += L([[140, 80], [146, 82], [152, 80]]) + [[136, 72], [156, 70], [140, 80], [146, 82], [152, 80], [138, 90], [156, 88]].map(p => st(p[0], p[1], 1)).join('') + T(147, 66, 'אוריון (אחרי 21:00)');
    // Moon
    const mo = moon(); s += `<circle cx="112" cy="78" r="${mo.full ? 6 : 4.5}" fill="#fff6d8"/><circle cx="112" cy="78" r="10" fill="#fff6d8" opacity=".12"/>` + T(112, 69, 'הירח');
    // Summer triangle (west, low)
    s += L([[20, 60], [34, 54], [28, 74], [20, 60]]) + [[20, 60], [34, 54], [28, 74]].map(p => st(p[0], p[1], 1)).join('') + T(28, 48, 'משולש הקיץ');
    return s + '</svg>';
  }
  function viewSky() {
    const mo = moon(), m = S.get('modes', {});
    const h = new Date().getHours(), dark = h >= 17 || h < 6;
    const items = X().sky || [];
    return `<h1>🌌 מדריך שמי הלילה</h1>
      <div class="card ${m.night ? '' : 'notice'}">${m.night ? '<b>✓ מצב לילה אדום פעיל.</b> העיניים יתרגלו לחושך תוך 10–15 דקות.' : `<b>${dark ? '🌙 חשוך בחוץ?' : '🌙 לקראת הערב:'}</b> כדאי להפעיל <b>מצב לילה אדום</b> – אור אדום לא מסנוור, והעיניים ממשיכות לראות כוכבים.`}
        <button class="btn ${m.night ? 'secondary' : ''} block" data-x="nighttoggle">${m.night ? 'כיבוי מצב לילה' : '🔴 הפעלת מצב לילה'}</button></div>
      <div class="card"><h2>הירח הלילה: ${E(mo.name)} (${mo.ill}% מואר)</h2>
        <p>${mo.full ? 'בלילות הטיול הירח מלא – הוא זורח במזרח בדיוק כשהשמש שוקעת, ומאיר את המדבר כמעט כמו פנס. יראו פחות כוכבים חלשים ולא את שביל החלב, אבל הכוכבים הבהירים, קבוצות הכוכבים וכוכבי הלכת יבלטו היטב. ונוף ההרים לאור ירח מלא – חוויה בפני עצמה.' : mo.ill < 30 ? 'הירח חלש – לילה מצוין לכוכבים. התרחקו מהאורות והסתכלו למעלה.' : 'הירח מאיר חלק מהשמיים – הכוכבים הבהירים ייראו היטב.'}</p></div>
      <div class="card">${skySvg()}<p class="small muted">שרטוט פשוט להתמצאות (סוף נובמבר, בערב) – לא מפה מדויקת. עמדו עם הגב לאורות החאן.</p></div>
      ${items.map(it => `<div class="card"><h2>${E(it.t)}</h2><p><b>איפה:</b> ${E(it.where)}</p><p>${E(it.text)}</p>${it.geo ? `<p class="small"><b>🌍 גאוגרפיה:</b> ${E(it.geo)}</p>` : ''}</div>`).join('')}
      <div class="card soft small"><b>טיפים:</b> לא מסתובבים בחושך מחוץ לאזור החאן, ונשמעים להוראות הצוות. נותנים לעיניים 10–15 דקות להתרגל. כל הבהקה של פנס או מסך לבן מאפסת את ההתרגלות – לכן מצב לילה אדום.</div>
      ${modesCard()}<p class="footer-note">🤖 נבנה בעזרת בינה מלאכותית – ייתכנו טעויות</p>`;
  }

  /* ================= משחקי אוטובוס ================= */
  function viewBus(arg) {
    const B = X().bus || {};
    if (!arg) return `<h1>🚌 משחקים לאוטובוס</h1><p>משחקים לקבוצה – טלפון אחד עובר בין המושבים, או שמישהו מקריא בקול.</p>
      <a class="busgame" href="#bus-who"><span aria-hidden="true">🗺️</span><div><b>מי אני? – מקומות בישראל</b><small>רמזים נחשפים אחד אחד. ככל שמנחשים מוקדם – יותר נקודות.</small></div></a>
      <a class="busgame" href="#bus-tf"><span aria-hidden="true">⚡</span><div><b>אמת או מיתוס?</b><small>עובדות מפתיעות על המדבר ועל ישראל. מצביעים ביד – ואז חושפים.</small></div></a>
      <a class="busgame" href="#bus-riddle"><span aria-hidden="true">🧩</span><div><b>חידות היגיון</b><small>חידה, זמן לחשוב, ואז הפתרון.</small></div></a>
      <a class="busgame" href="#bus-list"><span aria-hidden="true">🔤</span><div><b>אות ונושא</b><small>אות אקראית + נושא. 30 שניות – כמה מילים מוצאים?</small></div></a>
      <p class="footer-note">🤖 נבנה בעזרת בינה מלאכותית – ייתכנו טעויות</p>`;
    const back = '<p><a class="textlink" href="#bus">→ כל המשחקים</a></p>';
    const st = S.get('bus_' + arg, null);
    if (arg === 'who') {
      const list = B.who || []; let s = st && st.order ? st : { order: shuffle(list.map((_, i) => i)), pos: 0, shown: 1 };
      S.set('bus_who', s); const it = list[s.order[s.pos % list.length]];
      const pts = Math.max(1, 6 - s.shown);
      return back + `<h1>מי אני?</h1><div class="card"><div class="kicker">מקום ${s.pos % list.length + 1} מתוך ${list.length} · שווה עכשיו ${pts} נק'</div>
        <ol class="clues">${it.clues.slice(0, s.shown).map(c => `<li>${E(c)}</li>`).join('')}</ol>
        ${s.reveal ? `<p class="answer">🎉 ${E(it.a)}</p>` : ''}
        <div class="row">${!s.reveal && s.shown < it.clues.length ? '<button class="btn" data-x="whoclue">עוד רמז</button>' : ''}
        ${!s.reveal ? '<button class="btn secondary" data-x="whoreveal">גלו את התשובה</button>' : '<button class="btn" data-x="whonext">למקום הבא ←</button>'}</div></div>`;
    }
    if (arg === 'tf') {
      const list = B.tf || []; let s = st && st.order ? st : { order: shuffle(list.map((_, i) => i)), pos: 0 };
      S.set('bus_tf', s); const it = list[s.order[s.pos % list.length]];
      return back + `<h1>אמת או מיתוס?</h1><div class="card"><div class="kicker">${s.pos % list.length + 1} מתוך ${list.length}</div><h2>${E(it.s)}</h2>
        ${s.reveal ? `<p class="answer">${it.t ? '✅ אמת!' : '❌ מיתוס!'}</p><p>${E(it.e)}</p><button class="btn block" data-x="tfnext">לטענה הבאה ←</button>`
                   : '<p class="small muted">מי חושב שאמת – יד למעלה. ספרו, ואז חשפו.</p><button class="btn block" data-x="tfreveal">חשיפה</button>'}</div>`;
    }
    if (arg === 'riddle') {
      const list = B.riddles || []; let s = st && st.order ? st : { order: shuffle(list.map((_, i) => i)), pos: 0 };
      S.set('bus_riddle', s); const it = list[s.order[s.pos % list.length]];
      return back + `<h1>חידות היגיון</h1><div class="card"><div class="kicker">חידה ${s.pos % list.length + 1} מתוך ${list.length}</div><h2>${E(it.q)}</h2>
        ${s.reveal ? `<p class="answer">💡 ${E(it.a)}</p><button class="btn block" data-x="riddlenext">לחידה הבאה ←</button>` : '<button class="btn block" data-x="riddlereveal">הפתרון</button>'}</div>`;
    }
    if (arg === 'list') {
      const letters = 'אבגדהזחטילמנסעפצקרשת', topics = B.topics || [];
      const s = st || { l: letters[Math.floor(Math.random() * letters.length)], t: topics[Math.floor(Math.random() * topics.length)] };
      S.set('bus_list', s);
      return back + `<h1>אות ונושא</h1><div class="card" style="text-align:center"><p class="small muted">הנושא:</p><h2>${E(s.t)}</h2><p class="small muted">באות:</p><div class="bigletter">${E(s.l)}</div>
        <div id="xtimer" class="xtimer" role="timer" aria-live="polite">30</div>
        <div class="row"><button class="btn" data-x="liststart">▶ 30 שניות</button><button class="btn secondary" data-x="listnew">🔀 חדש</button></div>
        <p class="small muted">כל אחד אומר מילה בתורו. מי שנתקע – יוצא מהסבב.</p></div>`;
    }
    return viewBus();
  }
  let timerId = null;
  function startTimer() {
    clearInterval(timerId); let n = 30; const el = document.getElementById('xtimer'); if (!el) return;
    el.textContent = n; el.classList.remove('done');
    timerId = setInterval(() => { n--; const e2 = document.getElementById('xtimer'); if (!e2) return clearInterval(timerId); e2.textContent = n > 0 ? n : '⏰ נגמר הזמן!'; if (n <= 0) { clearInterval(timerId); e2.classList.add('done'); if (navigator.vibrate) navigator.vibrate(300); } }, 1000);
  }
  const bump = (k, f) => { const s = S.get(k, {}); f(s); S.set(k, s); window.route(); };

  document.addEventListener('click', e => {
    const t = e.target.closest('[data-x]'); if (!t || t.tagName === 'INPUT') return;
    const a = t.dataset.x;
    if (a === 'nighttoggle') { setMode('night', !S.get('modes', {}).night); return window.route(); }
    if (a === 'chdone') { const d = S.get('chDone', {}); d[t.dataset.k] = !d[t.dataset.k]; S.set('chDone', d); return window.route(); }
    if (a === 'whoclue') return bump('bus_who', s => s.shown++);
    if (a === 'whoreveal') return bump('bus_who', s => s.reveal = true);
    if (a === 'whonext') return bump('bus_who', s => { s.pos++; s.shown = 1; s.reveal = false; });
    if (a === 'tfreveal') return bump('bus_tf', s => s.reveal = true);
    if (a === 'tfnext') return bump('bus_tf', s => { s.pos++; s.reveal = false; });
    if (a === 'riddlereveal') return bump('bus_riddle', s => s.reveal = true);
    if (a === 'riddlenext') return bump('bus_riddle', s => { s.pos++; s.reveal = false; });
    if (a === 'liststart') return startTimer();
    if (a === 'listnew') { clearInterval(timerId); S.set('bus_list', null); return window.route(); }
  });
  document.addEventListener('change', e => {
    const t = e.target; if (!t.dataset || !t.dataset.x) return;
    if (t.dataset.x === 'saver' || t.dataset.x === 'night') setMode(t.dataset.x, t.checked);
  });

  applyModes(); setTimeout(batteryHint, 4000); document.addEventListener('visibilitychange', () => { if (!document.hidden) applyModes(); });
  window.TripExtras = { viewBus, viewSky, challengeCard, forecastCard, modesCard, applyModes };
})();
