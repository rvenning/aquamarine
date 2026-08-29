"use strict";
// The guided expedition, checked against the game it is teaching.
//
// A tutorial is a script written against a moving target. It says "take the 5,
// it costs three breaths" and "tap six connected squares" -- sentences that are
// only true if the dice really are what the script asked for and the option ids
// really are what the dice module produces. Nothing in the browser complains
// when they drift: the card just says something false, and a new player learns
// the wrong game.
//
// So the script is replayed here against the real engine on the real Map 1
// board. Every forced roll is rolled, every gated choice is looked up in the
// options the engine actually offers, and every square the coach points at is
// checked to be a square.
//
//   npm test

const { test } = require("node:test");
const assert = require("node:assert");
const { load, mapData, hasMap } = require("./load.js");

const AQ = load(["tutorial.js"]);
const skip = !hasMap("map1") && "map1 has not been extracted";

const board = () => AQ.Board.make(mapData("map1"));

// A stand-in for the live `app` the spot functions read. They only ever ask for
// the board and the state, which is the whole reason they take it as an
// argument rather than closing over the game.
const fakeApp = (b) => ({ board: b, state: null });

test("the tutorial forces exactly the dice its script names", { skip }, () => {
  const rng = AQ.Tutorial.scriptedRng(() => 0.5);
  const s = AQ.State.create(board(), rng, { startFace: AQ.Tutorial.START_FACE });

  const wanted = AQ.Tutorial.STEPS.filter((step) => step.roll);
  assert.ok(wanted.length >= 5, "the script should teach with several rolls");

  for (const step of wanted) {
    rng.feed(step.roll);
    const rolled = AQ.State.rollDice(s);
    assert.deepStrictEqual(rolled, step.roll,
      'step "' + step.title + '" asked for ' + step.roll + " and got " + rolled);
  }
});

test("past the end of the script the dice are ordinary again", { skip }, () => {
  // Otherwise a player who skips the coach and plays on gets a frozen die.
  const rng = AQ.Tutorial.scriptedRng(GKish());
  const s = AQ.State.create(board(), rng, { startFace: AQ.Tutorial.START_FACE });
  const seen = new Set();
  for (let i = 0; i < 60; i++) seen.add(AQ.State.rollDice(s).join(","));
  assert.ok(seen.size > 10, "the fallback generator should produce varied rolls, saw " + seen.size);
});

