"use strict";
// Where a shape may be drawn.
//
// This is the heart of Aquamarine and the part a paper player has to police by
// hand: the box must be exactly the size the die says, it must be rectangular
// unless doubles were rolled, it must join the shape drawn LAST TURN, it may
// not overlap anything already explored or any rock -- and it may not so much
// as touch a corner of any shape from an EARLIER dive. That last rule is the
// one everybody forgets on paper, and the reason the digital version offers
// legal placements rather than asking the player to check.

window.AQ = window.AQ || {};

AQ.Shapes = (() => {
  const ORTHOGONAL = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const AROUND = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

  // The squares immediately around a set, by the given neighbourhood.
  function halo(board, cells, dirs) {
    const out = new Set();
    for (const i of cells) {
      const c = board.col(i), r = board.row(i);
      for (const [dc, dr] of dirs) {
        const nc = c + dc, nr = r + dr;
        if (board.inBounds(nc, nr)) out.add(board.index(nc, nr));
      }
    }
    return out;
  }

  // Every axis-aligned rectangle of exactly `size` squares, as [w, h] pairs.
  function rectangles(size) {
    const out = [];
    for (let w = 1; w <= size; w++) if (size % w === 0) out.push([w, size / w]);
    return out;
  }

  function isRectangle(board, cells) {
    const cs = cells.map((i) => board.col(i));
    const rs = cells.map((i) => board.row(i));
    const w = Math.max(...cs) - Math.min(...cs) + 1;
    const h = Math.max(...rs) - Math.min(...rs) + 1;
    return w * h === cells.length;
  }

  function isConnected(board, cells) {
    const set = new Set(cells);
    const seen = new Set([cells[0]]);
    const stack = [cells[0]];
    while (stack.length) {
      const i = stack.pop();
      const c = board.col(i), r = board.row(i);
      for (const [dc, dr] of ORTHOGONAL) {
        const nc = c + dc, nr = r + dr;
        if (!board.inBounds(nc, nr)) continue;
        const j = board.index(nc, nr);
        if (set.has(j) && !seen.has(j)) { seen.add(j); stack.push(j); }
      }
    }
    return seen.size === set.size;
  }

  // Why a shape cannot be drawn, or null if it can.
  //
  // Returning the reason rather than a boolean is what lets the interface say
  // "that would touch your first dive" instead of silently refusing to draw,
  // and it is what the tests assert on -- a placement rejected for the wrong
  // reason is a bug that a boolean would hide.
  function reject(board, cells, opts) {
    const { size, freeform = false, occupied, lastShape, previousDives } = opts;
    if (!cells.length) return "nothing drawn";
    if (cells.length !== size) return "that covers " + cells.length + " squares, not " + size;

    const set = new Set(cells);
    if (set.size !== cells.length) return "the same square counted twice";

    for (const i of cells) {
      if (i < 0 || i >= board.size) return "off the edge of the map";
      if (board.isBlocked(i)) return board.isIce(i) ? "through the ice" : "through the rock";
      if (occupied.has(i)) return "over water you have already explored";
    }

    if (!freeform && !isRectangle(board, cells)) return "not a rectangle";
    if (!isConnected(board, cells)) return "not in one piece";

    // The first shape of a dive drops from a boat; every later one continues
    // from the square drawn last turn, not from anywhere in the dive so far.
    if (!lastShape || !lastShape.length) {
      if (!cells.some((i) => board.isLaunch(i)))
        return "a dive has to start in one of the four squares under a boat";
    } else {
      const reach = halo(board, lastShape, ORTHOGONAL);
      if (!cells.some((i) => reach.has(i))) return "not joined to the shape you drew last turn";
    }

    // Earlier dives are kept clear by a whole square in every direction,
    // corners included -- you are not meant to see the same things twice.
    for (const i of cells) if (previousDives.has(i)) return "over an earlier dive";
    for (const i of halo(board, cells, AROUND))
      if (previousDives.has(i)) return "touching an earlier dive";

    return null;
  }

  // Every legal rectangle of a given size. The interface highlights these and
  // the bot chooses from them, so a player and a bot see exactly the same set
  // of moves and neither can make one the other could not.
  function legalRectangles(board, opts) {
    const out = [];
    for (const [w, h] of rectangles(opts.size))
      for (let r = 0; r + h <= board.rows; r++)
        for (let c = 0; c + w <= board.cols; c++) {
          const cells = [];
          for (let dr = 0; dr < h; dr++)
            for (let dc = 0; dc < w; dc++) cells.push(board.index(c + dc, r + dr));
          if (!reject(board, cells, Object.assign({}, opts, { freeform: false }))) out.push(cells);
        }
    return out;
  }

  return {
    reject, legalRectangles, rectangles,
    isRectangle, isConnected, halo,
    ORTHOGONAL, AROUND,
  };
})();
