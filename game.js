/* "שמי המדבר" – משחק שיתופי בזוגות, ללא אינטרנט וללא איסוף מידע.
   כל מפגש בין שני תלמידים: סריקה הדדית של קודי QR + משימה משותפת קצרה = כוכב לכל אחד.
   כל זוג חדש מתווסף ל"שמי השכבה" (מידע שעובר מטלפון לטלפון בסריקות), ובכל סף נחשף חלק מ"המפה האבודה".
   נשמר רק בטלפון: מזהה אקראי, שם-כינוי של בעל חיים, הכוכבים, ורשימת מזהי-זוגות מקודדים. */
'use strict';
(function () {
  const ANIMALS = ['יעל', 'שועל', 'נשר', 'חוגלה', 'דורבן', 'צב', 'ראם', 'קורא', 'שחרור', 'דוכיפת', 'צבוע', 'זיקית'];
  const COLORS = ['זהוב', 'כחול', 'אדום', 'ירוק', 'סגול', 'כתום', 'לבן', 'ורוד'];
  const SECRET = 'trip12-deshalit-sky';
  const S = {
    get(k, d) { try { const v = localStorage.getItem('trip12.game.' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('trip12.game.' + k, JSON.stringify(v)); } catch (e) {} }
  };
  const rid = n => { const a = new Uint8Array(n); crypto.getRandomValues(a); return [...a].map(b => (b % 36).toString(36)).join(''); };
  function h32(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); }
  const sign = s => h32(SECRET + '|' + s).slice(0, 5);
  const now = () => Math.floor(Date.now() / 1000);
  const dayKey = () => new Date().toISOString().slice(0, 10);

  function me() {
    let m = S.get('me', null);
    if (!m) { m = { id: rid(8), name: Math.floor(Math.random() * ANIMALS.length * COLORS.length) }; S.set('me', m); }
    return m;
  }
  const nameOf = i => { i = Number(i) || 0; return ANIMALS[i % ANIMALS.length] + ' ' + COLORS[Math.floor(i / ANIMALS.length) % COLORS.length]; };
  const pairKey = (a, b) => h32([a, b].sort().join('+')).slice(0, 6);
  const stars = () => S.get('stars', []);
  const known = () => S.get('known', []);           // מזהי זוגות שהטלפון מכיר (שלו ושל אחרים)
  function addKnown(list) {
    const k = new Set(known()); (list || []).forEach(x => x && /^[0-9a-z]{4,6}$/.test(x) && k.add(x));
    const arr = [...k]; S.set('known', arr); return arr.length;
  }
  const players = () => S.get('players', []);       // מזהים קצרים של משתתפים שהטלפון מכיר
  function addPlayers(list) {
    const k = new Set(players()); (list || []).forEach(x => x && /^[0-9a-z]{5}$/.test(x) && k.add(x));
    S.set('players', [...k]); return k.size;
  }
  const short = id => String(id).slice(0, 5);
  // מה שעובר בכל סריקה: 30 זוגות אחרונים ~ 40 משתתפים אחרונים (כדי שהקוד יישאר קריא)
  const gossip = () => known().slice(-30).join('.') + '~' + players().slice(-40).join('.');
  function mergeGossip(g) { const [pr, pl] = String(g || '').split('~'); addKnown((pr || '').split('.')); addPlayers((pl || '').split('.')); }

  /* ---------- payloads ---------- */
  // הזמנה:  T12|I|id|name|nonce|ts|mission|gossip|sig
  // תשובה:  T12|R|id|name|nonce|inviterId|result|gossip|sig
  function makeInvite() {
    const m = me(); const pool = C.game.missions; const done = new Set(stars().map(s => s.mission));
    const cand = pool.map((_, i) => i).filter(i => !done.has(i)); const pick = (cand.length ? cand : pool.map((_, i) => i))[Math.floor(Math.random() * (cand.length || pool.length))];
    const inv = { nonce: rid(6), ts: now(), mission: pick };
    S.set('pending', inv);
    const body = ['T12', 'I', m.id, m.name, inv.nonce, inv.ts, pick, gossip()].join('|');
    return body + '|' + sign(body);
  }
  function makeResponse(inv, result) {
    const m = me();
    const body = ['T12', 'R', m.id, m.name, inv.nonce, inv.from, result, gossip()].join('|');
    return body + '|' + sign(body);
  }
  function parse(txt) {
    const p = String(txt || '').split('|'); if (p[0] !== 'T12' || p.length !== 9) return null;
    const body = p.slice(0, 8).join('|'); if (sign(body) !== p[8]) return null;
    return p;
  }

  /* ---------- stars ---------- */
  function hasPartner(id) { return stars().some(s => s.partner === id); }
  function addStar(partner, pname, mission, result) {
    const list = stars(); if (list.some(s => s.partner === partner)) return false;
    list.push({ partner, pname, mission, result, day: dayKey(), t: Date.now() }); S.set('stars', list);
    addKnown([pairKey(me().id, partner)]); addPlayers([short(me().id), short(partner)]); return true;
  }

  /* ---------- QR render / scan ---------- */
  function qrSvg(text) {
    const q = qrcode(0, 'M'); q.addData(text); q.make();
    return q.createSvgTag({ cellSize: 6, margin: 2, scalable: true });
  }
  let stream = null, loop = null;
  function stopScan() { if (loop) cancelAnimationFrame(loop); loop = null; if (stream) stream.getTracks().forEach(t => t.stop()); stream = null; }
  async function startScan(onText) {
    const v = document.getElementById('gvideo'), msg = document.getElementById('gscanmsg');
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { msg.textContent = 'הטלפון לא מאפשר שימוש במצלמה כאן. פתחו את האתר ב-Chrome או ב-Safari.'; return; }
    try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false }); }
    catch (e) { msg.textContent = 'אין הרשאה למצלמה. אפשר לאשר בהגדרות הדפדפן ולנסות שוב.'; return; }
    v.srcObject = stream; v.setAttribute('playsinline', ''); await v.play().catch(() => {});
    const c = document.createElement('canvas'), ctx = c.getContext('2d', { willReadFrequently: true });
    msg.textContent = 'כוונו את המצלמה לקוד שעל המסך של החבר/ה.';
    const tick = () => {
      if (!stream) return;
      if (v.readyState === v.HAVE_ENOUGH_DATA) {
        const w = Math.min(640, v.videoWidth), h = Math.round(v.videoHeight * w / v.videoWidth);
        c.width = w; c.height = h; ctx.drawImage(v, 0, 0, w, h);
        const r = jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: 'dontInvert' });
        if (r && r.data) { if (navigator.vibrate) navigator.vibrate(60); stopScan(); onText(r.data); return; }
      }
      loop = requestAnimationFrame(tick);
    };
    loop = requestAnimationFrame(tick);
  }

  /* ---------- views ---------- */
  const E = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function starPath(x, y, r) { let d = ''; for (let i = 0; i < 10; i++) { const rr = i % 2 ? r * .45 : r, an = -Math.PI / 2 + i * Math.PI / 5; d += (i ? 'L' : 'M') + (x + rr * Math.cos(an)).toFixed(2) + ',' + (y + rr * Math.sin(an)).toFixed(2); } return d + 'Z'; }
  function skySvg() {
    const st = stars(), goal = C.game.personalGoal;
    // צורת "קבוצת הכוכבים יעל" – 7 נקודות קבועות
    const P = [[50, 82], [36, 64], [62, 60], [44, 44], [70, 38], [30, 26], [58, 16]];
    const lines = [[0, 1], [0, 2], [1, 3], [2, 3], [2, 4], [3, 5], [4, 6]];
    let s = `<svg viewBox="0 0 100 100" class="sky" role="img" aria-label="השמיים שלך: ${Math.min(st.length, goal)} מתוך ${goal} כוכבים">`;
    s += `<rect width="100" height="100" rx="6" fill="#16213e"/>`;
    for (let i = 0; i < 40; i++) { const x = (i * 37) % 100, y = (i * 53) % 100; s += `<circle cx="${x}" cy="${y}" r=".35" fill="#fff" opacity=".35"/>`; }
    lines.forEach(([a, b]) => { const on = a < st.length && b < st.length; s += `<line x1="${P[a][0]}" y1="${P[a][1]}" x2="${P[b][0]}" y2="${P[b][1]}" stroke="${on ? '#ffd27a' : '#ffffff'}" stroke-opacity="${on ? .9 : .15}" stroke-width="${on ? .8 : .4}" stroke-dasharray="${on ? '' : '1 1.5'}"/>`; });
    P.forEach(([x, y], i) => {
      const s0 = st[i];
      if (s0) s += `<circle cx="${x}" cy="${y}" r="5" fill="#ffd27a" opacity=".18"/><path d="${starPath(x, y, 3.6)}" fill="#ffd27a"/><text x="${x}" y="${y + 7.5}" font-size="3.6" fill="#fff" text-anchor="middle">${E(s0.pname)}</text>`;
      else s += `<circle cx="${x}" cy="${y}" r="2" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width=".5"/>`;
    });
    if (st.length >= goal) s += `<text x="50" y="97" font-size="4.6" fill="#ffd27a" text-anchor="middle" font-weight="700">קבוצת הכוכבים "יעל" הושלמה ✨</text>`;
    return s + '</svg>';
  }
  function mapPieces() {
    const n = players().length, th = C.game.thresholds, pcs = C.game.pieces;
    const open = th.filter(t => n >= t).length;
    let h = `<div class="lostmap" role="img" aria-label="המפה האבודה: נחשפו ${open} מתוך ${pcs.length} חלקים">`;
    pcs.forEach((p, i) => { h += `<div class="lm ${i < open ? 'on' : ''}" style="background-position:${(i % 3) * 50}% ${Math.floor(i / 3) * 100}%">${i < open ? '' : '<span aria-hidden="true">🔒</span>'}</div>`; });
    h += '</div>';
    const next = th[open];
    h += `<p class="small">${open >= pcs.length ? E(C.game.finale) : `<b>${n} משתתפים</b> שיחקו עד עכשיו (לפי העדכון האחרון שהגיע לטלפון שלך). החלק הבא נחשף ב-${next} משתתפים. ההתקדמות מתעדכנת בכל סריקה.`}</p>`;
    h += pcs.slice(0, open).map(p => `<details class="why"><summary>🗺️ ${E(p.title)}</summary><p>${E(p.fact)}</p></details>`).join('');
    return h;
  }
  function mapOpen() { return C.game.thresholds.filter(t => players().length >= t).length; }
  function viewHome() {
    const m = me(), st = stars(), goal = C.game.personalGoal, open = mapOpen(), total = C.game.pieces.length;
    const lr = S.get('lastResp', null);
    return `<h1>✨ ${E(C.game.name)}</h1>
      <p class="g-intro">נפגשים עם חבר/ה, עושים משימה יחד ואוספים כוכב. שבעה מפגשים משלימים את השמיים שלכם.</p>
      ${lr && lr.open ? `<a class="strip info" href="#game-done"><b>⏳ החבר/ה עוד לא סרק/ה את קוד הסיום?</b> לחצו כאן להצגה מחדש.</a>` : ''}
      <div class="g-progress"><div><b>${Math.min(st.length, goal)}</b> מתוך ${goal}<small>הכוכבים שלך</small></div><div><b>${open}</b> מתוך ${total}<small>המפה המשותפת</small></div></div>
      <div class="g-actions"><a class="btn" href="#game-show">📲 מציגים קוד</a><a class="btn secondary" href="#game-scan">📷 סורקים קוד</a></div>
      <div class="card g-sky">${skySvg()}
        <p class="small">${st.length < goal ? `כל כוכב = מפגש עם חבר/ה <b>שעוד לא שיחקתם יחד</b>.` : `השמיים שלכם הושלמו! כל מפגש נוסף עוזר לשכבה לפתוח את המפה.`}
        הכינוי שלכם: <b>${E(nameOf(m.name))}</b> <button class="linkbtn" data-g="rename">החלפה</button></p></div>
      <div class="card"><h2>🗺️ המפה המשותפת של השכבה</h2>${mapPieces()}</div>
      <div class="card soft small"><b>איך משחקים:</b> אחד לוחץ "מציגים קוד", השני סורק. עונים יחד על המשימה, ואז מי שהציג סורק את קוד הסיום – וכל אחד מקבל כוכב.<br>
      <b>כללים:</b> משחקים רק בעצירות, באוטובוס ובערב – לא בזמן הליכה. כוכב אחד עם כל חבר/ה. אין דירוג ואין מנצחים.<br>
      <b>פרטיות:</b> הכינוי נבחר אוטומטית ואין צורך בשם. בין הטלפונים עוברים רק כינוי ומזהים אקראיים.</div>
      <p class="footer-note">🤖 נבנה בעזרת בינה מלאכותית – ייתכנו טעויות</p>`;
  }
  function viewShow() {
    const code = makeInvite(), inv = S.get('pending'), ttl = C.game.inviteTtlSec;
    return `<p><a class="textlink" href="#game">→ חזרה לשמיים</a></p><h1>מציגים לחבר/ה</h1>
      <div class="card" style="text-align:center"><p><b>בקשו מהחבר/ה ללחוץ "סורקים קוד" ולסרוק:</b></p><div class="qrbox">${qrSvg(code)}</div>
      <p class="small muted">הקוד תקף ${Math.round(ttl / 60)} דקות.</p></div>
      <div class="card"><h2>אחרי המשימה</h2><p>על המסך של החבר/ה יופיע קוד סיום. סרקו אותו כדי לקבל את הכוכב שלכם:</p>
      <a class="btn block" href="#game-scanback">📷 סורקים את קוד הסיום</a></div>`;
  }
  function viewScan(back) {
    return `<p><a class="textlink" href="#game">→ חזרה לשמיים</a></p><h1>${back ? 'סריקת קוד הסיום' : 'סריקת קוד של חבר/ה'}</h1>
      <div class="scanbox"><video id="gvideo" muted playsinline></video></div>
      <p id="gscanmsg" class="small" role="status" aria-live="polite">פותח מצלמה…</p>
      <p class="small muted">המצלמה משמשת רק לקריאת הקוד. שום תמונה לא נשמרת או נשלחת.</p>`;
  }
  function viewPlay() {
    const inv = S.get('incoming', null); if (!inv) return viewHome();
    const ms = C.game.missions[inv.mission]; const L = ["א'", "ב'", "ג'", "ד'"];
    let body;
    if (ms.type === 'q') body = `<h2>${E(ms.q)}</h2><p class="small muted">מחליטים יחד ובוחרים תשובה.</p>` +
      ms.o.map((o, i) => `<button class="quiz-opt" data-g="ans" data-i="${i}"><span class="lt" aria-hidden="true">${L[i]}</span><span>${E(o)}</span></button>`).join('');
    else body = `<h2>${E(ms.q)}</h2><button class="btn block" data-g="ans" data-i="-1">✓ עשינו את זה יחד</button>`;
    return `<h1>משימה משותפת</h1><p>אתם ו<b>${E(nameOf(inv.fromName))}</b>, יחד:</p><div class="card">${body}<div id="gres" role="status" aria-live="polite"></div></div>`;
  }
  function viewDone() {
    const r = S.get('lastResp', null); if (!r) return viewHome();
    return `<h1>עכשיו מעבירים כוכב לחבר/ה</h1><div class="card" style="text-align:center"><p><b>הציגו לחבר/ה לסריקה</b> – במסך שלו/ה: "סורקים את קוד הסיום".</p>
      <div class="qrbox">${qrSvg(r.code)}</div></div>
      <button class="btn block" data-g="handoff">✓ החבר/ה סרק/ה – סיימנו</button>
      ${r.fact ? `<div class="card soft"><b>💡 הידעת?</b> ${E(r.fact)}</div>` : ''}`;
  }

  /* ---------- handlers ---------- */
  function onInviteScanned(txt) {
    const p = parse(txt); const msg = t => { const el = document.getElementById('gscanmsg'); if (el) el.innerHTML = t + ' <a href="#game-scan" data-g="rescan">נסו שוב</a>'; };
    if (!p) return msg('זה לא קוד של המשחק.');
    if (p[1] === 'R') return msg('זה קוד סיום – הוא נסרק במסך "סריקת קוד הסיום" אצל מי שהציג את הקוד הראשון.');
    const [, , id, nm, nonce, ts, mission, gos] = p;
    if (id === me().id) return msg('זה הקוד שלך 🙂 צריך לסרוק קוד של חבר/ה.');
    if (now() - Number(ts) > C.game.inviteTtlSec) return msg('הקוד פג תוקף. בקשו מהחבר/ה להציג קוד חדש.');
    if (hasPartner(id)) return msg('כבר יש לכם כוכב משותף 💛 חפשו מישהו/י שעוד לא שיחקתם יחד – וגם הוא/היא יקבל/תקבל כוכב.');
    mergeGossip(gos);
    S.set('incoming', { from: id, fromName: nm, nonce, mission: Number(mission) || 0 });
    location.hash = '#game-play';
  }
  function onAnswer(i) {
    const inv = S.get('incoming', null); if (!inv) return;
    const ms = C.game.missions[inv.mission]; const ok = ms.type !== 'q' || i === ms.a; const result = ms.type === 'q' ? (ok ? '1' : '0') : '1';
    if (ms.type === 'q') document.querySelectorAll('[data-g="ans"]').forEach(b => { b.disabled = true; const n = +b.dataset.i;
      const tag = (n === ms.a ? 'התשובה הנכונה' : '') + (n === i && n !== ms.a ? 'בחרתם' : n === i ? ' · בחרתם' : '');
      if (n === ms.a) b.classList.add('correct'); else if (n === i) b.classList.add('chosen');
      if (tag) b.insertAdjacentHTML('beforeend', `<em class="opt-tag">${tag}</em>`); });
    addStar(inv.from, nameOf(inv.fromName), inv.mission, result);
    const code = makeResponse(inv, result);
    S.set('lastResp', { code, open: true, fact: ms.fact || '' });
    S.set('incoming', null);
    const res = document.getElementById('gres');
    res.innerHTML = `<p class="verdict ok">⭐ נוסף כוכב על שיתוף הפעולה</p>${ms.type === 'q' ? `<p>${ok ? 'וגם צדקתם 👏' : `התשובה הנכונה היא ${E(ms.o[ms.a])}.`}</p>` : ''}<a class="btn block" href="#game-done">לקוד הסיום ←</a>`;
  }
  function onResponseScanned(txt) {
    const p = parse(txt); const msg = t => { const el = document.getElementById('gscanmsg'); if (el) el.innerHTML = t + ' <a href="#game-scanback" data-g="rescan">נסו שוב</a>'; };
    if (!p) return msg('זה לא קוד של המשחק.');
    if (p[1] !== 'R') return msg('זה קוד פתיחה. כאן סורקים את קוד הסיום שמופיע אצל החבר/ה אחרי המשימה.');
    const [, , id, nm, nonce, to, result, gos] = p; const inv = S.get('pending', null);
    if (to !== me().id || !inv || inv.nonce !== nonce) return msg('הקוד לא מתאים למשחק הנוכחי שלך. הציגו קוד חדש והתחילו שוב.');
    if (now() - inv.ts > C.game.inviteTtlSec * 3) return msg('עבר יותר מדי זמן. הציגו קוד חדש והתחילו שוב.');
    mergeGossip(gos);
    const added = addStar(id, nameOf(nm), inv.mission, result); S.set('pending', null);
    const ms = C.game.missions[inv.mission];
    const el = document.getElementById('main');
    el.innerHTML = `<h1>${added ? '⭐ קיבלתם כוכב!' : 'כבר יש לכם כוכב משותף'}</h1><p>${added ? `יש לכם עכשיו ${Math.min(stars().length, C.game.personalGoal)} מתוך ${C.game.personalGoal} כוכבים.` : 'חפשו מישהו/י חדש/ה למפגש הבא.'}</p>
      ${ms && ms.fact ? `<div class="card soft"><b>💡 הידעת?</b> ${E(ms.fact)}</div>` : ''}<a class="btn block" href="#game">לשמיים שלי</a>`;
  }

  document.addEventListener('click', e => {
    const t = e.target.closest('[data-g]'); if (!t) return;
    if (t.dataset.g === 'rename') { const m = me(); m.name = Math.floor(Math.random() * ANIMALS.length * COLORS.length); S.set('me', m); window.route(); }
    if (t.dataset.g === 'ans') onAnswer(Number(t.dataset.i));
    if (t.dataset.g === 'handoff') { const r = S.get('lastResp', null); if (r) { r.open = false; S.set('lastResp', r); } location.hash = '#game'; }
  });
  window.addEventListener('hashchange', () => { if (!/^#game-scan/.test(location.hash)) stopScan(); });

  window.TripGame = {
    view(arg) {
      if (!C.game) return '<p>המשחק לא זמין.</p>';
      if (arg === 'show') return viewShow();
      if (arg === 'scan') { setTimeout(() => startScan(onInviteScanned), 50); return viewScan(false); }
      if (arg === 'scanback') { setTimeout(() => startScan(onResponseScanned), 50); return viewScan(true); }
      if (arg === 'play') return viewPlay();
      if (arg === 'done') return viewDone();
      return viewHome();
    },
    stop: stopScan
  };
})();
