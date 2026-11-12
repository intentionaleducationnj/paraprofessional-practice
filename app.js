/* Paraprofessional Practice: course application (no framework, no build step). */
(() => {
  'use strict';
  // API base: an explicit <meta name="api-base"> (static hosting) wins; otherwise derive it from where app.css was served (same-origin hosting).
  const apiMeta = document.querySelector('meta[name="api-base"]');
  const BASE = apiMeta && apiMeta.content ? apiMeta.content.replace(/\/$/, '')
    : (document.querySelector('link[rel=stylesheet][href$="app.css"]') || {}).getAttribute
      ? document.querySelector('link[rel=stylesheet][href$="app.css"]').getAttribute('href').replace(/\/app\.css$/, '') : '';
  const app = document.getElementById('app');
  const nav = document.getElementById('nav');
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const h = (strings, ...vals) => strings.reduce((a, s, i) => a + s + (i < vals.length ? (vals[i] && vals[i].__raw ? vals[i].v : esc(vals[i])) : ''), '');
  const raw = v => ({ __raw: true, v });
  const paras = arr => raw(arr.map(p => `<p>${esc(p)}</p>`).join(''));
  const GOALS = {
    'lesson-1': 'Learn what you and the teacher each own, and how to work toward the same goal.',
    'lesson-2': 'Ask 5 questions before an activity so you never have to guess.',
    'lesson-3': 'Find the parts of a Behavior Intervention Plan (BIP) that guide your work.',
    'lesson-4': 'Learn 6 types of prompts and how a prompt differs from giving the answer.',
    'lesson-5': 'Give scholars time to try, then use the support your team approved.',
    'lesson-6': 'Keep communication tools in reach and let scholars speak for themselves.',
    'lesson-7': 'Raise a concern with your teacher and agree on 1 action to try.',
    'lesson-8': 'Welcome family questions, stay inside your role, and keep your phone away.',
    'lesson-9': 'Write down what you see, without opinions, so your team can use it.',
    'lesson-10': 'Know when to follow the plan, ask, call a supervisor, or act on safety.',
    'lesson-11': 'Bring it all together and leave with a plan for your school day.',
    'lab-a': 'Choose the right prompt in a fictional math story without giving the answer.',
    'lab-b': 'Protect thinking time and bring a question about reducing help to your teacher.',
    'lab-c': 'Follow a fictional scholar’s BIP during a hard transition.',
    'lab-d': 'Work through a disagreement with your teacher and agree on next steps.',
    'lab-e': 'Support a scholar who uses AAC and record what you observe.',
    'lab-f': 'Answer family questions and keep professional boundaries at dismissal.',
  };
  const GROUPS = {
    lessons: [
      { name: 'Start with your role', range: 'Lessons 1 to 3', blurb: 'Know your responsibilities and the plans you follow.', color: 'var(--read)', items: [1, 2, 3] },
      { name: 'Support scholar independence', range: 'Lessons 4 to 6', blurb: 'Learn when to help, when to wait, and how to support communication.', color: 'var(--sort)', items: [4, 5, 6] },
      { name: 'Communicate and document', range: 'Lessons 7 to 9', blurb: 'Strengthen your partnership and share information your team can use.', color: 'var(--decide)', items: [7, 8, 9] },
      { name: 'Put it into practice', range: 'Lessons 10 and 11', blurb: 'Know when to get help and make a plan for your school day.', color: 'var(--write)', items: [10, 11] },
    ],
    labs: [
      { name: 'Supporting scholars', range: 'Labs A to C', blurb: 'Prompts, thinking time, and following a plan.', color: 'var(--keep)', items: ['A', 'B', 'C'] },
      { name: 'Working with your team', range: 'Labs D to F', blurb: 'Your teacher, communication devices, and families.', color: 'var(--check)', items: ['D', 'E', 'F'] },
    ],
  };

  // ---------- storage (best effort) ----------
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } },
    del(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } },
  };

  // ---------- state ----------
  let CONFIG = null;       // public config
  let session = store.get('pp.session'); // {access_token, refresh_token, expires_at}
  let me = null;           // /api/me
  let pendingEmail = store.get('pp.pendingEmail') || '';

  // ---------- auth (GoTrue REST) ----------
  const authHeaders = () => ({ apikey: CONFIG.anonKey, 'content-type': 'application/json' });
  async function sendCode(email) {
    const r = await fetch(`${CONFIG.supabaseUrl}/auth/v1/otp`, { method: 'POST', headers: authHeaders(), body: JSON.stringify({ email, create_user: true }) });
    if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.msg || e.error_description || e.message || `Could not send a code (${r.status}).`); }
  }
  async function verifyCode(email, token) {
    const r = await fetch(`${CONFIG.supabaseUrl}/auth/v1/verify`, { method: 'POST', headers: authHeaders(), body: JSON.stringify({ type: 'email', email, token }) });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || !data.access_token) throw new Error(data.msg || data.error_description || 'That code did not work. Check the digits or request a new code.');
    setSession(data);
  }
  function setSession(data) {
    session = data ? { access_token: data.access_token, refresh_token: data.refresh_token, expires_at: data.expires_at || (Math.floor(Date.now() / 1000) + (data.expires_in || 3600)) } : null;
    if (session) store.set('pp.session', session); else store.del('pp.session');
  }
  async function refreshSession() {
    if (!session?.refresh_token) return false;
    const r = await fetch(`${CONFIG.supabaseUrl}/auth/v1/token?grant_type=refresh_token`, { method: 'POST', headers: authHeaders(), body: JSON.stringify({ refresh_token: session.refresh_token }) });
    if (!r.ok) { setSession(null); return false; }
    setSession(await r.json()); return true;
  }
  async function ensureFresh() {
    if (!session) return false;
    if (session.expires_at - Math.floor(Date.now() / 1000) < 90) return refreshSession();
    return true;
  }
  async function signOut() {
    try { if (session) await fetch(`${CONFIG.supabaseUrl}/auth/v1/logout`, { method: 'POST', headers: { ...authHeaders(), authorization: `Bearer ${session.access_token}` } }); } catch { /* ignore */ }
    setSession(null); me = null; go('#/');
  }

  // ---------- API ----------
  async function api(path, opts = {}) {
    if (!(await ensureFresh())) { const e = new Error('sign_in_required'); e.status = 401; throw e; }
    const doFetch = () => fetch(`${BASE}/api/${path}`, { method: opts.method || 'GET', headers: { authorization: `Bearer ${session.access_token}`, ...(opts.body ? { 'content-type': 'application/json' } : {}) }, body: opts.body ? JSON.stringify(opts.body) : undefined });
    let r = await doFetch();
    if (r.status === 401 && await refreshSession()) r = await doFetch();
    const data = r.status === 204 ? {} : await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(data.error || `request_failed_${r.status}`); e.status = r.status; e.data = data; throw e; }
    return data;
  }

  // ---------- router ----------
  const routes = [];
  const route = (re, fn) => routes.push({ re, fn });
  const go = hash => { if (location.hash === hash) render(); else location.hash = hash; };
  window.addEventListener('hashchange', render);

  async function render() {
    await saver.flush();
    const hash = location.hash || '#/';
    const path = hash.slice(1);
    for (const r of routes) {
      const m = path.match(r.re);
      if (m) {
        app.setAttribute('aria-busy', 'true');
        try { await r.fn(...m.slice(1)); }
        catch (e) {
          if (e.status === 401) { app.innerHTML = view.signin('Your session ended. Sign in again to continue. Your saved work is safe.'); }
          else if (e.status === 403) { app.innerHTML = view.noAccess(); }
          else { app.innerHTML = h`<div class="notice err"><strong>Something went wrong.</strong> ${e.message}. <button class="linkbtn" onclick="location.reload()">Reload</button></div>`; }
        }
        app.setAttribute('aria-busy', 'false');
        renderNav();
        window.scrollTo(0, 0);
        const first = app.querySelector('h1'); if (first) { first.setAttribute('tabindex', '-1'); first.focus({ preventScroll: true }); }
        return;
      }
    }
    go('#/');
  }

  function renderNav() {
    const signed = !!session;
    const entitled = !!me?.entitled;
    const navHtml = [
      entitled ? h`<a class="btn quiet sm" href="#/home">Course home</a><a class="btn quiet sm" href="#/tools">My tools</a>` : '',
      signed ? h`<a class="btn quiet sm" href="#/support">Support</a><button class="btn quiet sm" id="signout">Sign out</button>` : h`<a class="btn quiet sm" href="#/support">Support</a><a class="btn sm" href="#/signin">Sign in</a>`,
    ].join('');
    nav.innerHTML = navHtml;
    const navM = document.getElementById('nav-m'); if (navM) { navM.innerHTML = navHtml.replace('id="signout"', 'id="signout-m"'); const d = navM.closest('details'); if (d) d.open = false; }
    document.querySelectorAll('#signout, #signout-m').forEach(b => b.onclick = signOut);
  }

  async function loadMe(force) {
    if (!session) { me = null; return null; }
    if (me && !force) return me;
    me = await api('me');
    return me;
  }

  // ---------- autosave ----------
  const saver = {
    queue: new Map(), timer: null, status: null,
    schedule(item, key, value) {
      if (!this.queue.has(item)) this.queue.set(item, {});
      this.queue.get(item)[key] = value;
      this.setStatus('Saving…', '');
      clearTimeout(this.timer); this.timer = setTimeout(() => this.flush(), 900);
    },
    async flush() {
      if (!this.queue.size) return;
      const batch = this.queue; this.queue = new Map();
      try {
        for (const [item, fields] of batch) await api('responses', { method: 'POST', body: { item, fields } });
        this.setStatus(`Saved ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`, 'ok');
      } catch (e) {
        for (const [item, fields] of batch) this.queue.set(item, { ...(this.queue.get(item) || {}), ...fields });
        this.setStatus('Not saved. Check your connection.', 'err', true);
      }
    },
    setStatus(text, cls, retry) {
      const el = document.getElementById('savestatus'); if (!el) return;
      el.className = `status ${cls}`;
      el.innerHTML = `<span class="dot" aria-hidden="true"></span><span>${esc(text)}</span>${retry ? ' <button class="linkbtn" id="retrysave">Retry</button>' : ''}`;
      const b = document.getElementById('retrysave'); if (b) b.onclick = () => this.flush();
    },
  };
  window.addEventListener('beforeunload', () => { if (saver.queue.size) saver.flush(); });

  // ---------- views ----------
  const view = {
    landing() {
      const c = CONFIG.course;
      return h`<section class="fade">
        <p class="kicker">Paraprofessional training</p>
        <h1 class="hero">${c.title}</h1>
        <p class="hero-sub">${c.subtitle}</p>
        <p class="lede">${c.tagline}</p>
        <div class="row cta-row"><a class="btn" href="https://payhip.com/b/m0OU3">Get the course</a><a class="btn secondary" href="https://payhip.com/b/KG3NZ">Try Lesson 1 free</a><a class="btn quiet" href="#/signin">Sign in and begin</a></div>
        <div class="factbar"><div><b>11 lessons</b><span>Short, practical, in order</span></div><div><b>6 practice labs</b><span>Fictional classroom stories</span></div><div><b>9 printable tools</b><span>Use them at work</span></div><div><b>Certificate</b><span>After the knowledge check</span></div></div>
        <div class="actchips"><span style="background:var(--read)">READ</span><span style="background:var(--sort)">SORT</span><span style="background:var(--decide)">DECIDE</span><span style="background:var(--write)">WRITE</span><span style="background:var(--keep)">KEEP</span><span style="background:var(--check)">CHECK</span></div>
        <p class="reading promise">${c.promise}</p>

        <div class="grid-2">
          <div><h2 style="margin-top:0">What you will be able to do</h2><ul class="bullets">${raw(c.outcomes.map(o => `<li>${esc(o)}</li>`).join(''))}</ul></div>
          <div><h2 style="margin-top:0">Inside the course</h2>
            <p>You work through 11 lessons built on situations you face at work, then practice in 6 labs built around fictional stories. In each lesson you make decisions, read why each answer works or does not, write your own response, and build a tool for your team. You leave with 9 printable tools. At the end you take a 24-question knowledge check. Pass with 20 of 24, and retake it if you need to. Then you receive a certificate of course completion.</p>
            <p class="small muted">Self-paced and online. Your work saves to your account and follows you across devices. Purchased through Payhip. Access is tied to the email used at checkout.</p>
          </div>
        </div>
        <section class="founder-teaser"><p class="kicker">From the founder</p>${paras(c.founderLetter.paragraphs.slice(0, 2))}<p class="sig">${c.founderLetter.signature}<span>${c.founderLetter.role}</span></p><p><a class="btn quiet" href="https://payhip.com/b/KG3NZ">Try Lesson 1 free</a></p></section>
        <hr class="rule">
        ${raw(view.groupLicensing())}
        <hr class="rule">
        <p class="small muted reading">This is supplemental professional learning. Follow your school’s approved procedures, assigned responsibilities, and all required IEP and safety supports. The course is not a license, state certification, or district-approved credential. Nothing here replaces school policy, training, professional supervision, or an IEP team decision.</p>
      </section>`;
    },
    groupLicensing() {
      const g = CONFIG.course.groupLicensing;
      const mailto = `mailto:${g.email}?subject=${encodeURIComponent(g.subject)}&body=${encodeURIComponent(g.body)}`;
      return h`<section class="surface reading" id="group"><h2 style="margin-top:0">${g.heading}</h2>${paras(g.paragraphs.slice(0, 2))}
        <p>Please email <a href="${mailto}">${g.email}</a> with your school or district name, the number of staff members you would like to enroll, and your anticipated training timeline.</p>
        <p>${g.paragraphs[3]}</p>
        <p><a class="btn secondary" href="${mailto}">Email about group licensing</a></p>
        <p class="small muted" style="margin:0">${g.note}</p></section>`;
    },
    signin(message) {
      return h`<section class="reading center fade" style="max-width:560px">
        <p class="eyebrow">Sign in</p><h1>Enter your email and course key</h1>
        ${message ? raw(`<p class="notice warn">${esc(message)}</p>`) : ''}
        <p>Use the email you used at checkout and the course key from your purchase. No password to create or remember.</p>
        <form id="emailform" class="surface stack" novalidate>
          <div class="field"><label for="email">Purchase email</label><input id="email" name="email" type="email" autocomplete="email" inputmode="email" required value="${pendingEmail}"></div>
          <div class="field"><label for="key">Course key<span class="hint">Your Payhip receipt email and your Payhip purchase page both show it. School and district learners: use the key that came with your enrollment.</span></label><input id="key" name="key" type="text" autocomplete="off" autocapitalize="characters" spellcheck="false" required></div>
          <div class="row"><button class="btn" type="submit">Sign in</button></div>
          <p id="emailerr" class="notice err" hidden></p>
        </form>
        <p class="small muted" style="margin-top:20px">Cannot find your course key, or purchased with a different email? <a href="#/support">Visit support</a>. This device stays signed in until you sign out.</p>
      </section>`;
    },
    noAccess() {
      return h`<section class="reading center fade" style="max-width:640px">
        <p class="eyebrow">Signed in as ${me?.email || ''}</p><h1>This email does not have course access yet</h1>
        <p>Course access is tied to the email address used at checkout. If you purchased in the last few minutes, wait two minutes while we confirm the purchase, then choose Check again.</p>
        <div class="surface stack">
          <p style="margin:0"><strong>Purchased with a different email?</strong> Email <a href="mailto:${CONFIG.course.support.email}?subject=${encodeURIComponent('Paraprofessional Practice access: different email')}">${CONFIG.course.support.email}</a> from the address you used at checkout, and include the email you would like to use. We verify the order in Payhip before making a change.</p>
          <p style="margin:0"><strong>Not purchased yet?</strong> The course is sold through Payhip. Access begins after checkout.</p>
        </div>
        <div class="row" style="margin-top:20px"><button class="btn secondary" id="recheck">Check again</button><button class="btn quiet" id="signout2">Sign out</button></div>
      </section>`;
    },
    welcome() {
      const f = CONFIG.course.founderLetter;
      return h`<article class="reading center fade" style="max-width:680px">
        <p class="eyebrow">${CONFIG.course.title}</p><h1>${f.heading}</h1>
        ${paras(f.paragraphs)}
        <p style="margin-top:28px;font-family:var(--serif);font-size:1.35rem;color:var(--espresso)">${f.signature}</p>
        <p class="muted" style="margin-top:-12px">${f.role}</p>
        <div class="row" style="margin-top:32px"><a class="btn" href="#/orientation">Continue to how this works</a><a class="btn quiet" href="#/home">Skip to course home</a></div>
      </article>`;
    },
    orientation(choice) {
      const o = CONFIG.course.orientation;
      return h`<section class="reading center fade" style="max-width:680px">
        <p class="eyebrow">One question before you begin</p><h1>${o.question}</h1>
        <p class="muted">${o.note}</p>
        <div class="options" role="group" aria-label="${o.question}">${raw(o.options.map(x => `<button class="opt" data-choice="${esc(x.id)}" aria-pressed="${choice === x.id}"><span class="k" aria-hidden="true"></span><span>${esc(x.text)}</span></button>`).join(''))}</div>
        <div id="orient-tools"></div>
        <div class="row" style="margin-top:28px"><a class="btn" href="#/how">Continue</a></div>
      </section>`;
    },
    how() {
      return h`<section class="reading center fade" style="max-width:720px">
        <p class="eyebrow">How this works</p><h1>How the course works</h1>
        <p class="lede">Take it one lesson at a time. You can stop whenever the bell rings and pick up right where you left off.</p>
        <ol class="steps">
          <li><div><strong>Start with Lesson 1.</strong> Work through all 11 lessons and 6 practice labs in order. Each lesson shows you a classroom moment and teaches a skill you can use at work. You see examples, make decisions, write a response, and start a tool to keep. Each lab is a fictional story with several decisions. You can return to any lesson you finished.</div></li>
          <li><div><strong>Learn from each answer.</strong> After you make a choice, you see why it works or what to try instead. Nothing is scored here, and you can practice again. To finish a lesson, get each decision right at least 1 time, save your written response, and start the lesson tool.</div></li>
          <li><div><strong>Your work saves as you go.</strong> Check the save message at the top of each lesson. If it says Not saved, your connection dropped. Select Retry. Sign in on your phone or computer with the same email to pick up where you left off.</div></li>
          <li><div><strong>Practice with fictional stories.</strong> Do not enter real scholar names or anything that could identify a scholar. Keep real records in the systems your school approved.</div></li>
          <li><div><strong>Build 9 printable tools.</strong> Your answers fill in the tools, and you can print them to bring to work. You can also print blank copies for your classroom team, or download everything you wrote as a file.</div></li>
          <li><div><strong>Finish with the knowledge check.</strong> When the lessons and labs are done, take the 24-question knowledge check. Each question gives you a classroom situation and asks what you would do. Pass with ${CONFIG.course.assessment.passMark} of ${CONFIG.course.assessment.items}. You see an explanation for every answer, and you can retake a reshuffled version. Once you pass, print your certificate of course completion.</div></li>
        </ol>
        <p class="small muted">Accessibility: this course works with a keyboard alone, with screen readers, and at 200% zoom. Motion is minimal and honors your reduced-motion setting. If anything is hard to use, email ${CONFIG.course.support.email}.</p>
        <div class="row" style="margin-top:28px"><a class="btn" href="#/home">Go to course home</a></div>
      </section>`;
    },
    home(me, status) {
      const c = CONFIG.course;
      const st = k => status[k] || 'not_started';
      const pill = k => ({ complete: '<span class="pill done">Complete</span>', in_progress: '<span class="pill progress">In progress</span>', not_started: '<span class="pill">Not started</span>' })[st(k)];
      const doneL = c.lessons.filter(l => st(l.key) === 'complete').length, doneLab = c.labs.filter(l => st(l.key) === 'complete').length;
      const all = [...c.lessons, ...c.labs];
      const next = all.find(x => st(x.key) === 'in_progress') || all.find(x => st(x.key) !== 'complete');
      const allDone = doneL === 11 && doneLab === 6;
      const pct = Math.round(((doneL + doneLab) / 17) * 100);
      const href = x => `#/${x.key.startsWith('lab') ? 'lab' : 'lesson'}/${esc(x.key)}`;
      const action = x => st(x.key) === 'complete' ? 'Review' : st(x.key) === 'in_progress' ? 'Continue' : 'Start';
      const label = x => x.key.startsWith('lab') ? `Lab ${esc(x.letter)}` : `Lesson ${x.number}`;
      const row = x => `<li class="dash-row ${st(x.key)}"><span class="num">${x.key.startsWith('lab') ? esc(x.letter) : x.number}</span><div class="dash-main"><p class="dash-title">${esc(x.title)}</p><p class="dash-goal">${esc(GOALS[x.key] || '')}</p></div><div class="dash-act">${pill(x.key)}<a class="btn sm ${st(x.key) === 'complete' ? 'quiet' : st(x.key) === 'in_progress' ? '' : 'secondary'}" href="${href(x)}">${action(x)}<span class="visually-hidden"> ${label(x)}</span></a></div></li>`;
      const group = (g, items) => {
        const done = items.filter(x => st(x.key) === 'complete').length;
        const open = next && items.some(x => x.key === next.key);
        return `<details class="dash-group" ${open ? 'open' : ''}><summary><span class="dg-chip" style="background:${g.color}">${esc(g.range)}</span><span class="dg-text"><b>${esc(g.name)}</b><span>${esc(g.blurb)}</span></span><span class="dg-count">${done} of ${items.length}</span></summary><ol class="dash-list">${items.map(row).join('')}</ol></details>`;
      };
      const L = k => c.lessons.filter(l => k.includes(l.number)), B = k => c.labs.filter(l => k.includes(l.letter));
      const nextCard = next
        ? `<a class="nextstep" href="${href(next)}"><span class="ns-label">Your next step</span><span class="ns-title">${label(next)}: ${esc(next.title)}</span><span class="ns-goal">${esc(GOALS[next.key] || '')}</span><span class="btn">${action(next)} ${next.key.startsWith('lab') ? 'lab' : 'lesson'}</span></a>`
        : `<a class="nextstep" href="#/assessment"><span class="ns-label">Your next step</span><span class="ns-title">${me.completion ? 'View your certificate' : 'Take the knowledge check'}</span><span class="ns-goal">${me.completion ? 'You finished the course. Your certificate is ready to print.' : '24 questions. Pass with 20 correct answers. You can try again if you need to.'}</span><span class="btn">${me.completion ? 'Open certificate' : 'Start knowledge check'}</span></a>`;
      return h`<section class="fade dash">
        <p class="kicker">Paraprofessional Practice</p>
        <h1>Welcome to your course</h1>
        <p class="lede">You do important work. This is your space to build your skills, practice classroom decisions, and get ready for the day ahead. Start with Lesson 1. Your work saves as you go, so you can come back when you are ready.</p>
        ${me.notice ? raw(`<p class="notice warn">${esc(me.notice)}</p>`) : ''}
        <div class="dash-top">
          ${raw(nextCard)}
          <div class="progress-card">
            <p class="ns-label">Your progress</p>
            <p class="pc-big">${doneL + doneLab} of 17</p><p class="pc-sub">lessons and labs complete</p>
            <div class="pc-bar" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" aria-label="Course progress"><span style="width:${pct}%"></span></div>
            <div class="pc-stats"><div><b>${doneL}/11</b><span>Lessons</span></div><div><b>${doneLab}/6</b><span>Labs</span></div><div><b>${me.completion ? 'Passed' : allDone ? 'Ready' : 'Not open yet'}</b><span>${me.completion || allDone ? 'Knowledge check' : 'Knowledge check opens after 11 lessons and 6 labs'}</span></div></div>
          </div>
        </div>
        <h2>Your learning path</h2>
        <p class="muted">11 lessons in 4 parts. Open a part to see each lesson, its goal, and where you left off.</p>
        <div class="dash-groups">${raw(GROUPS.lessons.map(g => group(g, L(g.items))).join(''))}</div>
        <h2>Practice what you learned</h2>
        <p class="muted">6 labs built around fictional classroom stories. Each lab is yours to finish alone. The partner role-play is optional.</p>
        <div class="dash-groups">${raw(GROUPS.labs.map(g => group(g, B(g.items))).join(''))}</div>
        <div class="dash-cards">
          <a class="dcard" href="#/tools"><span class="dg-chip" style="background:var(--keep)">KEEP</span><b>My 9 printable tools</b><span>Tools you build during the course, print, and bring to work.</span><span class="dlink">Open my tools</span></a>
          <a class="dcard" href="#/assessment"><span class="dg-chip" style="background:var(--check)">CHECK</span><b>Your final knowledge check</b><span>24 questions. Pass with 20 correct answers. It opens after the lessons and labs.</span><span class="dlink">${me.completion ? 'View your certificate' : allDone ? 'Start knowledge check' : 'View completion requirements'}</span></a>
          <a class="dcard" href="#/welcome"><span class="dg-chip" style="background:var(--read)">READ</span><b>A note from Jaci</b><span>I started my career as a paraprofessional. I made this course because your work deserves preparation, support, and respect.</span><span class="dlink">Read the letter</span></a>
        </div>
        <div class="row" style="margin-top:28px"><button class="btn quiet sm" id="exportbtn">Download my work</button><a class="btn quiet sm" href="#/support">Get help</a></div>
        <p class="small muted" style="margin-top:18px">Take the course at your pace. You can finish a lesson, take a break, and come back when you are ready. Each lab includes an optional partner activity if you have someone to practice with.</p>
      </section>`;
    },
  };

  // ---------- block renderers ----------
  function renderBlock(b, ctx) {
    const { decisions, responses, item } = ctx;
    switch (b.type) {
      case 'why': case 'teach': case 'example': case 'note': {
        const cls = b.type === 'example' ? 'example' : b.type === 'note' ? 'note' : '';
        return `<section class="block ${b.type} ${cls}">${b.label ? `<p class="label">${esc(b.label)}</p>` : ''}${b.heading ? `<h2>${esc(b.heading)}</h2>` : ''}${(b.paragraphs || []).map(p => `<p>${esc(p)}</p>`).join('')}${b.bullets ? `<ul class="bullets">${b.bullets.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}</section>`;
      }
      case 'contrast':
        return `<section class="block"><h2>${esc(b.heading)}</h2><div class="contrast"><div class="col not"><h3>${esc(b.not.title)}</h3><ul>${b.not.items.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div><div class="col instead"><h3>${esc(b.instead.title)}</h3><ul>${b.instead.items.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div></div></section>`;
      case 'dialogue':
        return `<section class="block"><h2>${esc(b.heading)}</h2>${b.intro ? `<p>${esc(b.intro)}</p>` : ''}<div class="dialogue">${b.lines.map(l => `<div class="line"><span class="who">${esc(l.speaker)}</span><span>${esc(l.text)}</span></div>`).join('')}</div>${b.after ? `<p style="margin-top:14px">${esc(b.after)}</p>` : ''}</section>`;
      case 'steps':
        return `<section class="block"><h2>${esc(b.heading)}</h2>${b.intro ? `<p>${esc(b.intro)}</p>` : ''}<ol class="steps">${b.items.map(x => `<li><div>${esc(x)}</div></li>`).join('')}</ol></section>`;
      case 'summary':
        return `<section class="block summary surface"><h2>${esc(b.heading)}</h2><ul>${b.items.map(x => `<li>${esc(x)}</li>`).join('')}</ul></section>`;
      case 'decision': case 'check': {
        const d = decisions[b.id];
        const letters = 'ABCD';
        return `<section class="block interact" data-block="${esc(b.id)}" data-kind="${b.type}">
          <p class="label">${b.type === 'check' ? 'Knowledge check' : 'Decision practice'}</p>
          <h3>${esc(b.heading || b.question)}</h3>
          ${b.scenario ? `<p class="scenario">${esc(b.scenario)}</p>` : ''}${b.constraint ? `<p class="constraint">${esc(b.constraint)}</p>` : ''}
          <div class="options" role="group" aria-label="Choose one response">${b.options.map((o, i) => `<button class="opt ${d && d.choice === o.id ? (d.correct ? 'correct' : 'incorrect') : ''}" data-choice="${esc(o.id)}" aria-pressed="${d && d.choice === o.id}"><span class="k" aria-hidden="true">${letters[i]}</span><span>${esc(o.text)}</span></button>`).join('')}</div>
          <div class="fb" role="status" aria-live="polite">${d && d.solved && d.correct ? `<div class="feedback ok"><div class="fb-label">Answered correctly</div><p>Select any option to read its feedback again.</p></div>` : d ? `<div class="feedback no"><div class="fb-label">Not yet</div><p>Your last choice was not the strongest option. Choose again to read the reasoning.</p></div>` : ''}</div>
        </section>`;
      }
      case 'sort': {
        const d = decisions[b.id];
        return `<section class="block interact" data-block="${esc(b.id)}" data-kind="sort">
          <p class="label">Sort and explain</p><h3>${esc(b.heading)}</h3><p>${esc(b.instruction)}</p>
          <div class="sort">${b.items.map(it => `<div class="sort-row"><label for="${esc(b.id)}-${esc(it.id)}" style="margin:0;font-weight:400">${esc(it.text)}</label><div><select id="${esc(b.id)}-${esc(it.id)}" data-sortitem="${esc(it.id)}"><option value="">Choose…</option>${b.buckets.map(bk => `<option value="${esc(bk.id)}" ${d && d.placements && d.placements[it.id] === bk.id ? 'selected' : ''}>${esc(bk.text)}</option>`).join('')}</select><div class="res" data-res="${esc(it.id)}"></div></div></div>`).join('')}</div>
          <div class="row" style="margin-top:16px"><button class="btn secondary" data-checksort>Check my sorting</button>${d && d.solved ? '<span class="pill done">Completed</span>' : ''}</div>
          <div class="fb" role="status" aria-live="polite"></div></section>`;
      }
      case 'written': {
        const v = responses[b.id] || '';
        const rubricState = i => responses[`${b.id}.rubric.${i}`] === '1' ? 'checked' : '';
        return `<section class="block interact" data-block="${esc(b.id)}" data-kind="written">
          <p class="label">Written practice</p><h3>${esc(b.heading)}</h3><p>${esc(b.prompt)}</p>${b.guidance ? `<p class="muted small">${esc(b.guidance)}</p>` : ''}
          <div class="field"><label for="w-${esc(b.id)}">Your response</label><textarea id="w-${esc(b.id)}" data-save="${esc(b.id)}" rows="7">${esc(v)}</textarea><p class="privacy">${esc(CONFIG.course.privacyNote)} Aim for at least ${b.minChars || 40} characters.</p></div>
          <div class="row"><button class="btn secondary sm" data-savenow>Save response</button><button class="btn quiet sm" data-showmodel aria-expanded="false">Show a model</button><button class="btn quiet sm" data-clear>Clear and rewrite</button></div>
          <div class="model" hidden><p class="label">One model response</p><p>${esc(b.model)}</p><p class="small muted" style="margin:0">A model is one good answer, not the only one. Rate your own response against the points below.</p></div>
          <p style="margin:16px 0 0"><strong>Self-check</strong> <span class="muted small">(your rating, for you)</span></p>
          <ul class="rubric">${b.rubric.map((r, i) => `<li><input type="checkbox" id="r-${esc(b.id)}-${i}" data-rubric="${esc(b.id)}.rubric.${i}" ${rubricState(i)}><label for="r-${esc(b.id)}-${i}" style="font-weight:400;margin:0">${esc(r)}</label></li>`).join('')}</ul>
        </section>`;
      }
      case 'tool':
        return `<section class="block interact tool-fields" data-block="${esc(b.id)}" data-kind="tool">
          <p class="label">Your tool</p><h3>${esc(b.heading)}</h3><p>${esc(b.description)}</p>
          ${b.fields.map(f => `<div class="field"><label for="t-${esc(b.id)}-${esc(f.id)}">${esc(f.label)}${f.hint ? `<span class="hint">${esc(f.hint)}</span>` : ''}</label><textarea id="t-${esc(b.id)}-${esc(f.id)}" data-save="${esc(b.id)}.${esc(f.id)}" rows="2">${esc(responses[`${b.id}.${f.id}`] || '')}</textarea></div>`).join('')}
          <p class="privacy">${esc(CONFIG.course.privacyNote)}</p>
          <div class="row"><button class="btn secondary sm" data-savenow>Save tool</button><a class="btn quiet sm" href="#/tools">Open My tools to print</a></div>
        </section>`;
      default: return '';
    }
  }

  function reqList(reqs) {
    return `<ul class="reqs">${reqs.map(r => `<li class="${r.met ? 'met' : 'unmet'}">${r.met ? 'Done' : 'To do'}: <a href="#" data-jump="${esc(r.id)}">${esc(r.label)}</a></li>`).join('')}</ul>`;
  }

  function pathNav(kind, it) {
    const kinds = it.blocks.map(b => b.type);
    const steps = [
      ['READ', 'var(--read)', ['why', 'teach', 'example', 'contrast', 'dialogue', 'steps']],
      ['SORT', 'var(--sort)', ['sort']], ['DECIDE', 'var(--decide)', ['decision']],
      ['WRITE', 'var(--write)', ['written']], ['KEEP', 'var(--keep)', ['tool']], ['CHECK', 'var(--check)', ['check']],
    ].filter(([, , t]) => t.some(x => kinds.includes(x)));
    return `<nav class="pathnav" aria-label="Jump to a part of this ${kind}">${steps.map(([n, c, t]) => `<button type="button" class="pn-chip" style="--c:${c}" data-goto="${t.join(',')}">${n}</button>`).join('<span class="pn-arrow" aria-hidden="true">›</span>')}<span class="pn-arrow" aria-hidden="true">›</span><button type="button" class="pn-chip pn-finish" data-goto="finish">FINISH</button></nav>`;
  }

  // ---------- lesson / lab page ----------
  async function itemPage(kind, key) {
    await loadMe();
    if (!me) { app.innerHTML = view.signin(); wire.signin(); return; }
    if (!me.entitled) { app.innerHTML = view.noAccess(); wire.noAccess(); return; }
    const data = await api(`content/${encodeURIComponent(key)}`);
    const it = data.item; const c = CONFIG.course;
    const list = kind === 'lesson' ? c.lessons : c.labs;
    const idx = list.findIndex(x => x.key === key);
    const prev = idx > 0 ? list[idx - 1] : null; const next = idx < list.length - 1 ? list[idx + 1] : null;
    const nextHref = next ? `#/${kind}/${next.key}` : (kind === 'lesson' ? '#/lab/lab-a' : '#/assessment');
    const nextLabel = next ? `Next: ${next.title}` : (kind === 'lesson' ? 'Continue to the practice labs' : 'Continue to the knowledge check');
    const ctx = { decisions: data.decisions, responses: data.responses, item: key };
    const complete = data.status === 'complete';
    app.innerHTML = `<article class="fade">
      <p class="crumb"><a href="#/home">Course home</a> › ${kind === 'lesson' ? `Lesson ${it.number} of 11` : `Lab ${esc(it.letter)} of 6`}</p>
      <div class="row" style="justify-content:space-between"><p class="eyebrow" style="margin:0">${kind === 'lesson' ? `Lesson ${it.number}` : `Practice lab ${esc(it.letter)}`}</p><span id="savestatus" class="status ${complete ? 'ok' : ''}"><span class="dot" aria-hidden="true"></span><span>${complete ? 'Complete' : 'Saved to your account as you work'}</span></span></div>
      <h1>${esc(it.title)}</h1>
      <p class="outcome">${esc(it.outcome)}</p>
      ${pathNav(kind, it)}
      ${kind === 'lab' ? `<section class="setup"><p class="label">The setup</p><p>${esc(it.setup.scene)}</p><p style="margin:10px 0 0"><strong>Approved supports and directions in this scene</strong></p><ul>${it.setup.approved.map(a => `<li>${esc(a)}</li>`).join('')}</ul><p class="small muted" style="margin:12px 0 0">Work through every scene on your own. The partner role-play at the end is optional.</p></section>` : ''}
      <div class="reading">${it.blocks.map(b => renderBlock(b, ctx)).join('')}</div>
      ${kind === 'lab' ? `<details class="block roleplay rp-wrap"><summary><span class="dg-chip" style="background:#fff">OPTIONAL</span> Partner role-play</summary><p>If you have a colleague, use these role cards and the debrief. The observer scores evidence-centered language, listening, role clarity, and whether a next step was agreed, using the rubric below.</p><div class="cards"><div class="card"><h4>Teacher</h4><p style="margin:0">${esc(it.roleplay.teacher)}</p></div><div class="card"><h4>Paraprofessional</h4><p style="margin:0">${esc(it.roleplay.para)}</p></div><div class="card"><h4>Observer</h4><p style="margin:0">${esc(it.roleplay.observer)}</p></div></div><details><summary>Debrief questions</summary><ul class="bullets">${it.roleplay.debrief.map(d => `<li>${esc(d)}</li>`).join('')}</ul></details><details><summary>Lab performance rubric (0, 1, 2)</summary><ul class="bullets">${(data.item.rubric || []).map(r => `<li>${esc(r)}</li>`).join('')}</ul></details></details>` : ''}
      <section class="block done-box" id="donebox">
        <div style="flex:1;min-width:240px"><strong>${complete ? `${kind === 'lesson' ? 'Lesson' : 'Lab'} complete. Your work is saved.` : `Finish this ${kind}`}</strong>
          <p class="small muted" style="margin:4px 0 0">${complete ? 'You are ready for the next activity. You can come back and change your written work any time.' : `Finish the activities listed below to complete this ${kind}. The button checks your work and shows anything still open.`}</p>
          <div id="reqs">${complete ? '' : reqList(data.requirements)}</div></div>
        ${complete ? '' : `<button class="btn" id="markdone">Mark ${kind} complete</button>`}
      </section>
      <nav class="pager" aria-label="Lesson navigation">${prev ? `<a class="btn quiet" href="#/${kind}/${esc(prev.key)}">Previous: ${esc(prev.title)}</a>` : `<a class="btn quiet" href="#/home">Course home</a>`}<a class="btn ${complete ? '' : 'secondary'}" href="${nextHref}">${esc(nextLabel)}</a></nav>
    </article>`;
    wire.item(key, kind, data);
    app.querySelectorAll('[data-goto]').forEach(b => b.onclick = () => {
      const want = b.dataset.goto.split(',');
      const el = want[0] === 'finish' ? document.getElementById('donebox')
        : [...app.querySelectorAll('section.block')].find(s => want.some(t => s.classList.contains(t) || s.dataset.kind === t || (t === 'decision' && s.dataset.kind === 'decision')));
      if (el) { const hd = document.querySelector('header'); const y = el.getBoundingClientRect().top + scrollY - ((hd && getComputedStyle(hd).position !== 'static' ? hd.offsetHeight : 0) + 20); scrollTo({ top: y, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); el.setAttribute('tabindex', '-1'); el.focus({ preventScroll: true }); }
    });
  }

  // ---------- wiring ----------
  const wire = {
    signin() {
      const f = document.getElementById('emailform'); if (!f) return;
      const msgs = { no_match: 'That email and course key do not match a purchase. Check both, including the email you used at checkout.', access_revoked: 'This course key is no longer active. A refund turns a key off. Email support if that is not right.', too_many_attempts: 'Too many tries. Wait 15 minutes, then try again.', not_configured: 'Sign-in is being set up. Please try again in a few minutes.', bad_email: 'Enter a complete email address.', bad_key: 'Enter the full course key.' };
      f.onsubmit = async e => {
        e.preventDefault(); const email = f.email.value.trim().toLowerCase(); const key = f.key.value.trim(); const err = document.getElementById('emailerr');
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { err.textContent = msgs.bad_email; err.hidden = false; f.email.focus(); return; }
        if (key.length < 6) { err.textContent = msgs.bad_key; err.hidden = false; f.key.focus(); return; }
        const btn = f.querySelector('button[type=submit]'); btn.disabled = true; err.hidden = true;
        try {
          const r = await fetch(`${BASE}/api/public/signin`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, key }) });
          const d = await r.json().catch(() => ({}));
          if (!r.ok || !d.access_token) throw new Error(msgs[d.error] || `Sign-in did not work (${r.status}). Try again.`);
          setSession(d); pendingEmail = email; store.set('pp.pendingEmail', email); me = null; await loadMe(true);
          go(me.entitled ? '#/home' : '#/noaccess');
        } catch (ex) { err.textContent = ex.message; err.hidden = false; btn.disabled = false; }
      };
    },
    noAccess() {
      const r = document.getElementById('recheck'); if (r) r.onclick = async () => { r.disabled = true; await loadMe(true); if (me.entitled) go('#/home'); else { r.disabled = false; r.textContent = 'Still no access. Check again'; } };
      const s = document.getElementById('signout2'); if (s) s.onclick = signOut;
    },
    item(key, kind, data) {
      const root = app;
      // decisions and checks
      root.querySelectorAll('[data-kind=decision],[data-kind=check]').forEach(sec => {
        sec.querySelectorAll('.opt').forEach(btn => btn.onclick = async () => {
          const blockId = sec.dataset.block; const choice = btn.dataset.choice;
          sec.querySelectorAll('.opt').forEach(o => { o.setAttribute('aria-pressed', 'false'); o.classList.remove('correct', 'incorrect'); });
          btn.setAttribute('aria-pressed', 'true'); btn.disabled = true;
          try {
            const r = await api('answer', { method: 'POST', body: { item: key, block: blockId, choice } });
            btn.classList.add(r.correct ? 'correct' : 'incorrect');
            sec.querySelector('.fb').innerHTML = `<div class="feedback ${r.correct ? 'ok' : 'no'}"><div class="fb-label">${r.correct ? 'Strong choice' : 'Not the strongest choice'}</div><p>${esc(r.text)}</p>${r.correct ? '' : '<p class="small" style="margin-top:8px">Choose another option to try again. Nothing is scored here.</p>'}</div>`;
            refreshReqs();
          } catch (e) { sec.querySelector('.fb').innerHTML = `<div class="notice err">Could not record that choice (${esc(e.message)}). Check your connection and try again.</div>`; }
          btn.disabled = false;
        });
      });
      // sorts
      root.querySelectorAll('[data-kind=sort]').forEach(sec => {
        sec.querySelector('[data-checksort]').onclick = async () => {
          const placements = {}; sec.querySelectorAll('select[data-sortitem]').forEach(s => { if (s.value) placements[s.dataset.sortitem] = s.value; });
          const missing = [...sec.querySelectorAll('select[data-sortitem]')].filter(s => !s.value);
          if (missing.length) { sec.querySelector('.fb').innerHTML = `<div class="notice warn">Choose a category for every item first.</div>`; missing[0].focus(); return; }
          try {
            const r = await api('sort', { method: 'POST', body: { item: key, block: sec.dataset.block, placements } });
            r.results.forEach(res => { const el = sec.querySelector(`[data-res="${res.id}"]`); el.className = `res ${res.correct ? 'ok' : 'no'}`; el.textContent = `${res.correct ? 'Correct.' : 'Not quite.'} ${res.explain}`; });
            sec.querySelector('.fb').innerHTML = r.solved ? `<div class="feedback ok"><div class="fb-label">All sorted correctly</div><p>Read the explanations above once more. They are the point.</p></div>` : `<div class="feedback no"><div class="fb-label">Some items need another look</div><p>Read the explanation under each item, adjust, and check again.</p></div>`;
            refreshReqs();
          } catch (e) { sec.querySelector('.fb').innerHTML = `<div class="notice err">Could not check (${esc(e.message)}).</div>`; }
        };
      });
      // autosave text
      root.querySelectorAll('[data-save]').forEach(ta => {
        ta.addEventListener('input', () => saver.schedule(key, ta.dataset.save, ta.value));
        ta.addEventListener('blur', () => saver.flush().then(refreshReqs));
      });
      root.querySelectorAll('[data-rubric]').forEach(cb => cb.addEventListener('change', () => { saver.schedule(key, cb.dataset.rubric, cb.checked ? '1' : '0'); }));
      root.querySelectorAll('[data-savenow]').forEach(b => b.onclick = async () => { b.closest('section').querySelectorAll('[data-save]').forEach(ta => saver.schedule(key, ta.dataset.save, ta.value)); await saver.flush(); refreshReqs(); });
      root.querySelectorAll('[data-showmodel]').forEach(b => b.onclick = () => { const m = b.closest('section').querySelector('.model'); m.hidden = !m.hidden; b.setAttribute('aria-expanded', String(!m.hidden)); b.textContent = m.hidden ? 'Show a model' : 'Hide the model'; });
      root.querySelectorAll('[data-clear]').forEach(b => b.onclick = () => { const ta = b.closest('section').querySelector('textarea[data-save]'); if (ta.value && !confirm('Clear your response and start again? Your previous text will be replaced when you save.')) return; ta.value = ''; ta.focus(); saver.schedule(key, ta.dataset.save, ''); });
      // completion
      async function refreshReqs() {
        const box = document.getElementById('reqs'); if (!box) return;
        try { const d = await api(`content/${encodeURIComponent(key)}`); box.innerHTML = d.status === 'complete' ? '' : reqList(d.requirements); wireJumps(); } catch { /* ignore */ }
      }
      function wireJumps() { root.querySelectorAll('[data-jump]').forEach(a => a.onclick = e => { e.preventDefault(); const t = root.querySelector(`[data-block="${a.dataset.jump}"]`); if (t) { t.scrollIntoView({ behavior: 'smooth', block: 'start' }); const f = t.querySelector('button,textarea,select'); if (f) f.focus({ preventScroll: true }); } }); }
      wireJumps();
      const md = document.getElementById('markdone');
      if (md) md.onclick = async () => {
        md.disabled = true; await saver.flush();
        try {
          const r = await api('complete', { method: 'POST', body: { item: key } });
          if (r.ok) { me = null; await loadMe(true); itemPage(kind, key); }
        } catch (e) {
          if (e.status === 409 && e.data?.requirements) { document.getElementById('reqs').innerHTML = `<p class="small" style="margin:8px 0 0;color:var(--err-ink)">A few things are still open:</p>${reqList(e.data.requirements)}`; wireJumps(); }
          else document.getElementById('reqs').innerHTML = `<div class="notice err">Could not mark complete (${esc(e.message)}).</div>`;
          md.disabled = false;
        }
      };
    },
  };

  // ---------- routes ----------
  route(/^\/$/, async () => { await loadMe(); if (me?.entitled) { go('#/home'); return; } app.innerHTML = view.landing(); });
  route(/^\/signin$/, async () => { await loadMe(); if (me) { go(me.entitled ? '#/home' : '#/noaccess'); return; } app.innerHTML = view.signin(); wire.signin(); });
  route(/^\/noaccess$/, async () => { await loadMe(true); if (!me) { go('#/signin'); return; } if (me.entitled) { go('#/home'); return; } app.innerHTML = view.noAccess(); wire.noAccess(); });
  route(/^\/welcome$/, async () => { await loadMe(); if (!me?.entitled) { go(me ? '#/noaccess' : '#/signin'); return; } store.set('pp.seenWelcome', true); app.innerHTML = view.welcome(); });
  route(/^\/orientation$/, async () => {
    await loadMe(); if (!me?.entitled) { go(me ? '#/noaccess' : '#/signin'); return; }
    let choice = me.profile?.orientation_choice || '';
    const paint = () => { app.innerHTML = view.orientation(choice); const o = CONFIG.course.orientation.options.find(x => x.id === choice); document.getElementById('orient-tools').innerHTML = o ? `<div class="surface" style="margin-top:18px"><p class="label">Tools you will build first</p><ul class="bullets" style="margin:0">${o.tools.map(t => `<li>${esc(t)}</li>`).join('')}</ul></div>` : ''; app.querySelectorAll('.opt').forEach(b => b.onclick = async () => { choice = b.dataset.choice; paint(); try { await api('profile', { method: 'POST', body: { orientation_choice: choice } }); me.profile = { ...(me.profile || {}), orientation_choice: choice }; } catch { /* ignore */ } }); };
    paint();
  });
  route(/^\/how$/, async () => { await loadMe(); app.innerHTML = view.how(); });
  route(/^\/home$/, async () => {
    await loadMe(true); if (!me) { app.innerHTML = view.signin(); wire.signin(); return; } if (!me.entitled) { app.innerHTML = view.noAccess(); wire.noAccess(); return; }
    const status = {}; (me.progress || []).forEach(p => status[p.item_key] = p.status);
    app.innerHTML = view.home(me, status);
    if (!store.get('pp.noteSeen')) {
      const f = CONFIG.course.founderLetter, first = !(me.progress || []).length;
      const dlg = document.createElement('dialog'); dlg.className = 'note-pop'; dlg.setAttribute('aria-labelledby', 'note-h');
      dlg.innerHTML = `<div class="np-bar" aria-hidden="true"></div><p class="kicker">Welcome to Paraprofessional Practice</p><h2 id="note-h">${esc(f.heading)}</h2>${f.paragraphs.map(x => `<p>${esc(x)}</p>`).join('')}<p class="np-sig">${esc(f.signature)}<span>${esc(f.role)}</span></p><div class="row np-actions">${first ? '<a class="btn" href="#/lesson/lesson-1" data-close>Start Lesson 1</a><button class="btn quiet" type="button" data-close>See my course home</button>' : '<button class="btn" type="button" data-close>Go to my course</button>'}</div>`;
      document.body.appendChild(dlg);
      const done = () => { store.set('pp.noteSeen', true); if (dlg.open) dlg.close(); dlg.remove(); };
      dlg.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', done));
      dlg.addEventListener('cancel', done);
      if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', ''); const hh = dlg.querySelector('#note-h'); hh.setAttribute('tabindex', '-1'); hh.focus({ preventScroll: true }); dlg.scrollTop = 0;
    }
    document.getElementById('exportbtn').onclick = async () => { try { const d = await api('export'); const blob = new Blob([JSON.stringify(d, null, 2)], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'paraprofessional-practice-my-work.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000); } catch (e) { alert(`Could not export: ${e.message}`); } };
  });
  route(/^\/lesson\/(lesson-\d{1,2})$/, key => itemPage('lesson', key));
  route(/^\/lab\/(lab-[a-f])$/, key => itemPage('lab', key));
  route(/^\/tools$/, toolsPage);
  route(/^\/assessment$/, assessmentPage);
  route(/^\/certificate$/, certificatePage);
  route(/^\/support$/, async () => { await loadMe(); app.innerHTML = supportView(); });
  route(/^\/verify\/([A-Za-z0-9-]+)$/, async code => {
    const r = await fetch(`${BASE}/verify/${encodeURIComponent(code)}`); const d = await r.json().catch(() => ({ valid: false }));
    app.innerHTML = d.valid ? h`<section class="reading center" style="max-width:600px"><p class="eyebrow">Certificate verification</p><h1>Valid certificate</h1><div class="surface stack"><p style="margin:0"><strong>${d.name}</strong></p><p style="margin:0">${d.course}</p><p style="margin:0" class="muted">Completed ${new Date(d.completed_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}, certificate ${d.certificate_id}</p><p class="small muted" style="margin:0">${d.note}</p></div></section>` : h`<section class="reading center" style="max-width:600px"><p class="eyebrow">Certificate verification</p><h1>No certificate found</h1><p>Check the code and try again. Codes look like PP-XXXX-XXXX.</p></section>`;
  });

  function supportView() {
    const s = CONFIG.course.support.email;
    return h`<section class="reading center fade" style="max-width:720px">
      <p class="eyebrow">Support</p><h1>Saving, printing, access, and privacy</h1>
      <h2 style="margin-top:0">Saving and resuming</h2>
      <p>Your decisions, written practice, and tools save to your account as you work. The save status near the top of each lesson tells you when the last save happened. If it reads not saved, your connection dropped. Press Retry, or keep working and it will retry on its own. Sign in from any device with the same email and your work is there. You can also download everything you have written from Course home.</p>
      <h2>Signing in</h2>
      <p>Sign in with the email you used at checkout and your course key. Your course key is in your Payhip receipt email and on your Payhip purchase page. School and district learners receive their key with their enrollment. Each device stays signed in until you sign out. If you purchased with a different email than the one you use, email <a href="mailto:${s}?subject=${encodeURIComponent('Paraprofessional Practice access: different email')}">${s}</a> from the purchase address and tell us which email you would like to use. We confirm the order before making a change.</p>
      <h2>Printing</h2>
      <p>Open My tools, choose a tool, and use Print filled or Print blank. Your browser’s print dialog can save a PDF. The certificate prints from the completion page.</p>
      <h2>What we store and why</h2>
      <p>Your email address, your purchase record from Payhip (transaction id, product, amount, date), your course progress and written responses, your assessment attempts, your certificate record, and basic security logs (sign-in sessions and webhook events). Supabase hosts the database and authentication. Payhip processes payment. Microsoft 365 sends email. We do not sell or share your data, and we do not use it for advertising.</p>
      <p>Never enter scholar names, student records, or identifying information about children or families. Every text field is for practice with fictional details. Real records belong only in your school’s authorized systems.</p>
      <p>To request deletion of your account and all stored responses, email <a href="mailto:${s}?subject=${encodeURIComponent('Paraprofessional Practice: delete my data')}">${s}</a> from your purchase email. We honor requests within 30 days. Purchase records needed for accounting are retained as required.</p>
      <h2>Use policy</h2>
      <p>Each purchase licenses one learner. Group licensing for schools and districts gives every staff member their own account. The course is supplemental professional learning and is not a license, state certification, or continuing education credit. Nothing in it replaces your school’s policies, training, supervision, or an IEP team’s decisions.</p>
      ${raw(view.groupLicensing())}
      <p class="small muted" style="margin-top:24px">Intentional Education LLC, intentionaleducation.us, ${s}</p>
    </section>`;
  }

  // ---------- tools page ----------
  async function toolsPage() {
    await loadMe(); if (!me) { app.innerHTML = view.signin(); wire.signin(); return; } if (!me.entitled) { app.innerHTML = view.noAccess(); wire.noAccess(); return; }
    const d = await api('tools');
    app.innerHTML = `<section class="fade"><p class="eyebrow">My tools</p><h1>Your printable tools</h1>
      <p class="lede reading">These are your tools to use at work. Open a tool to add your ideas, or print a blank copy to use with your team. Your work saves to your account.</p>
      <p class="privacy reading">${esc(d.privacyNote)} Real records belong only in your school’s authorized systems.</p>
      <div class="row" style="margin:10px 0 28px"><span id="savestatus" class="status"><span class="dot" aria-hidden="true"></span><span>Edits save to your account</span></span></div>
      ${d.tools.map((t, ti) => { const [itemKey, blockId] = (t.sourceItem || ':').split(':'); const started = t.fields.some(f => (t.values[f.id] || '').trim()); return `<details class="toolcard" id="tool-${esc(t.id)}" data-print="filled">
        <summary><span class="tc-num">${ti + 1}</span><span class="tc-text"><b>${esc(t.title)}</b><span>${esc(t.purpose)}</span></span>${started ? '<span class="pill done">Started</span>' : '<span class="pill">Not started</span>'}</summary>
        ${t.fields.map(f => `<div class="field"><label for="tl-${esc(t.id)}-${esc(f.id)}">${esc(f.label)}${f.hint ? `<span class="hint">${esc(f.hint)}</span>` : ''}</label><textarea id="tl-${esc(t.id)}-${esc(f.id)}" rows="2" data-item="${esc(itemKey)}" data-save="${esc(blockId)}.${esc(f.id)}">${esc(t.values[f.id] || '')}</textarea><div class="print-only print-lines"></div></div>`).join('')}
        <div class="row no-print"><button class="btn secondary sm" data-printfilled="${esc(t.id)}">Print filled</button><button class="btn quiet sm" data-printblank="${esc(t.id)}">Print blank</button><a class="btn quiet sm" href="#/${itemKey.startsWith('lab') ? 'lab' : 'lesson'}/${esc(itemKey)}">Open its ${itemKey.startsWith('lab') ? 'lab' : 'lesson'}</a></div>
      </details>`; }).join('')}</section>`;
    app.querySelectorAll('textarea[data-save]').forEach(ta => { ta.addEventListener('input', () => saver.schedule(ta.dataset.item, ta.dataset.save, ta.value)); ta.addEventListener('blur', () => saver.flush()); });
    const printOne = (id, blank) => {
      const card = document.getElementById(`tool-${id}`); card.open = true;
      const style = document.createElement('style'); style.id = 'printstyle';
      style.textContent = `@media print { .toolcard:not(#tool-${id}) , .lede, .privacy, h1, .eyebrow { display:none !important } ${blank ? `#tool-${id} textarea{display:none !important} #tool-${id} .print-lines{display:block !important;height:60px}` : `#tool-${id} .print-lines{display:none !important}`} }`;
      document.head.appendChild(style); card.setAttribute('data-print', blank ? 'blank' : 'filled');
      window.print(); setTimeout(() => style.remove(), 1000);
    };
    app.querySelectorAll('[data-printfilled]').forEach(b => b.onclick = () => printOne(b.dataset.printfilled, false));
    app.querySelectorAll('[data-printblank]').forEach(b => b.onclick = () => printOne(b.dataset.printblank, true));
  }

  // ---------- assessment ----------
  async function assessmentPage() {
    await loadMe(true); if (!me) { app.innerHTML = view.signin(); wire.signin(); return; } if (!me.entitled) { app.innerHTML = view.noAccess(); wire.noAccess(); return; }
    const st = await api('assessment/status');
    const titles = {}; [...CONFIG.course.lessons, ...CONFIG.course.labs].forEach(x => titles[x.key] = x.title);
    if (st.passed || me.completion) { return completionView(st); }
    if (st.missing.length) {
      app.innerHTML = `<section class="reading center fade" style="max-width:700px"><p class="eyebrow">Final application</p><h1>Finish the lessons and labs first</h1><p>The knowledge check opens when all eleven lessons and six labs are complete. Still open:</p><ul class="bullets">${st.missing.map(k => `<li><a href="#/${k.startsWith('lab') ? 'lab' : 'lesson'}/${esc(k)}">${esc(titles[k] || k)}</a></li>`).join('')}</ul><p><a class="btn" href="#/home">Back to course home</a></p></section>`;
      return;
    }
    const prior = st.attempts.filter(a => a.submitted_at);
    app.innerHTML = `<section class="reading center fade" style="max-width:720px"><p class="eyebrow">Final application</p><h1>Scenario-based knowledge check</h1>
      <p>${st.total} questions mapped to the lessons and labs. Every option has an explanation, shown after you submit. Pass mark: <strong>${st.passMark} of ${st.total}</strong> (80%). You can retake with a reshuffled set. Take your time. There is no timer.</p>
      ${prior.length ? `<div class="notice"><strong>Previous attempts:</strong> ${prior.map(a => `Attempt ${a.attempt_no}: ${a.score} of ${a.total}`).join(', ')}</div>` : ''}
      <p style="margin-top:20px"><button class="btn" id="start">${st.open ? 'Continue the knowledge check' : prior.length ? 'Start a new attempt' : 'Start the knowledge check'}</button></p></section>`;
    document.getElementById('start').onclick = async () => {
      const a = await api('assessment/start', { method: 'POST' });
      app.innerHTML = `<section class="fade"><p class="eyebrow">Knowledge check: attempt ${a.attempt_no}</p><h1>Choose the strongest response for each scenario</h1><p class="muted">${a.total} questions. Pass mark ${a.passMark}. Your answers are not saved until you submit.</p>
        <form id="aform" class="reading">${a.items.map(q => `<fieldset class="q" data-q="${esc(q.id)}"><legend><span class="qn">${q.n}.</span> <span class="maps">${esc(q.maps)}</span><br>${esc(q.stem)}</legend><div class="options">${q.options.map((o, i) => `<label class="opt" style="cursor:pointer"><input type="radio" name="${esc(q.id)}" value="${esc(o.id)}" style="width:20px;height:20px;margin-top:3px;accent-color:var(--espresso)"><span>${esc(o.text)}</span></label>`).join('')}</div></fieldset>`).join('')}
        <p id="aerr" class="notice warn" hidden></p>
        <div class="row" style="margin-top:24px"><button class="btn" type="submit">Submit my answers</button></div></form></section>`;
      const f = document.getElementById('aform');
      f.onsubmit = async e => {
        e.preventDefault();
        const answers = {}; a.items.forEach(q => { const v = f.querySelector(`input[name="${q.id}"]:checked`); if (v) answers[q.id] = v.value; });
        const missing = a.items.filter(q => !answers[q.id]);
        if (missing.length) { const err = document.getElementById('aerr'); err.textContent = `${missing.length} question${missing.length > 1 ? 's are' : ' is'} unanswered (first: question ${missing[0].n}).`; err.hidden = false; f.querySelector(`[data-q="${missing[0].id}"]`).scrollIntoView({ behavior: 'smooth' }); return; }
        f.querySelector('button[type=submit]').disabled = true;
        const r = await api('assessment/submit', { method: 'POST', body: { attempt_id: a.attempt_id, answers } });
        const byId = {}; a.items.forEach(q => byId[q.id] = q);
        app.innerHTML = `<section class="fade"><p class="eyebrow">Knowledge check: results</p><h1>${r.passed ? 'You passed the knowledge check' : 'Not yet. Review and try again'}</h1>
          <p class="score">${r.score} <span style="font-size:1.4rem;color:var(--ink-2)">of ${r.total}</span></p><p class="muted">Pass mark ${r.passMark}.</p>
          ${r.passed ? `<div class="notice ok">All eleven lessons, six labs, and the knowledge check are complete. ${r.needsName ? 'Add the name for your certificate on the next screen.' : 'Your certificate of course completion is ready.'}</div><p style="margin-top:18px"><a class="btn" href="#/certificate">Continue to your completion</a></p>` : `<div class="notice warn">Read every explanation below, revisit the lessons listed, and retake with a fresh shuffle whenever you are ready.</div><p style="margin-top:18px"><a class="btn secondary" href="#/assessment">Back to the knowledge check</a></p>`}
          <h2>Review</h2><div class="reading">${r.review.map(x => { const q = byId[x.id]; const opt = id => (q.options.find(o => o.id === id) || {}).text || ''; return `<div class="q"><p style="margin:0 0 8px"><span class="qn">${x.n}.</span> <span class="maps">${esc(x.maps)}</span><br>${esc(q.stem)}</p><div class="feedback ${x.correct ? 'ok' : 'no'}"><div class="fb-label">${x.correct ? 'Correct' : 'Not correct'}</div><p><strong>You chose:</strong> ${esc(opt(x.chosen))}</p><p style="margin-top:6px">${esc(x.explain || '')}</p>${x.correct ? '' : `<p style="margin-top:10px"><strong>Strongest response:</strong> ${esc(opt(x.key))}</p><p style="margin-top:6px">${esc(x.keyExplain)}</p>`}</div></div>`; }).join('')}</div></section>`;
      };
    };
  }

  async function completionView(st) {
    const name = me.profile?.display_name || '';
    app.innerHTML = `<section class="reading center fade" style="max-width:720px"><p class="eyebrow">Course completion</p><h1>You completed Paraprofessional Practice</h1>
      <p>Eleven lessons, six practice labs, and the knowledge check (best score ${Math.max(...st.attempts.filter(a => a.score != null).map(a => a.score), 0)} of ${st.total}). What you have now is a set of routines: the five questions, Before I Prompt, the adult disagreement routine, the family referral scripts, the phone-away routine, and a factual handoff note.</p>
      <h2>Next steps</h2><ul class="bullets"><li>Open <a href="#/tools">My tools</a> and print your one-week plan and the tools you will use first.</li><li>Share your practice target and check-in script with the teacher this week.</li><li>Put the review date on your calendar.</li></ul>
      <h2>Certificate of course completion</h2>
      <form id="nameform" class="surface stack"><div class="field"><label for="dn">Name as it should appear on the certificate</label><input id="dn" type="text" maxlength="80" value="${esc(name)}" autocomplete="name" required><span class="hint">Your name only. This is the one place in the course a real name belongs.</span></div>
      <div class="row"><button class="btn" type="submit">${me.completion ? 'Open printable certificate' : 'Save name and issue certificate'}</button>${me.completion ? `<span class="muted small">Certificate ${esc(me.completion.certificate_id)}, issued ${new Date(me.completion.completed_at).toLocaleDateString()}</span>` : ''}</div><p id="nerr" class="notice err" hidden></p></form>
      <p class="small muted" style="margin-top:18px">The certificate confirms completion of this non-accredited, self-paced course. It is not a license, state certification, or continuing education credit. Anyone can confirm a certificate code at this course’s verification page.</p>
      <p><a class="btn quiet" href="#/home">Back to course home</a></p></section>`;
    document.getElementById('nameform').onsubmit = async e => {
      e.preventDefault(); const dn = document.getElementById('dn').value.trim(); const err = document.getElementById('nerr');
      if (dn.length < 2) { err.textContent = 'Enter the name for your certificate.'; err.hidden = false; return; }
      try {
        if (dn !== name) await api('profile', { method: 'POST', body: { display_name: dn } });
        if (!me.completion || dn !== name) { /* server issues or re-reads record */ }
        const r = await fetch(`${BASE}/api/certificate?format=html`, { headers: { authorization: `Bearer ${session.access_token}` } });
        if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.error === 'name_required' ? 'Save your name first.' : `Could not issue the certificate (${d.error || r.status}).`); }
        const html = await r.text(); const blob = new Blob([html], { type: 'text/html' }); const url = URL.createObjectURL(blob);
        const w = window.open(url, '_blank'); if (!w) { location.href = url; }
        me = null; await loadMe(true);
      } catch (ex) { err.textContent = ex.message; err.hidden = false; }
    };
  }
  async function certificatePage() { await loadMe(true); if (!me) { app.innerHTML = view.signin(); wire.signin(); return; } if (!me.entitled) { app.innerHTML = view.noAccess(); wire.noAccess(); return; } const st = await api('assessment/status'); if (!st.passed && !me.completion) { go('#/assessment'); return; } completionView(st); }

  // ---------- boot ----------
  (async () => {
    try {
      const r = await fetch(`${BASE}/api/public/config`); CONFIG = await r.json();
      if (session) { try { await loadMe(); } catch (e) { if (e.status === 401) setSession(null); } }
      render();
    } catch (e) { app.innerHTML = `<p class="notice err">The course could not load (${esc(e.message)}). Check your connection and reload.</p>`; }
  })();
})();
