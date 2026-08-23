"use strict";
// The rules, tested one at a time.
//
// Aquamarine's placement rules are short to state and easy to get subtly
// wrong, and every one of them is invisible in play until it matters: a game
// that lets you touch a previous dive at the corner plays perfectly happily
// and is not the game Postmark designed. So each rule gets a test that fails
// for exactly one reason, and the assertions check WHY a placement was
// refused, not merely that it was.
//
//   npm test

const { test } = require("node:test");
const assert = require("node:assert");
const { load, mapData, hasMap } = require("./load.js");

const AQ = load();
const skip = !hasMap("map1") && "map1 has not been extracted";

// A tiny hand-built board, so the tests do not depend on where the artwork
// happens to put a rock. Two boats, a strip of rock across the middle.
function testBoard() {
  const cols = 8, rows = 8;
  const terrain = new Array(cols * rows).fill(0);
  for (let c = 2; c < 6; c++) terrain[4 * cols + c] = 1;      // a rock shelf
  return AQ.Board.make({
    id: "test", name: "Test", grid: { cols, rows },
    sheet: { grid: {} },
    palette: [{ id: 0, terrain: "water" }, { id: 1, terrain: "rock" }],
    terrain,
    boats: [{ cols: [0, 1, 2, 3], launch: [[0, 0], [1, 0], [2, 0], [3, 0]] }],
    depthLines: [{ row: 4 }, { row: 6 }],
    symbols: [],
    structure: { tanks: [12, 12, 12], turns: 24, diveMarks: [3, 5, 7], wheel: { ticks: 24, dayTicks: [0, 11], starts: [0, 4, 8, 12, 16, 20] } },
  });
}

const fresh = () => ({ occupied: new Set(), lastShape: null, previousDives: new Set() });
const row = (board, r, from, to) => {
  const out = [];
  for (let c = from; c <= to; c++) out.push(board.index(c, r));
  return out;
};

test("a dive must start under a boat", () => {
  const board = testBoard();
  const opts = Object.assign({ size: 2 }, fresh());
  assert.equal(AQ.Shapes.reject(board, row(board, 0, 0, 1), opts), null);
  assert.match(AQ.Shapes.reject(board, row(board, 0, 5, 6), opts) || "", /under a boat/);
  assert.match(AQ.Shapes.reject(board, row(board, 2, 0, 1), opts) || "", /under a boat/);
});

test("a shape must be exactly the size the die says", () => {
  const board = testBoard();
  const opts = Object.assign({ size: 3 }, fresh());
  assert.match(AQ.Shapes.reject(board, row(board, 0, 0, 1), opts) || "", /2 squares, not 3/);
  assert.equal(AQ.Shapes.reject(board, row(board, 0, 0, 2), opts), null);
});

test("only doubles may draw something other than a rectangle", () => {
  const board = testBoard();
  const bent = [board.index(0, 0), board.index(1, 0), board.index(1, 1)];
  assert.match(AQ.Shapes.reject(board, bent, Object.assign({ size: 3 }, fresh())) || "", /not a rectangle/);
  assert.equal(AQ.Shapes.reject(board, bent, Object.assign({ size: 3, freeform: true }, fresh())), null);
});

test("a freeform shape still has to be in one piece", () => {
  const board = testBoard();
  const split = [board.index(0, 0), board.index(1, 0), board.index(3, 0)];
  assert.match(
    AQ.Shapes.reject(board, split, Object.assign({ size: 3, freeform: true }, fresh())) || "",
    /one piece/);
});

test("nothing may be drawn through rock", () => {
  const board = testBoard();
  const opts = Object.assign({ size: 2 }, fresh());
  opts.lastShape = row(board, 3, 2, 3);
  assert.match(AQ.Shapes.reject(board, row(board, 4, 2, 3), opts) || "", /through the rock/);
});

test("each turn continues from the shape drawn LAST turn, not from anywhere in the dive", () => {
  const board = testBoard();
  const opts = fresh();
  opts.size = 2;
  // Dive so far: two boxes, ending at row 2. The first box is no longer live.
  opts.occupied = new Set([...row(board, 0, 0, 1), ...row(board, 1, 0, 1)]);
  opts.lastShape = row(board, 1, 0, 1);
  assert.equal(AQ.Shapes.reject(board, row(board, 2, 0, 1), opts), null, "next to last turn's box");
  assert.match(
    AQ.Shapes.reject(board, row(board, 0, 2, 3), opts) || "",
    /joined to the shape you drew last turn/,
    "next to the FIRST box, but not the last");
});

test("a new dive may not touch an earlier one, even at a corner", () => {
  const board = testBoard();
  const opts = fresh();
  opts.size = 2;
  // An earlier dive ran down from the fourth boat square. Both candidate
  // shapes below start legally under a boat, so the only thing separating
  // them is the no-touching rule.
  opts.previousDives = new Set([board.index(4, 1)]);
  opts.occupied = new Set(opts.previousDives);
  assert.match(
    AQ.Shapes.reject(board, row(board, 0, 2, 3), opts) || "",
    /touching an earlier dive/,
    "3,0 meets 4,1 at the corner -- legal in almost every grid game, forbidden here");
  assert.equal(AQ.Shapes.reject(board, row(board, 0, 0, 1), opts), null, "two squares clear");
});

