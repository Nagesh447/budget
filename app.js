// Our Budget — shared household expense tracker built on Atomic Habits principles.
// 1. Make it obvious   -> one big "left this month" number, nudges at the top
// 2. Make it attractive -> streak + "+1 vote" for every log, no-spend days count too
// 3. Make it easy       -> amount first, one-tap recent places, category auto-picked from place
// 4. Make it satisfying -> green bars, "logged today" tick; inversion: make overspending difficult
(() => {
'use strict';
const VERSION = 'budget-v1';
const cfg = window.APP_CONFIG || {};
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = new Intl.NumberFormat(cfg.LOCALE || 'en-US', { style: 'currency', currency: cfg.CURRENCY || 'USD' });
const money = n => fmt.format(Number(n) || 0);
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => ymd(new Date());
const parseYmd = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (s, n) => { const d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d); };
const CATS = (cfg.CATEGORIES && cfg.CATEGORIES.length) ? cfg.CATEGORIES : [{ name: 'Other', icon: '📦', essential: false }];
const CAT = Object.fromEntries(CATS.map(c => [c.name, c]));
const icon = c => CAT[c]?.icon || '📦';
const clean = s => String(s || '').replace(/\s+/g, ' ').trim();

const configured = !!cfg.SUPABASE_URL && !/YOUR-/.test(String(cfg.SUPABASE_URL) + String(cfg.SUPABASE_ANON_KEY));
const sb = window.__SB_MOCK || (configured && window.supabase
  ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY) : null);

const S = {
  user: null, household: null, members: [], month: today().slice(0, 7),
  expenses: [], budgets: {}, places: {}, placeList: [], myDays: new Set(),
  view: 'home', channel: null, hWho: 'all', hCat: 'all', cat: '', catTouched: false, editing: null,
};

// ---------- small UI helpers ----------
function show(name) { $$('.screen').forEach(el => el.classList.toggle('hidden', el.id !== 'screen-' + name)); }
let toastT;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.remove('hidden');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.add('hidden'), 3800);
}
function friendly(e) {
  const m = e?.message || String(e);
  if (/Failed to fetch|NetworkError|Load failed|network/i.test(m)) return 'No connection. Check signal and try again.';
  if (/Invalid login/i.test(m)) return 'Wrong email or password.';
  if (/Email not confirmed/i.test(m)) return 'Confirm your email first (check inbox/spam).';
  return m;
}
function vote() {
  const v = $('#vote'); v.classList.add('hidden'); void v.offsetWidth; v.classList.remove('hidden');
  if (navigator.vibrate) try { navigator.vibrate(15); } catch (_) {}
  setTimeout(() => v.classList.add('hidden'), 1150);
}
function applyBars(root) {
  $$('[data-w]', root).forEach(el => { el.style.width = Math.max(0, Math.min(100, Number(el.dataset.w))) + '%'; });
  $$('[data-l]', root).forEach(el => { el.style.left = Math.max(0, Math.min(100, Number(el.dataset.l))) + '%'; });
}
const barCls = p => p >= 1 ? 'red' : p >= 0.8 ? 'amber' : '';
const total = list => list.reduce((a, e) => a + Number(e.amount), 0);
function sumBy(list, key) { const o = {}; for (const e of list) { const k = e[key] || '—'; o[k] = (o[k] || 0) + Number(e.amount); } return o; }
function nameOf(uid) { return uid === S.user?.id ? 'You' : (S.members.find(m => m.user_id === uid)?.display_name || 'Partner'); }
function monthInfo() {
  const [y, m] = S.month.split('-').map(Number);
  const dim = new Date(y, m, 0).getDate();
  const cur = S.month === today().slice(0, 7);
  const day = cur ? new Date().getDate() : dim;
  return { y, m, dim, cur, day, left: dim - day };
}
const monthName = () => { const { y, m } = monthInfo(); return new Date(y, m - 1, 1).toLocaleDateString(cfg.LOCALE || 'en-US', { month: 'long', year: 'numeric' }); };
function parseAmount(s) {
  // allows "12.50", "12,50" and quick sums like "20+7.5"
  const parts = String(s).replace(/[^\d.,+]/g, '').split('+').filter(Boolean);
  let sum = 0;
  for (let p of parts) {
    if (p.includes(',') && !p.includes('.')) p = p.replace(',', '.'); else p = p.replace(/,/g, '');
    const n = Number(p); if (!isFinite(n)) return NaN; sum += n;
  }
  return Math.round(sum * 100) / 100;
}

