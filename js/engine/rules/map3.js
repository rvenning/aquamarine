"use strict";
// Map 3 -- 1000 Fathoms Deep. The one that changes the shape of a turn.
//
// Air becomes a submersible's energy budget, and three things spend or save it
// in ways no other map does:
//
//   * A third dice option. Instead of the low die or the high one, you may
//     take the SUM of both and pay the higher. It is the only way to draw a
//     nine, and it is ruinous if you cannot afford it.
//   * Power cables running down the upper map act as bubbles -- touch one and
//     the whole turn is free.
//   * Hydrothermal vents cost a point of energy for every square of steam you
//     cross, and pay 1, 4, 9, 16, 25, 36, 49 for one to seven of them found.
//     There are exactly seven on the sheet.
//
// And a second board. The Trench below is reached only through a tunnel, and
// once through it you may continue from any square along its top row -- which
// is the game handing you a fresh start halfway down, at the price of the turn
// that got you there.

window.AQ = window.AQ || {};
AQ.Rules = AQ.Rules || {};

AQ.Rules.map3 = (() => {
  // Twelve outpost bonuses in six pairs. Take one from a row and the other is
  // struck out, so six outposts buy six bonuses and never both halves of one
  // choice. The left column scores at the end; the right changes how you play.
  const BONUS_PAIRS = [
    [{ id: "flags5", label: "5 per flag reached", kind: "score", per: 5, symbol: "flag" },
     { id: "trenchstart", label: "Begin later dives in the Trench", kind: "power" }],
    [{ id: "squid5", label: "5 per glass squid", kind: "score", per: 5, symbol: "glass-squid" },
     { id: "outpost4", label: "Outposts need only 4 squares", kind: "power" }],
    [{ id: "outpost5", label: "5 per outpost explored", kind: "score", per: 5, symbol: "outpost" },
     { id: "shallow", label: "One less energy for depth", kind: "power" }],
    [{ id: "angler5", label: "5 per angler fish", kind: "score", per: 5, symbol: "angler" },
     { id: "novent", label: "Vents and steam cost nothing", kind: "power" }],
    [{ id: "vent5", label: "5 per vent reached", kind: "score", per: 5, symbol: "vent" },
     { id: "high1", label: "+1 to the higher die", kind: "power" }],
    [{ id: "shoal1", label: "Every shoal counts one extra fish", kind: "score" },
     { id: "lowfree", label: "The lower die may draw any shape", kind: "power" }],
  ];

  const VENTS = [0, 1, 4, 9, 16, 25, 36, 49];

  function newProgress() {
    return { bonuses: [], struck: [], tunnelled: false, trenchOpen: false };
  }

  const has = (progress, id) => progress.bonuses.includes(id);

  // The Trench begins where the sheet's two halves are joined. The divider is
  // terrain rather than content, so it is found rather than hard-coded.
  function trenchTop(board) {
    for (let r = 1; r < board.rows; r++) {
      let solid = 0;
      for (let c = 0; c < board.cols; c++) if (board.isBlocked(board.index(c, r))) solid++;
      if (solid > board.cols * 0.8) return r + 1;
    }
    return Math.floor(board.rows / 2);
  }

  function hooks(progress, board) {
    const top = trenchTop(board);
    return {
      diceExtras(state) {
        const out = [AQ.Dice.sumOption];
        if (has(progress, "high1"))
          out.push((lo, hi) => ({
            id: "high+1", label: "Take the " + hi + " as " + (hi + 1),
            size: hi + 1, air: hi - lo, freeform: false, note: "outpost bonus",
          }));
        if (has(progress, "lowfree"))
          out.push((lo) => ({
            id: "lowfree", label: "Take the " + lo + ", any shape",
            size: lo, air: 0, freeform: true, note: "outpost bonus",
          }));
        return out;
      },

      // Steam is charged by the square, and the depth of the Trench by the
      // band you finish in -- unless an outpost bonus has switched either off.
      extraAir(state, cells) {
        let air = 0;
        const why = [];
        if (!has(progress, "novent")) {
          let steam = 0;
          for (const i of cells)
            for (const obj of board.objectsAt(i))
              if (obj.symbol === "steam" || obj.symbol === "vent") steam++;
          if (steam) { air += steam; why.push(steam + " squares of steam"); }
        }
        if (has(progress, "shallow") && air > 0) air -= 1;
        return air > 0 ? { air, why: why.join(" and ") } : null;
      },

      // A dive may start in the Trench once a tunnel has been taken, and from
      // then on permanently if the outpost bonus for it was chosen.
      canStartAt(state, cells) {
        if (!progress.tunnelled && !has(progress, "trenchstart")) return null;
        return cells.every((i) => board.row(i) === top) ? "ok" : null;
      },

      onPlace(state, record) {
        for (const i of record.cells)
          for (const obj of board.objectsAt(i)) {
            if (obj.symbol === "tunnel") progress.tunnelled = true;
            if (obj.symbol === "outpost") {
              const need = has(progress, "outpost4") ? 4 : obj.cells.length;
              const done = obj.cells.filter((c) => state.occupied.has(c)).length;
              if (done >= need && !obj.claimed) { obj.claimed = true; record.outpost = true; }
            }
          }
      },

      // Power cables do what bubbles do everywhere else.
      isFreeAir: (obj) => obj.symbol === "bubbles" || obj.symbol === "cable",
    };
  }

  function score(state, chosenBonuses, progress) {
    const sc = AQ.Scoring;
    const board = state.board;
    const { shapes, caught } = sc.collect(state);
    const p = progress || newProgress();
    const lines = [];
    const top = trenchTop(board);

    const extraFish = has(p, "shoal1") ? 1 : 0;
    let shoalPoints = 0, fishTotal = 0;
    for (const shape of shapes) {
      const n = shape.objects.filter((e) => e.symbol === "fish").length;
      if (!n) continue;
      fishTotal += n;
      shoalPoints += sc.shoal(n + extraFish);
    }
    lines.push(sc.line("fish", "Surgeonfish", shoalPoints,
      fishTotal + " in shoals" + (extraFish ? ", each counted one larger" : "")));

    // Glass squid migrate: by day they are in the upper map, by night in the
    // Trench. Caught in the wrong half at the wrong hour they score nothing.
    let squid = 0, missed = 0;
    for (const entry of caught) {
      if (entry.symbol !== "glass-squid") continue;
      const inTrench = board.row(entry.object.cells[0]) >= top;
      if (entry.day === !inTrench) squid++; else missed++;
    }
    lines.push(sc.line("glass-squid", "Glass squid", 5 * squid,
      squid + " in the right water" + (missed ? ", " + missed + " at the wrong hour" : "")));

    const jellies = sc.countOf(caught, "jellyfish");
    lines.push(sc.line("jellyfish", "Jellyfish", -2 * jellies, jellies + " stung"));

    // An angler fish pays for the prey caught in the same box as it.
    let preyPoints = 0, anglers = 0;
    for (const shape of shapes) {
      const a = shape.objects.filter((e) => e.symbol === "angler").length;
      if (!a) continue;
      anglers += a;
      const prey = shape.objects.filter((e) => e.symbol === "prey").length;
      preyPoints += prey * 2 * a;
    }
    lines.push(sc.line("angler", "Angler fish", preyPoints, anglers + " fed"));

    const vents = Math.min(sc.countOf(caught, "vent"), VENTS.length - 1);
    lines.push(sc.line("vent", "Hydrothermal vents", VENTS[vents], vents + " of 7 reached"));

    // Two flags a dive here, one in each half.
    const flags = sc.flagScore(board, caught, 2);
    lines.push(sc.line("flag", "Flags", flags.total,
      flags.kept.length ? flags.kept.map((f) => f.value).join(" + ") + ", two per dive" : "none reached"));

    // Whatever the chosen end-of-game bonuses are worth.
    let bonusPoints = 0;
    const detail = [];
    for (const id of p.bonuses) {
      const bonus = BONUS_PAIRS.flat().find((b) => b.id === id);
      if (!bonus || bonus.kind !== "score" || !bonus.symbol) continue;
      const n = bonus.symbol === "flag" ? flags.kept.length : sc.countOf(caught, bonus.symbol);
      bonusPoints += n * bonus.per;
      detail.push(bonus.label + " ×" + n);
    }
    lines.push(sc.line("outpost", "Station bonuses", bonusPoints,
      p.bonuses.length ? detail.join("; ") || p.bonuses.length + " chosen" : "none claimed"));

    const total = sc.total(lines);
    return {
      lines, total,
      rank: sc.rankFor(board, total),
      solo: AQ.State.soloResult(state),
      wrecksCompleted: 0,
      bonusesAvailable: [],
    };
  }

  return { id: "map3", score, hooks, newProgress, trenchTop, BONUS_PAIRS, VENTS, WRECK_BONUSES: [] };
})();
