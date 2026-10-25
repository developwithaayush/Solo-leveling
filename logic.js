// Pure game rules. No DOM. Every action mutates state and returns System messages [{t, k}].
export const STATS = ['STR', 'AGI', 'VIT', 'INT', 'PER'];
export const DIFF = { Easy: 10, Normal: 20, Hard: 40 };
export const RANKS = ['E', 'D', 'C', 'B', 'A', 'S'];
export const GATE_XP = { E: 100, D: 200, C: 400, B: 700, A: 1200, S: 2000 };
export const ARISE_AT = 66;

export const need = L => 50 + 60 * L;
export const rank = L =>
  L >= 100 ? 'National' : L >= 70 ? 'S' : L >= 50 ? 'A' : L >= 35 ? 'B' : L >= 20 ? 'C' : L >= 10 ? 'D' : 'E';

export const TITLES = [
  ['Wolf Slayer', 'Clear the Daily Quest 7 days in a row', s => s.bestDayStreak >= 7],
  ['One Who Overcame Adversity', 'Survive a Penalty Quest', s => s.penaltiesCleared > 0],
  ['Awakened', 'Reach Level 10', s => s.level >= 10],
  ['Unyielding', 'Clear the Daily Quest 30 days in a row', s => s.bestDayStreak >= 30],
  ['Dungeon Breaker', 'Clear 5 Gates', s => s.gateLog.length >= 5],
  ['Knight Killer', 'Clear an A-rank Gate', s => s.gateLog.includes('A')],
  ['Demon Hunter', 'Clear an S-rank Gate', s => s.gateLog.includes('S')],
  ['Commander of Shadows', 'Extract your first shadow', s => s.habits.some(h => h.shadow)],
  ['Shadow Sovereign', 'Reach Level 100', s => s.level >= 100],
];

export const localDate = (d = new Date()) => new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
const days = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);
const uid = () => Math.random().toString(36).slice(2, 10);
const say = (m, t, k = 'info') => m.push({ t, k });
export const done = h => h.count >= h.target;
export const penaltyActive = s => !!s.penalty && !s.penalty.done;

export function newState(name, today) {
  return {
    v: 1, name, level: 1, xp: 0, gold: 0, points: 0, job: 'None', title: '', titles: [],
    stats: Object.fromEntries(STATS.map(k => [k, 10])),
    statXp: Object.fromEntries(STATS.map(k => [k, 0])),
    habits: [], gates: [], rewards: [], gateLog: [],
    lastDate: today, cleared: false, paid: false, dayStreak: 0, bestDayStreak: 0,
    penalty: null, penaltyText: 'Survive: 30 minutes of hard, focused effort', penaltiesCleared: 0,
  };
}

// Validates a saved/imported object and fills in any fields it's missing. Returns null if unusable.
export function restore(o, today) {
  const ok = o && typeof o === 'object' && Number.isFinite(o.level) && Number.isFinite(o.xp)
    && ['habits', 'gates', 'rewards'].every(k => Array.isArray(o[k])) && o.stats && typeof o.stats === 'object';
  return ok ? { ...newState(o.name || 'Hunter', today), ...o } : null;
}

function gain(s, xp, gold, m) {
  s.gold += gold;
  s.xp += xp;
  while (s.xp >= need(s.level)) {
    s.xp -= need(s.level);
    s.level++;
    s.points += 5;
    say(m, `You have leveled up! Level ${s.level}. +5 ability points.`, 'level');
    if (rank(s.level) !== rank(s.level - 1)) say(m, `Hunter rank is now ${rank(s.level)}.`, 'level');
    if (s.level >= 40 && s.job === 'None') {
      s.job = 'Shadow Monarch';
      say(m, 'Job Change complete. You are now the Shadow Monarch.', 'level');
    }
  }
}

function train(s, stat, m) {
  if (++s.statXp[stat] < 10) return;
  s.statXp[stat] = 0;
  s.stats[stat]++;
  say(m, `${stat} increased to ${s.stats[stat]}.`);
}

function checkDaily(s, m) {
  if (!s.cleared && s.habits.length && s.habits.every(done)) {
    s.cleared = true;
    s.dayStreak++;
    s.bestDayStreak = Math.max(s.bestDayStreak, s.dayStreak);
    say(m, 'Daily Quest complete.', 'level');
  }
  if (s.cleared && !s.paid && !penaltyActive(s)) {
    s.paid = true;
    say(m, 'Daily reward: +50 XP · +100 G');
    gain(s, 50, 100, m);
  }
}