// A tiny LCG standing in for gamekit's seeded generator, which the tests do not
// load. Only its shape matters here.
function GKish() {
  let n = 12345;
  return () => ((n = (n * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
}

test("every gated choice is one the engine actually offers", { skip }, () => {
  const rng = AQ.Tutorial.scriptedRng(() => 0.5);
  const s = AQ.State.create(board(), rng, { startFace: AQ.Tutorial.START_FACE });

  // Walk the script keeping track of which roll is live, exactly as play does:
  // a step with `roll` performs it, and a later step's `only` is judged against
  // whatever was rolled most recently.
  let live = null;
  for (const step of AQ.Tutorial.STEPS) {
    if (step.roll) { rng.feed(step.roll); live = AQ.State.rollDice(s); }
    if (!step.only) continue;
    assert.ok(live, 'step "' + step.title + '" gates a die with no roll before it');
    const ids = AQ.State.options(s).map((o) => o.id);
    assert.ok(ids.includes(step.only),
      'step "' + step.title + '" wants the "' + step.only + '" option; ' +
      live + " offers " + ids.join(", "));
  }
});

// The roll a step is played under is the last one the script forced before it:
// a step says "Roll", and the step after it talks about what came up.
function rollBefore(step) {
  const before = AQ.Tutorial.STEPS.slice(0, AQ.Tutorial.STEPS.indexOf(step)).filter((x) => x.roll);
  assert.ok(before.length, 'nothing rolls before "' + step.title + '"');
  return before[before.length - 1].roll;
}

test("the die the doubles step teaches really is a free-form shape", { skip }, () => {
  const rng = AQ.Tutorial.scriptedRng(() => 0.5);
  const s = AQ.State.create(board(), rng, { startFace: AQ.Tutorial.START_FACE });
  const step = AQ.Tutorial.STEPS.find((x) => x.only === "double");
  assert.ok(step, "the script should teach doubles");
  const roll = rollBefore(step);
  assert.strictEqual(roll[0], roll[1], "the roll before the doubles step should be a double");

  rng.feed(roll);
  AQ.State.rollDice(s);
  const option = AQ.State.options(s).find((o) => o.id === "double");
  assert.ok(option.freeform, "a double should allow a shape other than a rectangle");
  // The card says "tap six connected squares". If the rules ever change what a
  // double is worth, that sentence has to change with them.
  assert.strictEqual(option.size, roll[0] + 2);
  assert.strictEqual(option.air, 0, "doubles cost no air");

  // Both cards -- the one offering the double and the one asking for the shape
  // -- state the size out loud, so both have to move if the rule ever does.
  const asking = AQ.Tutorial.STEPS[AQ.Tutorial.STEPS.indexOf(step) + 1];
  for (const card of [step, asking])
    assert.ok(names(card.text, option.size),
      'the "' + card.title + '" card should say how many squares: ' + option.size);
});

// Cards spell small numbers out, because "tap six connected squares" reads
// better than "tap 6". Either form counts as naming it.
const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven",
  "eight", "nine", "ten", "eleven", "twelve"];
function names(text, n) {
  if (typeof text !== "string") return false;
  const forms = [String(n)].concat(WORDS[n] ? [WORDS[n]] : []);
  return forms.some((f) => new RegExp("\\b" + f + "\\b", "i").test(text));
}

test("the card that says the higher die costs three breaths is right", { skip }, () => {
  const step = AQ.Tutorial.STEPS.find((x) => x.only === "high");
  assert.ok(step, "the script should teach buying the higher die");
  const roll = rollBefore(step);
  const gap = Math.abs(roll[0] - roll[1]);
  assert.match(step.text, /\bthree breaths\b/,
    "the card claims a price; it should be the one the dice make");
  assert.strictEqual(gap, 3, "that roll costs " + gap + " air, not three");
});

test("everything the coach points at is a square on the board", { skip }, () => {
  const b = board();
  const app = fakeApp(b);
  let pointed = 0;
  for (const step of AQ.Tutorial.STEPS) {
    if (!step.spot) continue;
    const cells = step.spot(app);
    assert.ok(cells.length, 'step "' + step.title + '" points at nothing');
    for (const i of cells)
      assert.ok(Number.isInteger(i) && i >= 0 && i < b.size,
        'step "' + step.title + '" points at cell ' + i);
    pointed++;
  }
  assert.ok(pointed >= 2, "the script should point at the board somewhere");
});

test("the boat step points at squares a first box may actually use", { skip }, () => {
  const b = board();
  const step = AQ.Tutorial.STEPS.find((x) => /boat/i.test(x.title));
  assert.ok(step && step.spot, "the script should teach starting at a boat");
  const cells = step.spot(fakeApp(b));
  assert.ok(cells.every((i) => b.isLaunch(i)), "every lit square should be a launch square");
  assert.strictEqual(cells.length, b.boats.reduce((n, boat) => n + boat.launch.length, 0));
});

test("the depth lesson points at the line it is talking about", { skip }, () => {
  const b = board();
  const step = AQ.Tutorial.STEPS.find((x) => /depth/i.test(x.title));
  assert.ok(step && step.spot, "the script should teach depth");
  const cells = step.spot(fakeApp(b));
  // Pointing at the row ABOVE the line, or one row too far down, would teach a
  // rule that is off by one -- and nothing on screen would look wrong.
  assert.ok(cells.every((i) => b.depthCost(b.row(i)) === 1),
    "the lit row should be the first row that costs a breath");
  assert.strictEqual(cells.length, b.cols);
});

test("every step waits for something the game can report", { skip }, () => {
  const KNOWN = new Set(["next", "roll", "choose", "place", "surface", "end"]);
  const steps = AQ.Tutorial.STEPS;
  for (const step of steps) {
    assert.ok(step.title, "every step needs a title");
    assert.ok(step.text, 'step "' + step.title + '" has no text');
    assert.ok(KNOWN.has(step.wait), 'step "' + step.title + '" waits for "' + step.wait + '"');
  }
  assert.strictEqual(steps.filter((s) => s.wait === "end").length, 1,
    "exactly one step should end the tutorial");
  assert.strictEqual(steps[steps.length - 1].wait, "end", "and it should be the last one");

  // A die can only be chosen when there is a roll on the table, and a box can
  // only be drawn once a die has been taken. Getting this wrong strands the
  // player on a card whose instruction is impossible to follow.
  let rolled = false, chosen = false;
  for (const step of steps) {
    if (step.wait === "choose")
      assert.ok(rolled, 'step "' + step.title + '" asks for a die with no roll on the table');
    if (step.wait === "place")
      assert.ok(chosen, 'step "' + step.title + '" asks for a box with no die taken');
    if (step.wait === "roll") { rolled = true; chosen = false; }
    if (step.wait === "choose") chosen = true;
    if (step.wait === "place") chosen = false;
    // Surfacing reuses the dice already rolled, which is why the next dive can
    // be drawn without rolling again.
    if (step.wait === "surface") chosen = false;
  }
});

test("a scripted game is playable to the end of the script", { skip }, () => {
  // The strongest check available without a browser: play the script's rolls
  // through the real engine with a bot placing the boxes, and assert the
  // tutorial never asks for something no legal move satisfies.
  const b = board();
  const rng = AQ.Tutorial.scriptedRng(GKish());
  const rules = AQ.Rules.map1;
  const s = AQ.State.create(b, rng, {
    startFace: AQ.Tutorial.START_FACE,
    rules: rules.hooks ? rules.hooks(rules.newProgress ? rules.newProgress() : null, b) : {},
  });

  let live = null;
  for (const step of AQ.Tutorial.STEPS) {
    if (step.roll) { rng.feed(step.roll); live = AQ.State.rollDice(s); }
    if (step.wait === "surface") {
      assert.ok(AQ.State.surface(s).ok, "the tutorial's surface step should be legal");
      continue;
    }
    if (step.wait !== "place") continue;

    const option = AQ.State.options(s).find((o) => !step.only || o.id === step.only)
      || AQ.State.options(s)[0];
    const moves = AQ.Shapes.legalRectangles(b, {
      size: option.size, freeform: option.freeform,
      occupied: s.occupied, lastShape: s.lastShape, previousDives: s.previousDives,
    });
    assert.ok(moves.length,
      'step "' + step.title + '" asks for a box of ' + option.size +
      " and the board offers none (roll " + live + ", dive " + (s.dive + 1) + ")");
    assert.ok(AQ.State.place(s, moves[0], option).ok);
  }
  assert.ok(!s.over, "the script should finish well inside the game's 24 turns");
});
