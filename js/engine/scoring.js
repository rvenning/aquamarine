"use strict";
// What a finished game is worth.
//
// Scoring Aquamarine on paper is the tedious part -- seven categories, two of
// them counted per SHAPE rather than per game, one that depends on whether it
// was day or night when you drew the box, and one that only pays for pairs.
// This is the machinery all five maps share; each map's own categories live in
// rules/<map>.js.
//
// The distinction that matters throughout: a creature is caught by the SHAPE
// that encloses it, on the TURN that shape was drawn. Shoals and coral score
// per shape, so two fish caught in separate boxes are two ones rather than a
// three. Stingrays and cuttlefish score by the time of day of their turn. And
// anything covering more than one square is only caught once every one of its
// squares has been enclosed, possibly across several turns and several shapes.

window.AQ = window.AQ || {};

AQ.Scoring = (() => {
  // 1/3/6/10/15 for one to five fish in a single shape -- and Map 3 adds a
  // sixth step at 21, which is also what Map 3's outpost bonus reaches when it
  // scores a shoal as though it held one more fish.
  const SHOAL = [0, 1, 3, 6, 10, 15, 21, 28];
  const shoal = (n) => SHOAL[Math.min(n, SHOAL.length - 1)];

  // Walk the game and work out what was caught, by which shape, and when.
  //
  // Returns:
  //   shapes    one entry per turn a box was drawn: its cells, the day/night
  //             of that turn, and the objects it wholly enclosed by itself
  //   caught    every object fully enclosed by the end of the game, tagged with
  //             the turn it was COMPLETED and whether that turn was day
  //   partial   multi-square objects that were started and never finished --
  //             which matters, because an eel taken half-way scores against you
  function collect(state) {
    const board = state.board;
    const enclosed = new Set();
    const shapes = [];
    const caught = [];
    const seen = new Set();

    for (const record of state.history) {
      if (!record.cells.length) continue;
      for (const i of record.cells) enclosed.add(i);

      const inThisShape = new Set(record.cells);
      const here = [];
      const completed = [];
      const touchedNow = new Set();
      for (const i of record.cells)
        for (const obj of board.objectsAt(i)) touchedNow.add(obj);

      for (const obj of touchedNow) {
        if (seen.has(obj.id)) continue;
        if (!obj.cells.every((c) => enclosed.has(c))) continue;
        seen.add(obj.id);
        const wholly = obj.cells.every((c) => inThisShape.has(c));
        const entry = {
          object: obj, symbol: obj.symbol,
          turn: record.turn, dive: record.dive, day: record.day,
          inOneShape: wholly,
          shapeIndex: shapes.length,
        };
        caught.push(entry);
        completed.push(entry);
        if (wholly) here.push(entry);
      }

      shapes.push({
        index: shapes.length,
        turn: record.turn, dive: record.dive, day: record.day,
        cells: record.cells, option: record.option,
        // Only what this one box enclosed on its own -- the set the per-shape
        // categories (shoals, coral) are counted from.
        objects: here,
        completed,
      });
    }

    const partial = [];
    for (const obj of board.objects) {
      if (seen.has(obj.id)) continue;
      if (obj.cells.some((c) => enclosed.has(c))) partial.push(obj);
    }

    return { shapes, caught, partial, enclosed };
  }

  const countOf = (caught, symbol) => caught.filter((e) => e.symbol === symbol).length;

  // Beacons only ever pay for a matched pair -- one found by day and one by
  // night. Two found in daylight are worth nothing at all.
  function beaconPairs(caught) {
    const day = caught.filter((e) => e.symbol === "beacon" && e.day).length;
    const night = caught.filter((e) => e.symbol === "beacon" && !e.day).length;
    return { day, night, pairs: Math.min(day, night) };
  }

  // Flags pay their printed value, but only the best one from each dive --
  // reaching two deep flags on one dive wastes the shallower.
  function flagScore(board, caught, perDive) {
    const best = new Map();
    for (const e of caught) {
      if (e.symbol !== "flag") continue;
      const value = board.flagValue(e.object.cells[0]);
      const key = e.dive;
      const list = best.get(key) || [];
      list.push(value);
      best.set(key, list);
    }
    let total = 0;
    const kept = [];
    for (const [dive, values] of best) {
      values.sort((a, b) => b - a);
      const take = values.slice(0, perDive || 1);
      for (const v of take) { total += v; kept.push({ dive, value: v }); }
    }
    return { total, kept };
  }

  // A line in the score breakdown. Keeping the label and the count alongside
  // the points is what lets the end-of-game panel read like the printed sheet
  // rather than like a total someone has to take on trust.
  const line = (key, label, points, detail) => ({ key, label, points, detail });

  function total(lines) {
    return lines.reduce((sum, l) => sum + l.points, 0);
  }

  // The printed rank table starts at zero, but a game can finish below that --
  // jellyfish and sharks cost points and nothing stops a bad dive netting less
  // than nothing. A negative score is still the bottom rank, not no rank.
  function rankFor(board, score) {
    const ranks = board.structure.ranks || [];
    if (!ranks.length) return null;
    let name = ranks[0].name;
    for (const r of ranks) if (score >= r.from) name = r.name;
    return name;
  }

  // Which creatures are counting at this hour, and which are asleep.
  //
  // Four of the five sheets share one rule: stingrays are day creatures and
  // cuttlefish are night ones, and catching one at the wrong hour is not a
  // penalty, just a waste. The Trench states it differently -- its glass squid
  // migrate rather than sleep -- so each map answers for itself and this is the
  // shape they all answer in.
  //
  //   chips    what to show under the wheel: the creature, and whether it counts
  //   dormant  ids of the objects on the board that would score nothing now
  //
  // Both come from one call because they are one fact told twice, and the way
  // that goes wrong is the two disagreeing: the board dimming a stingray while
  // the chip beside the wheel says stingrays are counting.
  function dayNight(board, isDay, dayFolk, nightFolk) {
    const day = dayFolk || "stingray";
    const night = nightFolk || "cuttlefish";
    const dormant = new Set();
    for (const obj of board.objects) {
      if (obj.symbol === day && !isDay) dormant.add(obj.id);
      if (obj.symbol === night && isDay) dormant.add(obj.id);
    }
    return {
      chips: [
        { symbol: day, active: isDay },
        { symbol: night, active: !isDay },
      ],
      dormant,
    };
  }

  return { SHOAL, shoal, collect, countOf, beaconPairs, flagScore, line, total, rankFor, dayNight };
})();
