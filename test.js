import assert from 'node:assert/strict';
import * as L from './logic.js';

const fresh = () => {
  const s = L.newState('Jinwoo', '2026-10-01');
  L.saveHabit(s, { name: 'Push-ups', target: 20, step: 5, stat: 'STR', diff: 'Normal' });
  L.saveHabit(s, { name: 'Read', target: 1, stat: 'INT', diff: 'Hard' });
  return s;
};
const finishAll = s => s.habits.flatMap(h => L.bump(s, h.id, Infinity));

// XP curve + multiple level-ups at once
{
  const s = fresh();
  assert.equal(L.need(1), 110);
  L.saveGate(s, { name: 'Big', rank: 'S', target: 1 });
  L.bumpGate(s, s.gates[0].id, 1); // +2000 XP
  let lvl = 1, xp = 2000;
  while (xp >= L.need(lvl)) xp -= L.need(lvl++);
  assert.equal(s.level, lvl);
  assert.equal(s.xp, xp);
  assert.equal(s.points, 5 * (lvl - 1));
  assert.ok(s.titles.includes('Demon Hunter'));
}

// Rank thresholds
assert.deepEqual([1, 9, 10, 20, 35, 50, 70, 100].map(L.rank), ['E', 'E', 'D', 'C', 'B', 'A', 'S', 'National']);

// Steps, completion, daily bonus, stat training
{
  const s = fresh(), [p] = s.habits;
  L.bump(s, p.id, 1);
  assert.equal(p.count, 5);
  L.bump(s, p.id, -1);
  assert.equal(p.count, 0);
  finishAll(s);
  assert.ok(s.cleared && s.paid);
  assert.equal(s.dayStreak, 1);
  assert.equal(s.gold, 10 + 20 + 100);
  assert.equal(s.statXp.STR, 1);
  assert.deepEqual(L.bump(s, p.id, 1), []); // locked once done
}

// Clean day → no penalty, streaks kept
{
  const s = fresh();
  finishAll(s);
  L.rollover(s, '2026-10-02');
  assert.equal(s.penalty, null);
  assert.equal(s.habits[0].streak, 1);
  assert.equal(s.habits[0].count, 0);
  assert.equal(s.dayStreak, 1);
}

// Missed yesterday → penalty, XP sealed, then unsealed
{
  const s = fresh();
  L.bump(s, s.habits[0].id, Infinity); // only one of two done
  L.rollover(s, '2026-10-02');
  assert.ok(L.penaltyActive(s));
  assert.equal(s.habits[0].streak, 1); // the habit you did keeps its own streak
  assert.equal(s.habits[1].streak, 0);
  assert.equal(s.dayStreak, 0);
  const xp = s.xp;
  finishAll(s);
  assert.equal(s.xp, xp); // sealed
  assert.ok(s.cleared && !s.paid);
  L.clearPenalty(s);
  assert.ok(s.paid); // daily bonus releases once penalty survived
  assert.ok(s.titles.includes('One Who Overcame Adversity'));
  assert.equal(L.bumpGate(s, 'x', 1).length, 0);
}

// Days skipped entirely → penalty and all streaks reset even if last day was clean
{
  const s = fresh();
  finishAll(s);
  L.rollover(s, '2026-10-04');
  assert.ok(L.penaltyActive(s));
  assert.ok(s.habits.every(h => h.streak === 0));
  // an unsurvived penalty carries over to the next day
  finishAll(s);
  L.rollover(s, '2026-10-05');
  assert.ok(L.penaltyActive(s));
  // same day / clock going backwards is a no-op
  assert.deepEqual(L.rollover(s, '2026-10-05'), []);
  assert.deepEqual(L.rollover(s, '2026-10-01'), []);
}

// Gates are sealed during a penalty
{
  const s = fresh();
  L.saveGate(s, { name: 'Books', rank: 'E', target: 2 });
  s.penalty = { text: '', done: false };
  L.bumpGate(s, s.gates[0].id, 1);
  assert.equal(s.gates[0].progress, 0);
}

// ARISE at 66
{
  const s = fresh(), [h] = s.habits;
  h.streak = 65;
  assert.deepEqual(L.arise(s, h.id, '2026-10-01'), []);
  h.streak = 66;
  L.arise(s, h.id, '2026-10-01');
  assert.equal(h.shadow, '2026-10-01');
  assert.ok(s.titles.includes('Commander of Shadows'));
}

// Job change at 40
{
  const s = fresh();
  s.level = 39;
  s.xp = L.need(39) - 1;
  finishAll(s);
  assert.equal(s.job, 'Shadow Monarch');
}

// Editing never completes a quest for free
{
  const s = fresh(), [p] = s.habits;
  L.bump(s, p.id, 1); // 5/20
  L.saveHabit(s, { target: 5 }, p.id);
  assert.equal(p.count, 4);
}

// Shop + restore validation
{
  const s = fresh();
  L.saveReward(s, { name: 'Anime episode', cost: 150 });
  L.buy(s, s.rewards[0].id);
  assert.equal(s.gold, 0);
  s.gold = 200;
  L.buy(s, s.rewards[0].id);
  assert.equal(s.gold, 50);
  assert.equal(L.restore({ level: 1 }, '2026-10-01'), null);
  assert.equal(L.restore(JSON.parse(JSON.stringify(s)), '2026-10-01').gold, 50);
}

console.log('all checks passed');