// ---------- auth ----------
async function currentSession() { const { data } = await sb.auth.getSession(); return data.session; }
async function doAuth(mode) {
  const email = $('#auth-email').value.trim(), password = $('#auth-pass').value, msg = $('#auth-msg');
  if (!email || password.length < 8) { msg.textContent = 'Enter your email and a password of 8+ characters.'; return; }
  msg.textContent = mode === 'in' ? 'Signing in…' : 'Creating account…';
  try {
    if (mode === 'in') {
      const { error } = await sb.auth.signInWithPassword({ email, password }); if (error) throw error;
      msg.textContent = '';
    } else {
      const { data, error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: location.origin + location.pathname } });
      if (error) throw error;
      msg.textContent = data.session ? '' : 'Check your email, tap the confirmation link, then sign in here.';
    }
  } catch (err) { msg.textContent = friendly(err); }
}

let routeSeq = 0;
async function route(session, force = false) {
  const uid = session?.user?.id || null;
  if (!force && uid && S.user?.id === uid && S.household) return;
  const seq = ++routeSeq;
  teardown();
  S.user = session?.user || null; S.household = null;
  if (!S.user) { show('auth'); return; }
  const { data, error } = await sb.from('household_members')
    .select('household_id, display_name, households(id, name, join_code)')
    .eq('user_id', uid).maybeSingle();
  if (seq !== routeSeq) return;
  if (error) { toast(friendly(error)); show('auth'); return; }
  if (!data) { show('setup'); return; }
  S.household = data.households || { id: data.household_id, name: 'Our home', join_code: '' };
  try { await refresh(false); } catch (e) { toast(friendly(e)); }
  subscribe();
  show('app'); render();
}

// ---------- data ----------
async function loadMembers() {
  const { data, error } = await sb.from('household_members').select('user_id, display_name').eq('household_id', S.household.id);
  if (error) throw error; S.members = data || [];
}
async function loadMonth() {
  const { y, m } = monthInfo();
  const start = `${S.month}-01`, end = ymd(new Date(y, m, 1));
  const { data, error } = await sb.from('expenses').select('*').eq('household_id', S.household.id)
    .gte('spent_on', start).lt('spent_on', end)
    .order('spent_on', { ascending: false }).order('created_at', { ascending: false });
  if (error) throw error; S.expenses = data || [];
}
async function loadBudgets() {
  const { data, error } = await sb.from('budgets').select('category, monthly_limit').eq('household_id', S.household.id);
  if (error) throw error;
  S.budgets = Object.fromEntries((data || []).filter(b => Number(b.monthly_limit) > 0).map(b => [b.category, Number(b.monthly_limit)]));
}
async function loadPlaces() {
  const { data, error } = await sb.from('expenses').select('place, category, created_at').eq('household_id', S.household.id)
    .not('place', 'is', null).order('created_at', { ascending: false }).limit(400);
  if (error) throw error;
  const map = {};
  for (const r of data || []) {
    const k = r.place.toLowerCase();
    if (!map[k]) map[k] = { place: r.place, category: r.category, count: 0 }; // newest row wins name + category
    map[k].count++;
  }
  S.places = map;
  S.placeList = Object.values(map).sort((a, b) => b.count - a.count);
}
async function loadStreak() {
  const since = addDays(today(), -120);
  const [a, b] = await Promise.all([
    sb.from('expenses').select('spent_on').eq('user_id', S.user.id).gte('spent_on', since),
    sb.from('no_spend_days').select('day').eq('user_id', S.user.id).gte('day', since),
  ]);
  if (a.error) throw a.error; if (b.error) throw b.error;
  S.myDays = new Set([...(a.data || []).map(r => r.spent_on), ...(b.data || []).map(r => r.day)]);
}
function streak() {
  let d = today(); if (!S.myDays.has(d)) d = addDays(d, -1);
  let n = 0; while (S.myDays.has(d)) { n++; d = addDays(d, -1); }
  return n;
}
async function refresh(doRender = true) {
  await Promise.all([loadMembers(), loadMonth(), loadBudgets(), loadPlaces(), loadStreak()]);
  if (doRender) render();
}
let refreshT;
function refreshSoon() { clearTimeout(refreshT); refreshT = setTimeout(() => refresh().catch(() => {}), 400); }

