"use strict";
// A game in progress.
//
// Twenty-four turns, three dives, one tank of air each. The state machine is
// small but every transition in it is a rule someone can get wrong on paper,
// so each is spelled out here rather than being left to the interface:
//
//   * a dive ends the moment its tank empties, and the NEXT turn starts a new
//     one from the surface -- you do not lose the turn that emptied it
//   * you may spend air you do not have; you simply cross off what is left and
//     surface next turn
//   * ending a dive early costs you the whole rest of the tank, and the dice
//     already rolled are used to start the new dive immediately
//   * finishing the third dive ends the game, even with turns left on the track
//
// The turn track is a wheel of 24 ticks with six numbered entry points, and a
// die decides where you join it. That is not decoration: half the wheel is day
// and half is night, so where you start decides how the game's 24 turns split
// between them, and therefore whether the stingrays or the cuttlefish are the
// ones you can afford to chase.

window.AQ = window.AQ || {};

AQ.State = (() => {
  const DIVES = 3;

  function create(board, rng, opts) {
    const options = opts || {};
    const wheel = board.structure.wheel || { ticks: 24, dayTicks: [0, 11], starts: [0, 4, 8, 12, 16, 20] };
    const tanks = (board.structure.tanks || [12, 12, 12]).slice();
    const startFace = options.startFace || (1 + Math.floor(rng() * wheel.starts.length));
    const rules = options.rules || {};

    const state = {
      board, rng, rules, wheel,
      turn: 0,
      turns: board.structure.turns || 24,
      startTick: wheel.starts[startFace - 1],
      startFace,

      dive: 0,                       // which dive we are on, 0-based
      tanks,                         // capacity of each tank
      spent: tanks.map(() => 0),     // air crossed off in each
      diveCells: [],                 // cells drawn, per dive
      lastShape: null,               // the shape drawn on the previous turn
      surfacedThisTurn: false,

      occupied: new Set(),           // every cell drawn in the whole game
      previousDives: new Set(),      // cells belonging to earlier dives only
      history: [],                   // one record per turn taken
      roll: null,
      over: false,
    };
    state.diveCells[0] = [];
    return state;
  }

  // Which tick of the wheel this turn sits on, and therefore whether it is day.
  const tickOf = (s, turn) => (s.startTick + turn) % s.wheel.ticks;
  const isDay = (s, turn) => {
    const t = tickOf(s, turn === undefined ? s.turn : turn);
    const [from, to] = s.wheel.dayTicks;
    return t >= from && t <= to;
  };

  // How many turns of the current hour are left, counting this one -- and
  // whether it is the GAME that ends it rather than the hour.
  //
  // Counted by stepping forward rather than by arithmetic on the wheel, because
  // the wheel wraps: four of the six starting faces cross the day/night line
  // TWICE, so "ticks to the boundary" is not the same question. Stepping also
  // makes the cap fall out for free -- promising eight turns of night when four
  // turns of game remain would be worse than saying nothing.
  function hoursLeft(s) {
    const day = isDay(s);
    let n = 0;
    for (let t = s.turn; t < s.turns; t++) {
      if (isDay(s, t) !== day) return { n, day, capped: false };
      n++;
    }
    return { n, day, capped: true };
  }

  const airLeft = (s) => Math.max(0, s.tanks[s.dive] - s.spent[s.dive]);
  const tankEmpty = (s) => s.spent[s.dive] >= s.tanks[s.dive];

  function rollDice(s) {
    if (s.over) return null;
    s.roll = AQ.Dice.roll(s.rng);
    return s.roll;
  }

  function options(s) {
    if (!s.roll) return [];
    return AQ.Dice.options(s.roll, s.rules.diceExtras ? s.rules.diceExtras(s) : []);
  }

  // What placing here would cost and why -- computed before the move is made,
  // so the interface can show the price of a shape while it is being dragged.
  function costOf(s, cells, option) {
    const board = s.board;
    let air = option.air;
    const reasons = [];
    if (air) reasons.push(option.id === "sum" ? "the higher die" : "taking the bigger die");

    // Depth is charged on where the turn FINISHES, which the rules define as
    // the deepest square of the shape just drawn.
    const deepest = Math.max.apply(null, cells.map((i) => board.row(i)));
    const depth = board.depthCost(deepest);
    if (depth) { air += depth; reasons.push("diving below the " + (depth === 1 ? "-1" : "-2") + " AIR line"); }

    if (s.rules.extraAir) {
      const extra = s.rules.extraAir(s, cells);
      if (extra && extra.air) { air += extra.air; reasons.push(extra.why); }
    }

    // An air bubble cancels the whole turn's spend, for any reason at all.
    const free = cells.some((i) => board.objectsAt(i).some((o) => s.rules.isFreeAir
      ? s.rules.isFreeAir(o) : o.symbol === "bubbles"));
    return { air: free ? 0 : air, gross: air, free, reasons };
  }

  // Draw a shape. Returns { ok } or { ok: false, why }.
  function place(s, cells, option) {
    if (s.over) return { ok: false, why: "the game is over" };
    const why = AQ.Shapes.reject(s.board, cells, {
      size: option.size,
      freeform: option.freeform,
      occupied: s.occupied,
      lastShape: s.lastShape,
      previousDives: s.previousDives,
    });
    if (why) return { ok: false, why };
    // A map may forbid a placement the core rules allow -- Apex Predators will
    // not let you into a cave at night without a torch.
    if (s.rules.canPlace) {
      const blocked = s.rules.canPlace(s, cells, option);
      if (blocked) return { ok: false, why: blocked };
    }

    const cost = costOf(s, cells, option);
    for (const i of cells) { s.occupied.add(i); s.diveCells[s.dive].push(i); }
    s.lastShape = cells.slice();
    s.spent[s.dive] = Math.min(s.tanks[s.dive], s.spent[s.dive] + cost.air);

    const record = {
      turn: s.turn, dive: s.dive, roll: s.roll.slice(),
      option: option.id, cells: cells.slice(),
      air: cost.air, day: isDay(s),
    };
    if (s.rules.onPlace) s.rules.onPlace(s, record);
    s.history.push(record);

    advance(s, tankEmpty(s));
    return { ok: true, cost };
  }

  // Skip the turn without drawing. The rules allow it -- rarely wise, but a
  // player with no legal placement has to be able to pass rather than stall.
  function pass(s) {
    if (s.over) return;
    s.history.push({ turn: s.turn, dive: s.dive, roll: s.roll.slice(), option: "pass", cells: [], air: 0, day: isDay(s) });
    advance(s, false);
  }

  // End the current dive early: cross off every remaining breath, then use the
  // dice already rolled to begin the next dive from the surface. The turn is
  // not lost, which is what makes it a real option rather than a penalty.
  function surface(s) {
    if (s.over) return { ok: false, why: "the game is over" };
    if (!s.diveCells[s.dive].length) return { ok: false, why: "this dive has not started yet" };
    s.spent[s.dive] = s.tanks[s.dive];
    startNextDive(s);
    return { ok: true };
  }

  function startNextDive(s) {
    for (const i of s.diveCells[s.dive]) s.previousDives.add(i);
    s.dive++;
    s.lastShape = null;
    if (s.dive >= DIVES) { s.over = true; return; }
    s.diveCells[s.dive] = [];
  }

  function advance(s, diveFinished) {
    if (diveFinished) startNextDive(s);
    s.turn++;
    if (s.turn >= s.turns) s.over = true;
    s.roll = null;
  }

  // Solo result. Every dive must get below the first mark or the expedition
  // has failed, whatever the score; the second and third marks are silver and
  // gold.
  //
  // All THREE dives are judged, including any never taken. That is the whole
  // point of the condition: a player who takes the lower die every turn and
  // stays in the shallows spends no air at all, so one tank lasts the full 24
  // turns and two dives never happen. The scoring is happy with that -- it is
  // simply a low score -- and without this the same timid game came out as a
  // gold-medal expedition on the strength of its single dive.
  function diveDepths(s) {
    const out = [];
    for (let i = 0; i < DIVES; i++) {
      const cells = s.diveCells[i];
      out.push(cells && cells.length ? Math.max.apply(null, cells.map((c) => s.board.row(c))) : -1);
    }
    return out;
  }

  function soloResult(s) {
    const marks = s.board.diveMarks;
    const depths = diveDepths(s);
    const reached = (mark) => depths.every((d) => d >= mark);
    if (!marks.length) return { medal: null, passed: true, depths };
    if (!reached(marks[0])) return { medal: null, passed: false, depths };
    if (marks[2] !== undefined && reached(marks[2])) return { medal: "gold", passed: true, depths };
    if (marks[1] !== undefined && reached(marks[1])) return { medal: "silver", passed: true, depths };
    return { medal: "bronze", passed: true, depths };
  }

  return {
    DIVES, create, rollDice, options, place, pass, surface, costOf,
    isDay, tickOf, hoursLeft, airLeft, tankEmpty, diveDepths, soloResult,
  };
})();
