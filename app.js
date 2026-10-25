import * as L from './logic.js';

const KEY = 'system-v1';
const $ = id => document.getElementById(id);
const main = $('main'), dlg = $('dlg');
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
const fmt = n => Math.floor(n).toLocaleString();
const bar = p => `<div class="bar"><i style="--p:${Math.min(1, p)}"></i></div>`;
const STAT_HINT = 'STR body · AGI movement · VIT health · INT mind · PER focus & craft';

let s = load();
let tab = 'quests';

function load() {
  try { return L.restore(JSON.parse(localStorage.getItem(KEY)), L.localDate()); } catch { return null; }
}
const save = () => localStorage.setItem(KEY, JSON.stringify(s));

// Every action goes through here: close out past days, apply, persist, redraw, notify.
function act(fn) {
  const m = L.rollover(s, L.localDate()), r = fn();
  if (Array.isArray(r)) m.push(...r);
  save();
  render();
  toast(m);
}

/* ---------- Views ---------- */

const views = {
  status() {
    const shadows = s.habits.filter(h => h.shadow);
    return `
    <section class="win">
      <header class="win-h"><span>Status</span><button class="link small" data-act="settings">Settings</button></header>
      <div class="hero">
        <div><div class="label">Level</div><div class="lvl mono">${s.level}</div></div>
        <dl class="meta">
          <dt>Name</dt><dd>${esc(s.name)}</dd>
          <dt>Job</dt><dd>${esc(s.job)}</dd>
          <dt>Title</dt><dd><button class="link" data-act="titles">${esc(s.title || 'None')}</button></dd>
          <dt>Rank</dt><dd class="mono">${L.rank(s.level)}</dd>
        </dl>
      </div>
      ${bar(s.xp / L.need(s.level))}
      <div class="row small"><span class="muted">XP</span><span class="mono">${fmt(s.xp)} / ${fmt(L.need(s.level))}</span></div>
      <div class="row small" style="margin-top:4px"><span class="muted">Gold</span><span class="mono">${fmt(s.gold)} G</span></div>
    </section>

    <section class="win">
      <header class="win-h"><span>Stats</span><span class="${s.points ? '' : 'muted'}">${s.points} points</span></header>
      <ul class="stats">
        ${L.STATS.map(k => `<li><span>${k}</span><b>${s.stats[k]}</b>
          ${s.points ? `<button class="sq" data-act="spend" data-id="${k}" aria-label="Add a point to ${k}">+</button>` : ''}</li>`).join('')}
      </ul>
      <p class="note">${STAT_HINT}</p>
    </section>

    <section class="win">
      <header class="win-h"><span>Shadow Army</span><span class="muted mono">${shadows.length}</span></header>
      ${shadows.length
        ? `<ul class="list">${shadows.map(h => `<li class="row"><span>${esc(h.name)}</span><span class="tag">since ${h.shadow}</span></li>`).join('')}</ul>`
        : `<p class="empty">Keep a quest going for ${L.ARISE_AT} days in a row to extract it as a shadow. By then the habit is part of you.</p>`}
    </section>`;
  },

  quests() {
    const n = s.habits.filter(L.done).length;
    return `
    ${L.penaltyActive(s) ? `
    <section class="win danger">
      <header class="win-h"><span>Penalty Quest</span><span>!</span></header>
      <p>${esc(s.penalty.text)}</p>
      <p class="note">XP and Gates are sealed until you survive.</p>
      <button class="btn red wide" data-act="penalty">I survived</button>
    </section>` : ''}

    <section class="win">
      <header class="win-h"><span>Daily Quest</span><span class="mono">${s.cleared ? 'Complete' : `${n}/${s.habits.length}`}</span></header>
      <p class="sub">Preparation to Become Powerful</p>
      ${s.habits.length ? `<ul class="list">${s.habits.map(habitRow).join('')}</ul>`
        : `<p class="empty">No quests yet. Add the habits you want to build.</p>`}
      <button class="btn ghost wide" data-act="habit">+ Add quest</button>
      <p class="note">${s.cleared
        ? `Reward ${s.paid ? 'received' : 'pending'}: +50 XP · +100 G. Streak: ${s.dayStreak} day${s.dayStreak === 1 ? '' : 's'}.`
        : 'WARNING: Failing to complete the Daily Quest will result in a penalty.'}</p>
    </section>`;
  },

  gates() {
    const open = s.gates.filter(g => !g.cleared), shut = s.gates.filter(g => g.cleared);
    return `
    <section class="win">
      <header class="win-h"><span>Gates</span><span class="muted mono">${open.length} open</span></header>
      <p class="sub">Long goals and hobbies. Higher rank, bigger reward.</p>
      ${open.length ? `<ul class="list">${open.map(gateRow).join('')}</ul>`
        : `<p class="empty">No open Gates. Try “Read 12 books” (C) or “Learn 10 songs on guitar” (B).</p>`}
      <button class="btn ghost wide" data-act="gate">+ Open a Gate</button>
      ${shut.length ? `<details><summary>Cleared (${shut.length})</summary><ul class="list">${shut.map(gateRow).join('')}</ul></details>` : ''}
    </section>`;
  },

  shop() {
    return `
    <section class="win">
      <header class="win-h"><span>Shop</span><span class="mono">${fmt(s.gold)} G</span></header>
      <p class="sub">Rewards you have to earn. Set your own prices.</p>
      ${s.rewards.length ? `<ul class="list">${s.rewards.map(r => `
        <li class="item">
          <div class="item-main"><button class="name" data-act="reward" data-id="${r.id}">${esc(r.name)}</button></div>
          <span class="count">${fmt(r.cost)} G</span>
          <button class="btn" data-act="buy" data-id="${r.id}" ${s.gold < r.cost ? 'disabled' : ''}>Buy</button>
        </li>`).join('')}</ul>`
        : `<p class="empty">Add rewards like “One anime episode” for 150 G or “Cheat meal” for 400 G.</p>`}
      <button class="btn ghost wide" data-act="reward">+ Add reward</button>
    </section>`;
  },
};

