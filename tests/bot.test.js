"use strict";
// Playing the game thousands of times, to check the rules rather than to win.
//
// Two properties matter here and neither can be checked by hand.
//
// LEGALITY. Every move a bot makes goes through the same AQ.Shapes.reject the
// interface uses, and the moves it chooses from come from legalRectangles. If
// those two ever disagree -- a placement offered as legal and then refused, or
// vice versa -- the game would either dangle a move the player cannot make or
// let them make one they should not. Hundreds of games is the cheapest way to
// find the corner where they part company.
//
// CALIBRATION. Postmark printed a rank table on the Diver's Log: Flounderer up
// to 40, Instructor from 111. That is a statement about what scores this game
// produces, and it is the only external check on whether the scoring adds up
// the way the paper game does. Every category can look right individually
// while the total lands somewhere the designers never intended.
//
// The bot plays one move ahead and is not trying to be good, so the thresholds
// below are deliberately loose -- they are there to catch a scoring change
// that moves the whole distribution, not to pin a number.
//
//   npm test

const { test } = require("node:test");
const assert = require("node:assert");
const { load, mapData, hasMap } = require("./load.js");
const { makeBot, seededRng } = require("./bot.js");

const AQ = load();
const GAMES = 40;
const skip = !hasMap("map1") && "map1 has not been extracted";

function playMany(id, greedy, games) {
  const board = AQ.Board.make(mapData(id));
  const rules = AQ.Rules[id];
  const runs = [];
  for (let i = 1; i <= games; i++) {
    const rng = seededRng(i * 7919);
    // Each map keeps its own running state and supplies the hooks that read
    // it, exactly as the game does -- a bot playing Apex Predators has to be
    // refused a night-time cave when its torches run out.
    const progress = rules && rules.newProgress ? rules.newProgress() : null;
    const hooks = rules && rules.hooks ? rules.hooks(progress, board) : {};
    const state = AQ.State.create(board, rng, { startFace: 1 + Math.floor(rng() * 6), rules: hooks });
    const { illegal } = makeBot(AQ, board, { greedy }).play(state);
    const bonuses = ["stingray", "cuttlefish", "flag", "wreck"];
    const result = rules ? rules.score(state, bonuses, progress) : { total: 0, lines: [] };
    runs.push({ seed: i * 7919, state, result, illegal, progress });
  }
  return runs;
}

const scores = (runs) => runs.map((r) => r.result.total).sort((a, b) => a - b);
const median = (xs) => xs[Math.floor(xs.length / 2)];

// Every map, not just the first. Each of the later four adds rules that can
// refuse a placement or change what a turn costs, and a rule that is wrong in
// one direction offers a move the engine then rejects.
test("no bot on any map ever makes a move the rules refuse", { skip }, () => {
  for (const id of ["map1", "map2", "map3", "map4", "map5"]) {
    if (!hasMap(id)) continue;
    for (const greedy of [true, false]) {
      const runs = playMany(id, greedy, 12);
      const bad = runs.filter((r) => r.illegal);
      assert.equal(bad.length, 0,
        id + " " + (greedy ? "greedy" : "random") + " bot made illegal moves in seeds " +
        bad.map((r) => r.seed).join(", "));
    }
  }
});

test("every map plays to the end and scores", { skip }, () => {
  for (const id of ["map1", "map2", "map3", "map4", "map5"]) {
    if (!hasMap(id)) continue;
    const runs = playMany(id, true, 8);
    for (const r of runs) {
      assert.ok(r.state.over, id + " seed " + r.seed + " did not finish");
      assert.ok(Number.isFinite(r.result.total), id + " scored " + r.result.total);
      assert.ok(r.result.lines.length >= 5, id + " scored only " + r.result.lines.length + " categories");
      assert.ok(r.result.rank, id + " produced no rank");
    }
    // A map where nothing at all ever scores has a broken scoring module, and
    // the totals alone would not show it -- Map 1 shipped exactly that way
    // twice, with flags and wrecks unreachable.
    const scored = new Set();
    for (const r of runs) for (const line of r.result.lines) if (line.points !== 0) scored.add(line.key);
    assert.ok(scored.size >= 3, id + " only ever scored: " + [...scored].join(", "));
  }
});

test("every game ends within its 24 turns", { skip }, () => {
  for (const r of playMany("map1", true, GAMES)) {
    assert.ok(r.state.over, "seed " + r.seed + " did not finish");
    assert.ok(r.state.turn <= r.state.turns,
      "seed " + r.seed + " played " + r.state.turn + " turns");
    // Three dives, no more: finishing the third ends the game even with turns
    // left on the track.
    assert.ok(r.state.dive <= AQ.State.DIVES, "seed " + r.seed + " took a fourth dive");
  }
});

test("air is never overspent, and a dive ends when its tank runs out", { skip }, () => {
  for (const r of playMany("map1", true, GAMES))
    for (let d = 0; d < r.state.spent.length; d++)
      assert.ok(r.state.spent[d] <= r.state.tanks[d],
        "seed " + r.seed + " spent " + r.state.spent[d] + " from a tank of " + r.state.tanks[d]);
});

test("the score distribution sits where the printed rank table says it should", { skip }, () => {
  const random = scores(playMany("map1", false, GAMES));
  const greedy = scores(playMany("map1", true, GAMES));

  // Playing at random should land in the bottom band. If it does not, the
  // scoring has become too generous somewhere.
  assert.ok(median(random) <= 40,
    "random play medians " + median(random) + ", which the table calls Beginner or better");

  // Playing with any thought at all should clear it, and comfortably.
  assert.ok(median(greedy) >= 25,
    "thinking one move ahead only medians " + median(greedy) + " -- scoring may have lost a category");
  assert.ok(median(greedy) > median(random) * 2.5,
    "greedy " + median(greedy) + " vs random " + median(random) + " -- playing well barely helps");
  assert.ok(greedy[greedy.length - 1] >= 41,
    "the best of " + GAMES + " games only reached " + greedy[greedy.length - 1]);
});

test("the solo expedition is winnable, and not by accident", { skip }, () => {
  const greedy = playMany("map1", true, GAMES).filter((r) => r.result.solo.passed).length;
  const random = playMany("map1", false, GAMES).filter((r) => r.result.solo.passed).length;
  // The condition is that all three dives get below the first mark. A bot that
  // plans its dives should manage it most of the time; one that does not
  // should almost never, since a shallow dive costs no air and therefore never
  // ends on its own.
  assert.ok(greedy >= GAMES * 0.5, "only " + greedy + "/" + GAMES + " planned expeditions passed");
  assert.ok(random <= GAMES * 0.2, random + "/" + GAMES + " random expeditions passed -- too easy");
});

test("every scoring category can actually be scored", { skip }, () => {
  // A category nobody ever scores is indistinguishable from one that is broken,
  // and this project has already shipped two: flags and shipwrecks were both
  // unreachable for a while because their squares were counted as rock.
  const seen = new Set();
  for (const r of playMany("map1", true, GAMES))
    for (const line of r.result.lines) if (line.points !== 0) seen.add(line.key);
  for (const key of ["fish", "coral", "stingray", "beacon", "flag", "wreck"])
    assert.ok(seen.has(key), "no game ever scored anything for " + key);
});