function subscribe() {
  if (!sb.channel || !S.household) return;
  const filter = `household_id=eq.${S.household.id}`;
  let ch = sb.channel('hh-' + S.household.id);
  for (const table of ['expenses', 'budgets', 'no_spend_days', 'household_members'])
    ch = ch.on('postgres_changes', { event: '*', schema: 'public', table, filter }, refreshSoon);
  S.channel = ch.subscribe();
}
function teardown() { if (S.channel && sb.removeChannel) sb.removeChannel(S.channel); S.channel = null; }

// ---------- rules engine (Atomic Habits for money) ----------
function nudges() {
  const out = [], t = today(), mi = monthInfo();
  const byCat = sumBy(S.expenses, 'category');
  const spent = total(S.expenses);
  const B = Object.values(S.budgets).reduce((a, b) => a + b, 0);
  if (mi.cur) {
    const yd = addDays(t, -1);
    if (S.myDays.size && !S.myDays.has(t) && !S.myDays.has(yd))
      out.push({ k: 'warn', p: 1, t: 'Never miss twice', d: "You didn't log yesterday. Add yesterday's spending now, or mark it a no-spend day.",
        acts: [['log-yesterday', 'Log yesterday'], ['nospend-yesterday', 'No spend yesterday']] });
    else if (!S.myDays.has(t) && new Date().getHours() >= 19)
      out.push({ p: 3, t: 'Close the day', d: 'Habit stack: after dinner, log today\'s spending, or tap "No-spend day". It takes 20 seconds.' });
    if (!S.expenses.length && !S.myDays.size)
      out.push({ p: 2, t: 'Two-minute rule', d: 'Start tiny: log just the last thing you bought. That\'s your first vote.' });
  }
  for (const [cat, lim] of Object.entries(S.budgets)) {
    const s = byCat[cat] || 0, p = s / lim, ess = CAT[cat]?.essential;
    if (p >= 1) out.push({ k: 'bad', p: 0, t: `${cat} is over by ${money(s - lim)}`,
      d: ess ? 'Essential category: look for one swap (store brand, list before shopping) rather than cutting it.'
             : 'Make it difficult: 48-hour rule before any non-essential buy, and remove saved cards from apps you use for this.' });
    else if (p >= 0.8 && mi.cur && mi.left > 2)
      out.push({ k: 'warn', p: 1, t: `${cat}: ${Math.round(p * 100)}% used`, d: `${money(lim - s)} left for ${mi.left} more days, about ${money((lim - s) / mi.left)} a day.` });
  }
  if (B > 0 && mi.cur && mi.day >= 5 && spent / B > mi.day / mi.dim + 0.15)
    out.push({ k: 'warn', p: 1, t: 'Spending ahead of pace', d: `${Math.round(spent / B * 100)}% of the budget is gone, and only ${Math.round(mi.day / mi.dim * 100)}% of the month has passed.` });
  // "Where" insight: the environment drives behaviour
  const byPlace = {};
  for (const e of S.expenses) if (e.place && !CAT[e.category]?.essential) {
    const k = e.place.toLowerCase(); byPlace[k] = byPlace[k] || { n: 0, s: 0, name: e.place }; byPlace[k].n++; byPlace[k].s += Number(e.amount);
  }
  const top = Object.values(byPlace).sort((a, b) => b.n - a.n)[0];
  if (top && top.n >= 5)
    out.push({ p: 2, t: `${top.name}: ${top.n} visits, ${money(top.s)}`, d: 'Make the cue invisible. Change the route, delete the app, or write an implementation intention: "When I want to go to ' + top.name + ', I will ___ instead."' });
  if (!Object.keys(S.budgets).length && S.expenses.length >= 5)
    out.push({ p: 2, t: 'Set 3 budgets, not 14', d: 'Pick only your top 3 categories in Settings. Small and specific beats complete.', acts: [['go-settings', 'Set budgets']] });
  const st = streak();
  if (mi.cur && st >= 7) out.push({ p: 4, t: `${st}-day chain`, d: "Don't break the chain. You're becoming someone who knows where the money goes." });
  return out.sort((a, b) => a.p - b.p).slice(0, 3);
}