function habitRow(h) {
  const d = L.done(h), step = h.step || 1;
  return `
  <li class="${d ? 'done' : ''}">
    <div class="item">
      <div class="item-main">
        <button class="name" data-act="habit" data-id="${h.id}">${esc(h.name)}</button>
        <div class="tag"><span class="count">${fmt(h.count)}/${fmt(h.target)}${h.unit ? ' ' + esc(h.unit) : ''}</span>
          · ${h.stat}${h.streak ? ` · ${h.streak}d streak` : ''}${h.shadow ? ' · shadow' : ''}</div>
      </div>
      ${d ? '' : `
        <div class="ctrl">
          <button class="sq" data-act="bump" data-id="${h.id}" data-d="-1" ${h.count ? '' : 'disabled'} aria-label="Less">−</button>
          <button class="sq" data-act="bump" data-id="${h.id}" data-d="1" aria-label="Add ${step}">+</button>
          ${h.target - h.count > step ? `<button class="sq" data-act="bump" data-id="${h.id}" data-d="Infinity" aria-label="Complete">✓</button>` : ''}
        </div>`}
    </div>
    ${bar(h.count / h.target)}
    ${h.streak >= L.ARISE_AT && !h.shadow ? `<button class="btn arise" data-act="arise" data-id="${h.id}">Arise</button>` : ''}
  </li>`;
}

function gateRow(g) {
  return `
  <li>
    <div class="item">
      <span class="badge ${g.rank}">${g.rank}</span>
      <div class="item-main">
        <button class="name" data-act="gate" data-id="${g.id}">${esc(g.name)}</button>
        <div class="tag"><span class="count">${g.progress}/${g.target}${g.unit ? ' ' + esc(g.unit) : ''}</span>
          · +${L.GATE_XP[g.rank]} XP</div>
      </div>
      ${g.cleared ? '' : `<div class="ctrl">
        <button class="sq" data-act="gbump" data-id="${g.id}" data-d="-1" ${g.progress ? '' : 'disabled'} aria-label="Less">−</button>
        <button class="sq" data-act="gbump" data-id="${g.id}" data-d="1" aria-label="More">+</button></div>`}
    </div>
    ${bar(g.progress / g.target)}
  </li>`;
}

function awaken() {
  main.innerHTML = `
  <form class="awaken" id="awaken">
    <div class="win-h" style="justify-content:center">[ System ]</div>
    <p>You have acquired the qualifications to be a Player. Will you accept?</p>
    <label>Your name<input name="name" required maxlength="24" autocomplete="nickname"></label>
    <button class="btn">Accept</button>
  </form>`;
  $('awaken').onsubmit = e => {
    e.preventDefault();
    const today = L.localDate();
    s = L.newState(new FormData(e.target).get('name').trim(), today);
    L.saveHabit(s, { name: 'Push-ups', target: 20, step: 5, unit: 'reps', stat: 'STR', diff: 'Normal' });
    L.saveHabit(s, { name: 'Read', target: 10, step: 5, unit: 'pages', stat: 'INT', diff: 'Normal' });
    L.saveHabit(s, { name: 'Walk', target: 5000, step: 1000, unit: 'steps', stat: 'AGI', diff: 'Easy' });
    act(() => [{ t: 'Welcome, Player. Your Daily Quest has arrived. Tap a quest name to edit it.', k: 'level' }]);
  };
}

