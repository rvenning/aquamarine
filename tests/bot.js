"use strict";
// A bot that plays Aquamarine, used to check the rules rather than to be good
// at them.
//
// Two things need a bot. The first is legality: a human tester will try a few
// dozen placements, while a bot plays thousands and every one of them goes
// through the same AQ.Shapes.reject the interface uses, so a rule that is
// wrong in some corner shows up as an accepted move that should not have been.
//
// The second is calibration. Postmark printed a rank table on the Diver's Log
// -- Flounderer up to 40, Instructor from 111 -- which is a statement about
// what scores this game produces. If a bot playing sensibly cannot reach the
// upper bands, or a bot playing at random cannot fall into the lower ones, the
// digital scoring has drifted from the paper game even though every individual
// category looks right.
//
// The strategy below is deliberately plain. It is not trying to play well; it
// is trying to play like someone who has read the rules once, which is the
// standard the rank table was written against.

function makeBot(AQ, board, opts) {
  const options = opts || {};
  const greedy = options.greedy !== false;

  // What a placement is worth, roughly, in the currency the sheet uses.
  // Deliberately approximate: the bot is a player, not a solver.
  function valueOf(state, cells, option) {
    const shape = new Set(cells);
    let value = 0;
    let fish = 0;
    const corals = new Set();
    const enclosedNow = new Set();

    for (const i of cells)
      for (const obj of board.objectsAt(i)) {
        // Only count something the shape actually finishes.
        if (!obj.cells.every((c) => shape.has(c) || state.occupied.has(c))) continue;
        if (enclosedNow.has(obj.id)) continue;
        enclosedNow.add(obj.id);
        switch (obj.symbol) {
          case "fish": fish++; break;
          case "jellyfish": value -= 2; break;
          case "coral-purple": case "coral-orange": corals.add(obj.symbol); value += 2; break;
          case "stingray": value += AQ.State.isDay(state) ? 5 : 0; break;
          case "cuttlefish": value += AQ.State.isDay(state) ? 0 : 5; break;
          case "beacon": value += 7; break;
          case "flag": value += board.flagValue(obj.cells[0]); break;
          case "wreck": value += 8; break;
          case "shark": value -= 3; break;
          case "penguin": value += 7; break;
          case "squid": value += 10; break;
          case "vent": value += 6; break;
          case "glass-squid": value += 5; break;
          case "bubbles": value += 1; break;
          default: break;
        }
      }
    // Mixing coral colours in one box wipes out every coral in it.
    if (corals.size > 1) value -= 4;
    value += AQ.Scoring.shoal(fish);

    // Depth is worth chasing while this dive still has a mark to reach.
    //
    // Weighted hard, and deliberately so. The solo game is lost outright by a
    // dive that stays shallow, whatever it scored on the way -- and a shallow
    // dive costs no air at all, so nothing else ever ends it either. Left to
    // pure point-chasing the bot spent all 24 turns paddling about above the
    // first line on one tank, scored respectably, and failed the expedition.
    const deepest = Math.max.apply(null, cells.map((i) => board.row(i)));
    const target = diveTarget(state);
    const here = currentDepth(state);
    if (here < target) value += Math.max(0, deepest - here) * 4;

    // Head towards something worth having.
    //
    // A purely greedy bot only ever sees what the next box would enclose, and
    // on this board that means it never reaches a flag or finishes a wreck: it
    // has no reason to move towards one until it is already adjacent. Sixty
    // games produced not a single flag, which left two whole scoring
    // categories -- and the "best flag per dive" rule with them -- completely
    // unexercised. A weak pull towards the nearest unclaimed prize is enough,
    // and it is roughly what a person does when they can see the sheet.
    const prize = nearestPrize(state, cells);
    if (prize) value += Math.max(0, 6 - prize.distance) * 0.6;

    const cost = AQ.State.costOf(state, cells, option);
    value -= cost.air * 1.2;
    return value;
  }

  const PRIZES = { flag: 1, wreck: 1, beacon: 1, squid: 1, outpost: 1, vent: 1, penguin: 1 };

  function nearestPrize(state, cells) {
    let best = null;
    for (const obj of board.objects) {
      if (!PRIZES[obj.symbol]) continue;
      if (obj.cells.every((c) => state.occupied.has(c))) continue;   // already taken
      for (const target of obj.cells) {
        const tc = board.col(target), tr = board.row(target);
        for (const i of cells) {
          const d = Math.abs(board.col(i) - tc) + Math.abs(board.row(i) - tr);
          if (!best || d < best.distance) best = { distance: d, object: obj };
        }
      }
    }
    return best;
  }

  const currentDepth = (state) => {
    const cells = state.diveCells[state.dive] || [];
    return cells.length ? Math.max.apply(null, cells.map((i) => board.row(i))) : 0;
  };

  // How deep this dive is trying to get. Aim for gold while there is time for
  // it, and drop back to merely passing when there is not.
  function diveTarget(state) {
    const marks = board.diveMarks;
    if (!marks.length) return board.rows;
    const left = state.turns - state.turn;
    const divesLeft = AQ.State.DIVES - state.dive;
    const turnsPerDive = left / Math.max(1, divesLeft);
    if (turnsPerDive >= 7) return marks[2] !== undefined ? marks[2] : marks[0];
    if (turnsPerDive >= 5) return marks[1] !== undefined ? marks[1] : marks[0];
    return marks[0];
  }

  function bestMove(state) {
    const choices = AQ.State.options(state);
    let best = null;
    for (const option of choices) {
      const legal = AQ.Shapes.legalRectangles(board, {
        size: option.size,
        occupied: state.occupied,
        lastShape: state.lastShape,
        previousDives: state.previousDives,
      });
      for (const cells of legal) {
        const value = greedy ? valueOf(state, cells, option) : state.rng();
        if (!best || value > best.value) best = { value, cells, option };
      }
    }
    return best;
  }

  // Ending a dive early costs the rest of the tank but hands the turn straight
  // to the next dive. It is the only way a cautious game ever gets its second
  // and third dives started, so the bot has to be willing to do it.
  function shouldSurface(state) {
    if (!state.diveCells[state.dive].length) return false;
    if (state.dive >= AQ.State.DIVES - 1) return false;
    const marks = board.diveMarks;
    // Never surface from a dive that has not yet done its job.
    if (marks.length && currentDepth(state) < marks[0]) return false;

    const left = state.turns - state.turn;
    const divesLeft = AQ.State.DIVES - state.dive - 1;    // still to come after this one
    // Each remaining dive needs roughly enough turns to get down to the first
    // mark, drawing a few squares at a time. Surface as soon as staying under
    // would eat into that budget -- a third dive that never happens fails the
    // expedition however good the first two were.
    const budget = marks[0] ? Math.ceil(marks[0] / 2) + 2 : 5;
    return left <= divesLeft * budget + 1;
  }

  function play(state) {
    let illegal = 0;
    let guard = 0;
    while (!state.over) {
      if (++guard > state.turns * 4) throw new Error("the game did not end");
      AQ.State.rollDice(state);
      if (greedy && shouldSurface(state)) { AQ.State.surface(state); continue; }
      const move = bestMove(state);
      if (!move) { AQ.State.pass(state); continue; }
      const result = AQ.State.place(state, move.cells, move.option);
      if (!result.ok) {
        // legalRectangles and reject must agree; if they ever do not, that is
        // the bug this bot exists to find.
        illegal++;
        AQ.State.pass(state);
      }
    }
    return { illegal };
  }

  return { play, bestMove, valueOf, diveTarget, shouldSurface };
}

// A small seeded generator, so a failing run can be reproduced from its seed.
function seededRng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

module.exports = { makeBot, seededRng };