// ---------- rendering ----------
function rowHtml(e) {
  return `<button type="button" class="exp" data-id="${esc(e.id)}"><span class="ic">${icon(e.category)}</span>
    <span class="mid"><b>${esc(e.place || e.category)}</b><small>${esc(e.category)}${e.note ? ' · ' + esc(e.note) : ''} · ${esc(nameOf(e.user_id))}</small></span>
    <span class="amt">${money(e.amount)}</span></button>`;
}
function render() {
  if (!S.household) return;
  const mi = monthInfo();
  $('#m-label').textContent = monthName();
  $('#m-next').disabled = mi.cur;
  $$('.tabs button').forEach(b => b.classList.toggle('active', b.dataset.view === S.view));
  $$('.view').forEach(v => v.classList.toggle('hidden', v.id !== 'view-' + S.view));
  ({ home: renderHome, history: renderHistory, insights: renderInsights, settings: renderSettings })[S.view]();
}

function renderHome() {
  const mi = monthInfo(), spent = total(S.expenses), t = today();
  const B = Object.values(S.budgets).reduce((a, b) => a + b, 0);
  const byCat = sumBy(S.expenses, 'category');
  let h = `<div class="card"><div class="muted small">Spent ${mi.cur ? 'so far this month' : 'in ' + esc(monthName())}</div><div class="big">${money(spent)}</div>`;
  if (B > 0) {
    const p = spent / B;
    h += `<div class="bar"><i class="${barCls(p)}" data-w="${p * 100}"></i>${mi.cur ? `<b data-l="${mi.day / mi.dim * 100}"></b>` : ''}</div>
      <div class="row-between small"><span>${spent <= B ? '<b>' + money(B - spent) + '</b> left' : '<b>' + money(spent - B) + '</b> over'} of ${money(B)}</span>
      ${mi.cur ? `<span class="muted">Day ${mi.day}/${mi.dim}</span>` : ''}</div>`;
  } else h += `<div class="muted small">No budget set yet. Add one in Settings.</div>`;
  h += '</div>';
  for (const n of nudges()) {
    h += `<div class="nudge ${n.k || ''}"><b>${esc(n.t)}</b><div class="small">${esc(n.d)}</div>`;
    for (const [a, l] of n.acts || []) h += `<button type="button" class="btn inline" data-act="${a}">${esc(l)}</button> `;
    h += '</div>';
  }
  if (mi.cur) {
    h += `<div class="card row-between"><div><div class="big2">🔥 ${streak()}</div><div class="muted small">day logging streak</div></div>
      ${S.myDays.has(t) ? '<span class="ok">✓ Logged today</span>' : '<button type="button" class="btn inline" data-act="nospend-today">No-spend day</button>'}</div>`;
  }
  const cats = [...new Set([...Object.keys(S.budgets), ...Object.keys(byCat)])].sort((a, b) => (byCat[b] || 0) - (byCat[a] || 0));
  if (cats.length) {
    h += '<div class="card"><h2>Categories</h2>';
    for (const c of cats) {
      const s = byCat[c] || 0, lim = S.budgets[c];
      h += `<div class="cat-row"><div class="row-between"><span>${icon(c)} ${esc(c)}</span><span><b>${money(s)}</b>${lim ? ' <span class="muted small">/ ' + money(lim) + '</span>' : ''}</span></div>
        ${lim ? `<div class="bar"><i class="${barCls(s / lim)}" data-w="${s / lim * 100}"></i></div>` : ''}</div>`;
    }
    h += '</div>';
  }
  if (S.expenses.length) {
    h += '<div class="card"><div class="row-between"><h2>Latest</h2><button type="button" class="btn inline" data-act="go-history">See all</button></div>';
    h += S.expenses.slice(0, 5).map(rowHtml).join('') + '</div>';
  } else h += '<div class="empty">No expenses this month yet. Tap ＋ to add the first one.</div>';
  const el = $('#view-home'); el.innerHTML = h; applyBars(el);
}