function render() {
  if (!s) return awaken();
  $('tabs').hidden = false;
  main.innerHTML = views[tab]();
  for (const b of document.querySelectorAll('[data-tab]')) {
    b.toggleAttribute('aria-current', b.dataset.tab === tab);
    b.classList.toggle('alert', b.dataset.tab === 'quests' && L.penaltyActive(s));
  }
}

/* ---------- Dialogs ---------- */

// fields: [{k, label, type?, options?, hint?, optional?}]
function form(title, fields, values, onSave, onDelete) {
  const input = f => f.options
    ? `<select name="${f.k}">${f.options.map(o => `<option ${o === values[f.k] ? 'selected' : ''}>${o}</option>`).join('')}</select>`
    : `<input name="${f.k}" type="${f.type || 'text'}" value="${esc(values[f.k])}" ${f.optional ? '' : 'required'}
        ${f.type === 'number' ? 'min="1" step="1" inputmode="numeric"' : 'maxlength="60"'}>`;
  dlg.innerHTML = `
  <form method="dialog">
    <div class="win-h">${esc(title)}</div>
    ${fields.map(f => `<label>${f.label}${input(f)}${f.hint ? `<small>${f.hint}</small>` : ''}</label>`).join('')}
    <div class="actions">
      ${onDelete ? '<button class="btn red" value="del" formnovalidate>Delete</button>' : ''}
      <span class="spacer"></span>
      <button class="btn ghost" value="" formnovalidate>Cancel</button>
      <button class="btn" value="ok">Save</button>
    </div>
  </form>`;
  dlg.returnValue = '';
  dlg.onclose = () => {
    if (dlg.returnValue === 'del' && confirm(`Delete “${values.name}”?`)) act(onDelete);
    if (dlg.returnValue !== 'ok') return;
    const o = Object.fromEntries(new FormData(dlg.querySelector('form')));
    for (const f of fields) if (f.type === 'number') o[f.k] = Math.max(1, Math.floor(+o[f.k]));
    act(() => onSave(o));
  };
  dlg.showModal();
}

const remove = (list, id) => () => { s[list] = s[list].filter(x => x.id !== id); };

const dialogs = {
  habit(id) {
    const h = s.habits.find(x => x.id === id) || { stat: 'STR', diff: 'Normal', step: 1 };
    form(id ? 'Edit quest' : 'New daily quest', [
      { k: 'name', label: 'Quest' },
      { k: 'target', label: 'Daily target', type: 'number' },
      { k: 'step', label: 'Added per tap', type: 'number' },
      { k: 'unit', label: 'Unit', optional: true, hint: 'reps, pages, minutes… (optional)' },
      { k: 'stat', label: 'Trains', options: L.STATS, hint: STAT_HINT },
      { k: 'diff', label: 'Difficulty', options: Object.keys(L.DIFF), hint: 'Easy 10 XP · Normal 20 XP · Hard 40 XP' },
    ], h, o => L.saveHabit(s, o, id), id && remove('habits', id));
  },
  gate(id) {
    const g = s.gates.find(x => x.id === id) || { rank: 'E' };
    form(id ? 'Edit Gate' : 'Open a Gate', [
      { k: 'name', label: 'Goal' },
      { k: 'target', label: 'Target', type: 'number' },
      { k: 'unit', label: 'Unit', optional: true, hint: 'books, songs, km… (optional)' },
      { k: 'rank', label: 'Rank', options: L.RANKS, hint: L.RANKS.map(r => `${r} ${L.GATE_XP[r]}`).join(' · ') + ' XP' },
    ], g, o => L.saveGate(s, o, id), id && remove('gates', id));
  },
  reward(id) {
    const r = s.rewards.find(x => x.id === id) || {};
    form(id ? 'Edit reward' : 'New reward', [
      { k: 'name', label: 'Reward' },
      { k: 'cost', label: 'Price (Gold)', type: 'number' },
    ], r, o => L.saveReward(s, o, id), id && remove('rewards', id));
  },
  settings() {
    form('Settings', [
      { k: 'name', label: 'Name' },
      { k: 'penaltyText', label: 'Penalty Quest', hint: 'Issued the day after you miss your Daily Quest.' },
    ], s, o => { Object.assign(s, o); });
    dlg.querySelector('.actions').insertAdjacentHTML('beforebegin', `
      <div class="grid2">
        <button type="button" class="btn ghost" data-act="export">Export backup</button>
        <button type="button" class="btn ghost" data-act="import">Import backup</button>
      </div>
      <p class="note" style="margin:0">Your data lives only on this device. Export a backup now and then.</p>`);
  },
  titles() {
    dlg.innerHTML = `
    <form method="dialog">
      <div class="win-h">Titles <span class="muted mono">${s.titles.length}/${L.TITLES.length}</span></div>
      <ul class="list">${L.TITLES.map(([name, desc]) => {
        const has = s.titles.includes(name);
        return `<li class="item"><div class="item-main ${has ? '' : 'muted'}">
          <div>${has ? esc(name) : '???'}</div><div class="tag">${desc}</div></div>
          ${has ? `<button class="btn ${s.title === name ? '' : 'ghost'}" value="${esc(name)}">${s.title === name ? 'Equipped' : 'Equip'}</button>` : ''}</li>`;
      }).join('')}</ul>
      <div class="actions"><span class="spacer"></span><button class="btn ghost" value="">Close</button></div>
    </form>`;
    dlg.returnValue = '';
    dlg.onclose = () => dlg.returnValue && act(() => { s.title = dlg.returnValue; });
    dlg.showModal();
  },
};

