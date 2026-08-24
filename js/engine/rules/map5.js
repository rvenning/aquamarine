"use strict";
// Map 5 -- Ancient Waters. Map 1, with a mechanic that runs through the rock.
//
// The fossils are the reason this map exists, and they are not enclosed like
// everything else in the game. They sit INSIDE the stone, and you collect them
// by sighting between two squares you have already explored: draw an imaginary
// line, orthogonal or diagonal, from one enclosed square to another, and if it
// passes only through rock, every fossil on it is yours.
//
// Which turns the whole map inside out. Everywhere else a rock is an obstacle;
// here it is the thing you are looking through, and a pair of shapes on either
// side of a ridge is worth more than either alone.
//
// Eels are the other reversal: taking one in a single greedy box angers it and
// costs three points, while taking the same eel patiently across two boxes
// pays six.

window.AQ = window.AQ || {};
AQ.Rules = AQ.Rules || {};

AQ.Rules.map5 = (() => {
  const FOSSILS = ["fossil-ammonite", "fossil-urchin", "fossil-bone", "fossil-star", "fossil-jelly"];

  // Each track pays what its leftmost uncrossed circle shows, so the more of a
  // kind you find the more each is worth. Read off the sheet's fossil panel.
  const TRACK = [0, 1, 3, 6, 10, 15];

  function newProgress() {
    return { fossils: {}, flares: [], bonusFlare: false };
  }

  // Every square that can see out: enclosed, and next to rock.
  function sightingPoints(state, extraCells) {
    const board = state.board;
    const out = [];
    const enclosed = new Set(state.occupied);
    for (const i of extraCells || []) enclosed.add(i);
    for (const i of enclosed) {
      const c = board.col(i), r = board.row(i);
      for (const [dc, dr] of AQ.Shapes.AROUND) {
        const nc = c + dc, nr = r + dr;
        if (board.inBounds(nc, nr) && board.isBlocked(board.index(nc, nr))) { out.push(i); break; }
      }
    }
    return out;
  }

  // Which fossils a line between two squares passes through. The line must run
  // straight -- orthogonal or diagonal -- and every square between the two ends
  // must be rock, or you are looking through open water and seeing nothing.
  function fossilsOnLine(board, from, to) {
    const c0 = board.col(from), r0 = board.row(from);
    const c1 = board.col(to), r1 = board.row(to);
    const dc = Math.sign(c1 - c0), dr = Math.sign(r1 - r0);
    const steps = Math.max(Math.abs(c1 - c0), Math.abs(r1 - r0));
    if (steps < 2) return null;
    // Straight only: either one axis is fixed, or the two move together.
    if (dc !== 0 && dr !== 0 && Math.abs(c1 - c0) !== Math.abs(r1 - r0)) return null;
    if (dc === 0 && dr === 0) return null;

    const found = [];
    for (let s = 1; s < steps; s++) {
      const i = board.index(c0 + dc * s, r0 + dr * s);
      if (!board.isBlocked(i)) return null;                  // broke into water
      for (const obj of board.objectsAt(i))
        if (obj.symbol.startsWith("fossil")) found.push(obj);
    }
    return found.length ? found : null;
  }

  // Everything visible from the current dive, as a set of fossil objects.
  // Recomputed rather than accumulated: a new shape can complete a sighting
  // that an older one only half made, and there is no cheap way to know which.
  function collectFossils(state, extraCells) {
    const board = state.board;
    const eyes = sightingPoints(state, extraCells);
    const seen = new Map();
    for (let a = 0; a < eyes.length; a++)
      for (let b = a + 1; b < eyes.length; b++) {
        const line = fossilsOnLine(board, eyes[a], eyes[b]);
        if (!line) continue;
        for (const obj of line) seen.set(obj.id, obj);
      }
    return [...seen.values()];
  }

  function hooks(progress) {
    return {
      onPlace(state, record) {
        const board = state.board;
        // A flare may be dropped anywhere on the row or column just drawn, and
        // counts as a one-square shape for sighting. The engine drops it where
        // it opens the most rock, which is what the marker is for.
        for (const i of record.cells)
          for (const obj of board.objectsAt(i))
            if (obj.symbol === "flare" && !progress.flares.includes(obj.id)) {
              progress.flares.push(obj.id);
              const spot = bestFlare(state, record.cells);
              if (spot !== null) record.flare = spot;
            }
        const found = collectFossils(state, record.flare !== undefined ? [record.flare] : null);
        for (const obj of found) progress.fossils[obj.symbol] = (progress.fossils[obj.symbol] || 0) + 0;
        // Recount from scratch: `found` is every fossil visible so far.
        const tally = {};
        for (const obj of found) tally[obj.symbol] = (tally[obj.symbol] || 0) + 1;
        progress.fossils = tally;
        progress.bonusFlare = FOSSILS.every((f) => (tally[f] || 0) > 0);
      },
      isFreeAir: (obj) => obj.symbol === "bubbles",
    };
  }

  // Where a flare marker does the most good: the square on the shape's rows or
  // columns that opens the most new rock to sight along.
  function bestFlare(state, cells) {
    const board = state.board;
    const rows = new Set(cells.map(board.row));
    const cols = new Set(cells.map(board.col));
    let best = null;
    for (let i = 0; i < board.size; i++) {
      if (board.isBlocked(i) || state.occupied.has(i)) continue;
      if (!rows.has(board.row(i)) && !cols.has(board.col(i))) continue;
      let touching = 0;
      const c = board.col(i), r = board.row(i);
      for (const [dc, dr] of AQ.Shapes.AROUND) {
        const nc = c + dc, nr = r + dr;
        if (board.inBounds(nc, nr) && board.isBlocked(board.index(nc, nr))) touching++;
      }
      if (!best || touching > best.touching) best = { i, touching };
    }
    return best && best.touching ? best.i : null;
  }

  function score(state, chosenBonuses, progress) {
    const sc = AQ.Scoring;
    const board = state.board;
    const { shapes, caught, partial } = sc.collect(state);
    const lines = [];

    let shoalPoints = 0, fishTotal = 0;
    for (const shape of shapes) {
      const n = shape.objects.filter((e) => e.symbol === "fish").length;
      if (!n) continue;
      fishTotal += n;
      shoalPoints += sc.shoal(n);
    }
    lines.push(sc.line("fish", "Prehistoric fish", shoalPoints, fishTotal + " in shoals"));

    // An eel taken in one box is angry; taken across two or more it is placid.
    // Half an eel is angry too, which is why the partial list matters here.
    let placid = 0, angry = 0;
    for (const entry of caught) {
      if (entry.symbol !== "eel") continue;
      if (entry.inOneShape) angry++; else placid++;
    }
    angry += partial.filter((o) => o.symbol === "eel").length;
    lines.push(sc.line("eel", "Eels", placid * 6 - angry * 3,
      placid + " placid, " + angry + " angered"));

    // A nautilus is worth more taken on the move, across one of the air lines.
    let nautilus = 0, crossing = 0;
    for (const shape of shapes) {
      const rows = shape.cells.map(board.row);
      const spans = board.depthLines.some((line) =>
        Math.min.apply(null, rows) < line && Math.max.apply(null, rows) >= line);
      for (const entry of shape.objects) {
        if (entry.symbol !== "nautilus") continue;
        nautilus++;
        if (spans) crossing++;
      }
    }
    lines.push(sc.line("nautilus", "Nautilus", nautilus * 2 + crossing * 2,
      nautilus + " found" + (crossing ? ", " + crossing + " across an air line" : "")));

    const rayDay = caught.filter((e) => e.symbol === "stingray" && e.day).length;
    lines.push(sc.line("stingray", "Stingrays", 5 * rayDay, rayDay + " by day"));
    const cuttleNight = caught.filter((e) => e.symbol === "cuttlefish" && !e.day).length;
    lines.push(sc.line("cuttlefish", "Cuttlefish", 5 * cuttleNight, cuttleNight + " by night"));

    const beacons = sc.beaconPairs(caught);
    lines.push(sc.line("beacon", "Beacon pairs", 15 * beacons.pairs, beacons.pairs + " paired"));

    const flags = sc.flagScore(board, caught, 1);
    lines.push(sc.line("flag", "Flags", flags.total,
      flags.kept.length ? flags.kept.map((f) => f.value).join(" + ") : "none reached"));

    const p = progress || newProgress();
    let fossilPoints = 0;
    const kinds = [];
    for (const kind of FOSSILS) {
      const n = Math.min(p.fossils[kind] || 0, TRACK.length - 1);
      if (!n) continue;
      fossilPoints += TRACK[n];
      kinds.push(kind.replace("fossil-", "") + " ×" + n);
    }
    lines.push(sc.line("fossil", "Fossils", fossilPoints,
      kinds.length ? kinds.join(", ") : "none quarried"));

    const total = sc.total(lines);
    return {
      lines, total,
      rank: sc.rankFor(board, total),
      solo: AQ.State.soloResult(state),
      wrecksCompleted: 0,
      bonusesAvailable: [],
    };
  }

  return { id: "map5", score, hooks, newProgress, fossilsOnLine, collectFossils, FOSSILS, TRACK, WRECK_BONUSES: [] };
})();