function renderHistory() {
  let list = S.expenses;
  if (S.hWho !== 'all') list = list.filter(e => e.user_id === S.hWho);
  if (S.hCat !== 'all') list = list.filter(e => e.category === S.hCat);
  const cats = [...new Set(S.expenses.map(e => e.category))].sort();
  let h = `<div class="filters"><select id="h-who" aria-label="Who"><option value="all">Everyone</option>
    ${S.members.map(m => `<option value="${esc(m.user_id)}"${S.hWho === m.user_id ? ' selected' : ''}>${esc(nameOf(m.user_id))}</option>`).join('')}</select>
    <select id="h-cat" aria-label="Category"><option value="all">All categories</option>
    ${cats.map(c => `<option${S.hCat === c ? ' selected' : ''}>${esc(c)}</option>`).join('')}</select></div>`;
  h += `<div class="pad small muted">${list.length} entries · ${money(total(list))}</div>`;
  if (!list.length) h += '<div class="empty">Nothing here.</div>';
  const days = {};
  for (const e of list) (days[e.spent_on] = days[e.spent_on] || []).push(e);
  for (const [d, items] of Object.entries(days)) {
    const label = parseYmd(d).toLocaleDateString(cfg.LOCALE || 'en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    h += `<div class="day-head"><span>${esc(label)}</span><span>${money(total(items))}</span></div><div class="card">${items.map(rowHtml).join('')}</div>`;
  }
  const el = $('#view-history'); el.innerHTML = h;
  $('#h-who', el).addEventListener('change', e => { S.hWho = e.target.value; renderHistory(); });
  $('#h-cat', el).addEventListener('change', e => { S.hCat = e.target.value; renderHistory(); });
}

function renderInsights() {
  const list = S.expenses, spent = total(list), mi = monthInfo();
  if (!list.length) { $('#view-insights').innerHTML = '<div class="empty">Log a few expenses to see insights.</div>'; return; }
  const byCat = Object.entries(sumBy(list, 'category')).sort((a, b) => b[1] - a[1]);
  const ess = list.filter(e => CAT[e.category]?.essential).reduce((a, e) => a + Number(e.amount), 0);
  const places = {};
  for (const e of list) { const k = (e.place || '(no place)').toLowerCase(); places[k] = places[k] || { name: e.place || '(no place)', n: 0, s: 0 }; places[k].n++; places[k].s += Number(e.amount); }
  const topPlaces = Object.values(places).sort((a, b) => b.s - a.s).slice(0, 10);
  const byWho = sumBy(list, 'user_id');
  const biggest = list.reduce((a, e) => Number(e.amount) > Number(a.amount) ? e : a, list[0]);
  let h = `<div class="card"><div class="row-between"><div><div class="muted small">Daily average</div><div class="big2">${money(spent / Math.max(1, mi.day))}</div></div>
    <div><div class="muted small">Entries</div><div class="big2">${list.length}</div></div></div></div>`;
  h += `<div class="card"><h2>Needs vs wants</h2><div class="row-between"><span>Essentials</span><b>${money(ess)}</b></div>
    <div class="bar"><i data-w="${spent ? ess / spent * 100 : 0}"></i></div><div class="row-between"><span>Non-essentials</span><b>${money(spent - ess)}</b></div></div>`;
  h += '<div class="card"><h2>By category</h2>' + byCat.map(([c, s]) => `<div class="cat-row"><div class="row-between"><span>${icon(c)} ${esc(c)}</span>
    <span><b>${money(s)}</b> <span class="muted small">${Math.round(s / spent * 100)}%</span></span></div><div class="bar"><i data-w="${s / byCat[0][1] * 100}"></i></div></div>`).join('') + '</div>';
  h += '<div class="card"><h2>Where the money went</h2>' + topPlaces.map(p => `<div class="cat-row row-between"><span>📍 ${esc(p.name)} <span class="muted small">×${p.n}</span></span><b>${money(p.s)}</b></div>`).join('') + '</div>';
  h += '<div class="card"><h2>Who logged what</h2>' + Object.entries(byWho).map(([u, s]) => `<div class="cat-row row-between"><span>${esc(nameOf(u))}</span><b>${money(s)}</b></div>`).join('') + '</div>';
  h += `<div class="card"><h2>Biggest expense</h2>${rowHtml(biggest)}</div>`;
  const el = $('#view-insights'); el.innerHTML = h; applyBars(el);
}

function renderSettings() {
  const me = S.members.find(m => m.user_id === S.user.id);
  let h = `<div class="card"><h2>${esc(S.household.name)}</h2><div class="muted small">Partner join code</div>
    <div class="row-between"><span class="code">${esc(S.household.join_code)}</span><button type="button" class="btn inline" data-act="copy-code">Copy</button></div>
    <div class="muted small">Members: ${S.members.map(m => esc(m.display_name)).join(', ')}</div></div>`;
  h += `<div class="card"><label>Your name<input id="s-name" maxlength="30" value="${esc(me?.display_name || '')}"></label>
    <button type="button" class="btn" data-act="save-name">Save name</button></div>`;
  h += `<div class="card"><h2>Monthly budgets</h2><p class="muted small">Start with your top 3. Leave the rest blank.</p>
    ${CATS.map(c => `<div class="bud-row"><span>${c.icon} ${esc(c.name)}</span><input inputmode="decimal" data-bud="${esc(c.name)}" placeholder="—" value="${S.budgets[c.name] ?? ''}"></div>`).join('')}
    <button type="button" class="btn primary" data-act="save-budgets">Save budgets</button></div>`;
  h += `<div class="card"><button type="button" class="btn" data-act="export">Export ${esc(monthName())} (CSV)</button>
    <button type="button" class="btn" data-act="signout">Sign out</button>
    <p class="muted small center">${esc(S.user.email || '')} · ${VERSION}</p></div>`;
  $('#view-settings').innerHTML = h;
}

// ---------- add / edit sheet ----------
function setCat(c, touched) {
  S.cat = c; if (touched) S.catTouched = true;
  $$('#cat-chips .chip').forEach(b => b.classList.toggle('active', b.dataset.cat === c));
}
function renderPlaceUI() {
  $('#places').innerHTML = S.placeList.slice(0, 60).map(p => `<option value="${esc(p.place)}"></option>`).join('');
  $('#place-chips').innerHTML = S.placeList.slice(0, 6).map(p => `<button type="button" class="chip" data-place="${esc(p.place)}">${icon(p.category)} ${esc(p.place)}</button>`).join('');
}
function openSheet(exp, date) {
  S.editing = exp || null; S.catTouched = !!exp;
  $('#sheet-title').textContent = exp ? 'Edit expense' : 'Add expense';
  $('#f-amount').value = exp ? Number(exp.amount).toFixed(2) : '';
  $('#f-place').value = exp?.place || '';
  $('#f-note').value = exp?.note || '';
  $('#f-date').max = today();
  $('#f-date').value = exp?.spent_on || date || today();
  setCat(exp?.category || '');
  const del = $('#f-delete'); del.classList.toggle('hidden', !exp); del.textContent = 'Delete'; del.dataset.armed = '';
  renderPlaceUI();
  $('#sheet').showModal();
  if (!exp) setTimeout(() => $('#f-amount').focus(), 60);
}
function placeChanged() {
  const p = S.places[clean($('#f-place').value).toLowerCase()];
  if (p && !S.catTouched && CAT[p.category]) setCat(p.category);
}
async function saveExpense(e) {
  e.preventDefault();
  const amount = parseAmount($('#f-amount').value);
  if (!(amount > 0)) { toast('Enter an amount.'); $('#f-amount').focus(); return; }
  if (!S.cat) { toast('Pick a category.'); return; }
  const row = { amount, category: S.cat, place: clean($('#f-place').value) || null, note: clean($('#f-note').value) || null, spent_on: $('#f-date').value || today() };
  if (row.spent_on > today()) { toast("Date can't be in the future."); return; }
  const btn = $('#f-save'); btn.disabled = true;
  try {
    const wasNew = !S.editing;
    if (S.editing) {
      const { error } = await sb.from('expenses').update(row).eq('id', S.editing.id); if (error) throw error;
    } else {
      const { error } = await sb.from('expenses').insert({ ...row, household_id: S.household.id, user_id: S.user.id }); if (error) throw error;
    }
    $('#sheet').close();
    if (wasNew) vote();
    if (row.spent_on.slice(0, 7) !== S.month && wasNew) S.month = row.spent_on.slice(0, 7);
    await refresh();
    const lim = S.budgets[row.category];
    if (lim) {
      const s = total(S.expenses.filter(x => x.category === row.category));
      if (s > lim) setTimeout(() => toast(`${row.category} is now ${money(s - lim)} over budget.`), 900);
      else if (s / lim >= 0.8) setTimeout(() => toast(`${row.category}: ${money(lim - s)} left this month.`), 900);
    }
  } catch (err) { toast(friendly(err)); } // form keeps its values so nothing is lost
  finally { btn.disabled = false; }
}
async function deleteExpense() {
  const del = $('#f-delete');
  if (!del.dataset.armed) { del.dataset.armed = '1'; del.textContent = 'Tap again to delete'; return; }
  try {
    const { error } = await sb.from('expenses').delete().eq('id', S.editing.id); if (error) throw error;
    $('#sheet').close(); await refresh(); toast('Deleted.');
  } catch (err) { toast(friendly(err)); }
}

// ---------- actions ----------
async function noSpend(day) {
  const { error } = await sb.from('no_spend_days').insert({ household_id: S.household.id, user_id: S.user.id, day });
  if (error && error.code !== '23505') { toast(friendly(error)); return; }
  vote(); await refresh();
}
async function saveBudgets() {
  const rows = [], blanks = [];
  for (const inp of $$('[data-bud]')) {
    const v = inp.value.trim(), c = inp.dataset.bud;
    if (!v) { blanks.push(c); continue; }
    const n = parseAmount(v); if (!(n >= 0)) { toast(`Check the amount for ${c}.`); return; }
    rows.push({ household_id: S.household.id, category: c, monthly_limit: n });
  }
  try {
    if (rows.length) { const { error } = await sb.from('budgets').upsert(rows, { onConflict: 'household_id,category' }); if (error) throw error; }
    if (blanks.length) { const { error } = await sb.from('budgets').delete().eq('household_id', S.household.id).in('category', blanks); if (error) throw error; }
    await refresh(); toast('Budgets saved.');
  } catch (err) { toast(friendly(err)); }
}
function exportCsv() {
  const cell = v => { let s = String(v ?? ''); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };
  const lines = [['Date', 'Who', 'Amount', 'Category', 'Where', 'Note'].map(cell).join(',')];
  for (const e of [...S.expenses].reverse())
    lines.push([e.spent_on, S.members.find(m => m.user_id === e.user_id)?.display_name || '',
      Number(e.amount).toFixed(2), e.category, e.place, e.note].map(cell).join(','));
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([lines.join('\r\n')], { type: 'text/csv' }));
  a.download = `budget-${S.month}.csv`; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
async function act(a) {
  const t = today();
  switch (a) {
    case 'nospend-today': return noSpend(t);
    case 'nospend-yesterday': return noSpend(addDays(t, -1));
    case 'log-yesterday': return openSheet(null, addDays(t, -1));
    case 'go-history': S.view = 'history'; return render();
    case 'go-settings': S.view = 'settings'; return render();
    case 'copy-code':
      try { await navigator.clipboard.writeText(S.household.join_code); toast('Code copied. Send it to your partner.'); }
      catch (_) { toast('Code: ' + S.household.join_code); }
      return;
    case 'save-name': {
      const n = clean($('#s-name').value); if (!n) return toast('Enter a name.');
      const { error } = await sb.from('household_members').update({ display_name: n.slice(0, 30) }).eq('user_id', S.user.id).eq('household_id', S.household.id);
      if (error) return toast(friendly(error)); await refresh(); return toast('Saved.');
    }
    case 'save-budgets': return saveBudgets();
    case 'export': return exportCsv();
    case 'signout': return signOut();
  }
}
async function signOut() {
  teardown(); await sb.auth.signOut();
  Object.assign(S, { user: null, household: null, members: [], expenses: [], budgets: {}, places: {}, placeList: [], myDays: new Set(), view: 'home', month: today().slice(0, 7) });
  show('auth');
}
function onMainClick(e) {
  const actEl = e.target.closest('[data-act]'); if (actEl) { act(actEl.dataset.act); return; }
  const row = e.target.closest('[data-id]');
  if (row) {
    const exp = S.expenses.find(x => x.id === row.dataset.id); if (!exp) return;
    if (exp.user_id !== S.user.id) { toast(`Only ${nameOf(exp.user_id)} can edit this one.`); return; }
    openSheet(exp);
  }
}

// ---------- wiring ----------
function wire() {
  $('#auth-form').addEventListener('submit', e => { e.preventDefault(); doAuth('in'); });
  $('#btn-signup').addEventListener('click', () => doAuth('up'));
  $('#btn-setup-signout').addEventListener('click', signOut);
  const setup = async (rpc, args) => {
    const name = clean($('#setup-name').value); if (!name) { toast('Enter your name first.'); return; }
    const { error } = await sb.rpc(rpc, { ...args, p_display: name });
    if (error) { toast(friendly(error)); return; }
    route(await currentSession(), true);
  };
  $('#btn-create').addEventListener('click', () => setup('create_household', { p_name: clean($('#setup-hh').value) || 'Our home' }));
  $('#btn-join').addEventListener('click', () => {
    const code = clean($('#setup-code').value).toUpperCase(); if (code.length !== 8) { toast('The code is 8 characters.'); return; }
    setup('join_household', { p_code: code });
  });
  $('#m-prev').addEventListener('click', () => shiftMonth(-1));
  $('#m-next').addEventListener('click', () => shiftMonth(1));
  $$('.tabs button').forEach(b => b.addEventListener('click', () => { S.view = b.dataset.view; render(); window.scrollTo(0, 0); }));
  $('main').addEventListener('click', onMainClick);
  $('#fab').addEventListener('click', () => openSheet(null));
  $('#sheet-close').addEventListener('click', () => $('#sheet').close());
  $('#exp-form').addEventListener('submit', saveExpense);
  $('#f-delete').addEventListener('click', deleteExpense);
  $('#f-place').addEventListener('input', placeChanged);
  $('#f-place').addEventListener('change', placeChanged);
  $('#cat-chips').innerHTML = CATS.map(c => `<button type="button" class="chip" data-cat="${esc(c.name)}">${c.icon} ${esc(c.name)}</button>`).join('');
  $('#cat-chips').addEventListener('click', e => { const b = e.target.closest('[data-cat]'); if (b) setCat(b.dataset.cat, true); });
  $('#place-chips').addEventListener('click', e => {
    const b = e.target.closest('[data-place]'); if (!b) return;
    $('#f-place').value = b.dataset.place; placeChanged();
  });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && S.household) refreshSoon(); });
}
async function shiftMonth(n) {
  const { y, m } = monthInfo(); const d = new Date(y, m - 1 + n, 1);
  const next = ymd(d).slice(0, 7); if (next > today().slice(0, 7)) return;
  S.month = next;
  try { await loadMonth(); render(); } catch (e) { toast(friendly(e)); }
}

async function boot() {
  wire();
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
  if (!sb) { show('config'); return; }
  sb.auth.onAuthStateChange((ev, session) => {
    if (ev === 'SIGNED_IN' || ev === 'SIGNED_OUT' || ev === 'INITIAL_SESSION') setTimeout(() => route(session), 0);
  });
}
window.__budget = { S, nudges, parseAmount, streak }; // for tests
boot();
})();