/* ---------- Backup ---------- */

function exportData() {
  const file = new File([JSON.stringify(s, null, 2)], `system-backup-${L.localDate()}.json`, { type: 'application/json' });
  // Phones (and the iOS app, where downloads don't exist): share sheet → Save to Files.
  if (matchMedia('(pointer: coarse)').matches && navigator.canShare?.({ files: [file] }))
    return navigator.share({ files: [file] }).catch(() => {});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = file.name;
  a.click();
  URL.revokeObjectURL(a.href);
}

$('file').onchange = async e => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  let data = null;
  try { data = L.restore(JSON.parse(await file.text()), L.localDate()); } catch {}
  if (!data) return toast([{ t: 'That file is not a valid System backup.', k: 'warn' }]);
  if (!confirm('Replace all current data with this backup?')) return;
  dlg.close();
  s = data;
  act(() => [{ t: 'Backup restored.', k: 'level' }]);
};

/* ---------- Events ---------- */

document.addEventListener('click', e => {
  const t = e.target.closest('[data-tab],[data-act]');
  if (!t) return;
  if (t.dataset.tab) {
    tab = t.dataset.tab;
    scrollTo(0, 0);
    return act(() => {});
  }
  const { act: a, id, d } = t.dataset;
  ({
    bump: () => act(() => L.bump(s, id, +d)),
    gbump: () => act(() => L.bumpGate(s, id, +d)),
    penalty: () => confirm('Did you really complete the Penalty Quest?') && act(() => L.clearPenalty(s)),
    arise: () => act(() => L.arise(s, id, L.localDate())),
    spend: () => act(() => L.spend(s, id)),
    buy: () => act(() => L.buy(s, id)),
    export: exportData,
    import: () => $('file').click(),
  }[a] || (() => dialogs[a]?.(id)))();
});

// Catch the midnight reset while the app stays open.
const checkDay = () => s && s.lastDate !== L.localDate() && act(() => {});
document.addEventListener('visibilitychange', checkDay);
setInterval(checkDay, 60_000);

/* ---------- System notifications ---------- */

function toast(msgs) {
  msgs.forEach(({ t, k }, i) => setTimeout(() => {
    const el = document.createElement('div');
    el.className = `toast ${k}`;
    el.innerHTML = `<div class="toast-h"><b>!</b>${k === 'warn' ? 'WARNING' : 'NOTIFICATION'}</div><p>${esc(t)}</p>`;
    $('toasts').append(el);
    while ($('toasts').childElementCount > 3) $('toasts').firstElementChild.remove();
    setTimeout(() => el.classList.add('out'), 3200);
    setTimeout(() => el.remove(), 3600);
  }, i * 450));
}

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
if (s) act(() => {}); else render();