function checkTitles(s, m) {
  for (const [name, , test] of TITLES) {
    if (s.titles.includes(name) || !test(s)) continue;
    s.titles.push(name);
    s.title ||= name;
    say(m, `Title acquired: “${name}”`, 'level');
  }
  return m;
}

// Runs whenever the app is used. Closes out every day since lastDate.
export function rollover(s, today) {
  const gap = days(s.lastDate, today), m = [];
  if (!(gap > 0)) return m;
  const missed = s.habits.length > 0 && (gap > 1 || !s.cleared);
  for (const h of s.habits) {
    if (gap > 1 || !done(h)) h.streak = 0;
    h.count = 0;
  }
  if (missed) s.dayStreak = 0;
  if (missed || penaltyActive(s)) {
    s.penalty = { text: s.penaltyText, done: false };
    say(m, missed ? 'You failed the Daily Quest. A Penalty Quest has been issued.' : 'The Penalty Quest remains.', 'warn');
  } else s.penalty = null;
  s.lastDate = today;
  s.cleared = s.paid = false;
  return m;
}

export function saveHabit(s, data, id) {
  const h = s.habits.find(x => x.id === id);
  if (!h) return s.habits.push({ id: uid(), count: 0, streak: 0, best: 0, shadow: '', ...data });
  const wasDone = done(h);
  Object.assign(h, data);
  // An edit never completes or un-completes a quest; only real progress does.
  h.count = wasDone ? h.target : Math.min(h.count, h.target - 1);
}

// dir: -1 / +1 steps, or Infinity to finish.
export function bump(s, id, dir) {
  const h = s.habits.find(x => x.id === id), m = [];
  if (!h || done(h)) return m;
  h.count = Math.max(0, Math.min(h.target, h.count + dir * (h.step || 1)));
  if (!done(h)) return m;
  h.streak++;
  h.best = Math.max(h.best, h.streak);
  if (penaltyActive(s)) say(m, `${h.name} complete. XP sealed. Clear the Penalty Quest.`, 'warn');
  else {
    const xp = DIFF[h.diff] || DIFF.Normal;
    say(m, `${h.name} complete. +${xp} XP · +${xp / 2} G`);
    gain(s, xp, xp / 2, m);
    train(s, h.stat, m);
  }
  checkDaily(s, m);
  return checkTitles(s, m);
}

export function clearPenalty(s) {
  const m = [];
  if (!penaltyActive(s)) return m;
  s.penalty.done = true;
  s.penaltiesCleared++;
  say(m, 'You survived. XP is unsealed.', 'level');
  checkDaily(s, m);
  return checkTitles(s, m);
}

export function bumpGate(s, id, dir) {
  const g = s.gates.find(x => x.id === id), m = [];
  if (!g || g.cleared) return m;
  if (penaltyActive(s)) {
    say(m, 'Gates are sealed. Clear the Penalty Quest first.', 'warn');
    return m;
  }
  g.progress = Math.max(0, Math.min(g.target, g.progress + dir));
  if (g.progress < g.target) return m;
  g.cleared = true;
  s.gateLog.push(g.rank);
  const xp = GATE_XP[g.rank];
  say(m, `${g.rank}-rank Gate cleared: ${g.name}. +${xp} XP · +${xp / 2} G`, 'level');
  gain(s, xp, xp / 2, m);
  return checkTitles(s, m);
}

export function saveGate(s, data, id) {
  const g = s.gates.find(x => x.id === id);
  if (!g) return s.gates.push({ id: uid(), progress: 0, cleared: false, ...data });
  Object.assign(g, data);
  g.progress = Math.min(g.progress, g.target - 1);
}

export function saveReward(s, data, id) {
  const r = s.rewards.find(x => x.id === id);
  r ? Object.assign(r, data) : s.rewards.push({ id: uid(), ...data });
}

export function arise(s, id, today) {
  const h = s.habits.find(x => x.id === id), m = [];
  if (!h || h.shadow || h.streak < ARISE_AT) return m;
  h.shadow = today;
  say(m, `ARISE. “${h.name}” has joined your Shadow Army.`, 'level');
  return checkTitles(s, m);
}

export function spend(s, stat) {
  if (s.points < 1) return [];
  s.points--;
  s.stats[stat]++;
  return [];
}

export function buy(s, id) {
  const r = s.rewards.find(x => x.id === id), m = [];
  if (!r) return m;
  if (s.gold < r.cost) say(m, `Not enough Gold. You need ${r.cost - s.gold} G more.`, 'warn');
  else {
    s.gold -= r.cost;
    say(m, `Purchased: ${r.name}. Enjoy it, Hunter.`);
  }
  return m;
}