test("the dice offer the low die free and the high die for the difference", () => {
  const opts = AQ.Dice.options([2, 5], []);
  assert.deepEqual(opts.map((o) => [o.id, o.size, o.air]), [["low", 2, 0], ["high", 5, 3]]);
});

test("doubles give two extra squares, no air, and any shape", () => {
  const opts = AQ.Dice.options([4, 4], []);
  assert.equal(opts.length, 1, "doubles are not a choice");
  assert.equal(opts[0].size, 6);
  assert.equal(opts[0].air, 0);
  assert.equal(opts[0].freeform, true);
});

test("the Trench's sum option costs the higher die", () => {
  const opts = AQ.Dice.options([3, 6], [AQ.Dice.sumOption]);
  const sum = opts.find((o) => o.id === "sum");
  assert.equal(sum.size, 9);
  assert.equal(sum.air, 6);
});

test("depth is charged on the deepest square of the shape", () => {
  const board = testBoard();
  const rng = () => 0.5;
  const state = AQ.State.create(board, rng, { startFace: 1 });
  const shallow = AQ.State.costOf(state, row(board, 0, 0, 1), { id: "low", air: 0 });
  assert.equal(shallow.air, 0, "above both lines");
  const deep = AQ.State.costOf(state, row(board, 6, 0, 1), { id: "low", air: 0 });
  assert.equal(deep.air, 2, "below both lines");
  const mixed = AQ.State.costOf(state, [board.index(0, 3), board.index(0, 5)], { id: "low", air: 0 });
  assert.equal(mixed.air, 1, "charged for the deepest square, not the shallowest");
});

test("an air bubble cancels the whole turn's spend", { skip }, () => {
  const board = AQ.Board.make(mapData("map1"));
  const bubble = board.objects.find((o) => o.symbol === "bubbles");
  const rng = () => 0.5;
  const state = AQ.State.create(board, rng, { startFace: 1 });
  const cell = bubble.cells[0];
  const cost = AQ.State.costOf(state, [cell], { id: "high", air: 4 });
  assert.equal(cost.free, true);
  assert.equal(cost.air, 0);
  assert.ok(cost.gross >= 4, "the spend was cancelled, not never incurred");
});

test("an expedition that never takes all three dives fails, however deep the first went", () => {
  const board = testBoard();
  const state = AQ.State.create(board, () => 0.5, { startFace: 1 });
  state.diveCells = [[board.index(0, 7)]];        // one dive, all the way down
  const result = AQ.State.soloResult(state);
  assert.equal(result.passed, false);
  assert.equal(result.depths.length, 3, "all three dives are judged, taken or not");
});

test("gold needs every dive past the deepest mark", () => {
  const board = testBoard();
  const state = AQ.State.create(board, () => 0.5, { startFace: 1 });
  const at = (r) => [board.index(0, r)];
  state.diveCells = [at(7), at(7), at(7)];
  assert.equal(AQ.State.soloResult(state).medal, "gold");
  state.diveCells = [at(7), at(5), at(7)];
  assert.equal(AQ.State.soloResult(state).medal, "silver");
  state.diveCells = [at(7), at(3), at(7)];
  assert.equal(AQ.State.soloResult(state).medal, "bronze");
  state.diveCells = [at(7), at(2), at(7)];
  assert.equal(AQ.State.soloResult(state).passed, false);
});

test("the turn wheel splits day and night by where you join it", () => {
  const board = testBoard();
  const dayCount = (face) => {
    const s = AQ.State.create(board, () => 0.5, { startFace: face });
    let n = 0;
    for (let t = 0; t < 24; t++) if (AQ.State.isDay(s, t)) n++;
    return n;
  };
  // Every entry point plays 12 day turns and 12 night ones over 24 turns --
  // the wheel decides the ORDER, not the balance.
  for (let face = 1; face <= 6; face++) assert.equal(dayCount(face), 12, "face " + face);
  // ...but the order really does differ, which is the point of the roll.
  const first = AQ.State.create(board, () => 0.5, { startFace: 1 });
  const fourth = AQ.State.create(board, () => 0.5, { startFace: 4 });
  assert.notEqual(AQ.State.isDay(first, 0), AQ.State.isDay(fourth, 0));
});

test("every object on every map sits on water it is possible to enclose", { skip }, () => {
  for (const id of ["map1", "map2", "map3", "map4", "map5"]) {
    if (!hasMap(id)) continue;
    const board = AQ.Board.make(mapData(id));
    for (const obj of board.objects) {
      assert.ok(obj.cells.length, id + ": " + obj.symbol + " at " + obj.home + " has no squares");
      // Fossils are quarried out of the rock rather than enclosed; everything
      // else has to be reachable or it is a scoring category nobody can score.
      if (obj.symbol.startsWith("fossil")) continue;
      for (const i of obj.cells)
        assert.ok(!board.isBlocked(i),
          id + ": " + obj.symbol + " at " + obj.home + " has a square in the rock");
    }
  }
});
