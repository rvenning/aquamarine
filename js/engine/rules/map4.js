"use strict";
// Map 4 -- The Polar Shelf. Map 1, in water that fights back.
//
// Ice behaves like rock and then charges you for standing next to it, which
// turns the whole map into a question of clearance: the shortest route down is
// through the floes, and it costs a breath a turn to take it.
//
// Against that, a camera track that pays out per dive rather than at the end,
// so photographs taken early are worth more than photographs taken late -- and
// three permanent powers, unlocked along that track, which are the only thing
// in the game that changes the rules in your favour.

window.AQ = window.AQ || {};
AQ.Rules = AQ.Rules || {};

AQ.Rules.map4 = (() => {
  // The photo track as printed: sixteen spaces worth a point each, with a
  // power unlocked at the three marked ones.
  const PHOTO_SPACES = 16;
  const POWER_AT = [1, 4, 8];

  const POWERS = [
    { id: "lowest", label: "+1 to the lower die" },
    { id: "ice", label: "+1 to any die when the shape touches ice" },
    { id: "extra", label: "one more shape after a tank empties" },
  ];

  function newProgress() {
    return { photos: 0, powers: [], perDive: [0, 0, 0] };
  }

  function hooks(progress) {
    return {
      // Ice costs a breath for being beside it, once per turn however much of
      // it the shape touches.
      extraAir(state, cells) {
        const board = state.board;
        const beside = cells.some((i) => {
          const c = board.col(i), r = board.row(i);
          for (const [dc, dr] of AQ.Shapes.ORTHOGONAL) {
            const nc = c + dc, nr = r + dr;
            if (board.inBounds(nc, nr) && board.isIce(board.index(nc, nr))) return true;
          }
          return false;
        });
        return beside ? { air: 1, why: "drawing alongside the ice" } : null;
      },

      // The powers that change the dice. Both add one to a value without
      // changing what it costs, because the air is charged on the roll and not
      // on what you drew with it.
      diceExtras(state) {
        const out = [];
        if (progress.powers.includes("lowest"))
          out.push((lo, hi) => ({
            id: "lowest+1", label: "Take the " + lo + " as " + (lo + 1),
            size: lo + 1, air: 0, freeform: false, note: "polar power",
          }));
        if (progress.powers.includes("ice"))
          out.push((lo, hi) => ({
            id: "ice+1", label: "Take the " + hi + " as " + (hi + 1),
            size: hi + 1, air: hi - lo, freeform: false, note: "only alongside ice",
            requiresIce: true,
          }));
        return out;
      },

      canPlace(state, cells) {
        return null;
      },

      onPlace(state, record) {
        const board = state.board;
        for (const i of record.cells)
          for (const obj of board.objectsAt(i))
            if (obj.symbol === "camera" && obj.cells.every((c) => state.occupied.has(c))) {
              if (progress.photos >= PHOTO_SPACES) continue;
              progress.photos++;
              const at = progress.photos - 1;
              if (POWER_AT.includes(at)) {
                const next = POWERS.find((p) => !progress.powers.includes(p.id));
                if (next) progress.powers.push(next.id);
              }
            }
        // The photo track pays after EACH dive, so a picture taken on the first
        // dive is counted three times over and one taken on the last only once.
        progress.perDive[record.dive] = progress.photos;
      },

      isFreeAir: (obj) => obj.symbol === "bubbles",
    };
  }

  function score(state, chosenBonuses, progress) {
    const sc = AQ.Scoring;
    const board = state.board;
    const { shapes, caught } = sc.collect(state);
    const lines = [];

    let shoalPoints = 0, fishTotal = 0;
    for (const shape of shapes) {
      const n = shape.objects.filter((e) => e.symbol === "fish").length;
      if (!n) continue;
      fishTotal += n;
      shoalPoints += sc.shoal(n);
    }
    lines.push(sc.line("fish", "Bluenose fish", shoalPoints, fishTotal + " in shoals"));

    // A penguin only counts if the whole thing was taken in ONE shape, and
    // only if no air bubble came with it.
    let penguins = 0, spoiled = 0;
    for (const shape of shapes)
      for (const entry of shape.objects) {
        if (entry.symbol !== "penguin") continue;
        const withBubble = shape.cells.some((i) =>
          board.objectsAt(i).some((o) => o.symbol === "bubbles"));
        if (withBubble) spoiled++; else penguins++;
      }
    lines.push(sc.line("penguin", "Penguins", 7 * penguins,
      penguins + " caught cleanly" + (spoiled ? ", " + spoiled + " lost to bubbles" : "")));

    // Krill pay for the company they keep: 2 for every other icon in the same
    // shape, and only one krill in a shape ever scores.
    let krillPoints = 0, krillShapes = 0;
    for (const shape of shapes) {
      const hasKrill = shape.objects.some((e) => e.symbol === "krill");
      if (!hasKrill) continue;
      krillShapes++;
      const others = shape.objects.filter((e) => e.symbol !== "krill").length;
      krillPoints += others * 2;
    }
    lines.push(sc.line("krill", "Krill", krillPoints,
      krillShapes + " shoal" + (krillShapes === 1 ? "" : "s") + " of krill"));

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
    const photoPoints = p.perDive.reduce((a, b) => a + b, 0);
    lines.push(sc.line("camera", "Photographs", photoPoints,
      p.photos + " on the track, totalled after each dive" +
      (p.powers.length ? " · " + p.powers.length + " power" + (p.powers.length === 1 ? "" : "s") : "")));

    const total = sc.total(lines);
    return {
      lines, total,
      rank: sc.rankFor(board, total),
      solo: AQ.State.soloResult(state),
      wrecksCompleted: 0,
      bonusesAvailable: [],
    };
  }

  // Stingrays by day, cuttlefish by night -- the board dims whichever is asleep
  // and the chips under the wheel say which.
  const hours = (board, isDay) => AQ.Scoring.dayNight(board, isDay);

  return { id: "map4", score, hooks, newProgress, POWERS, PHOTO_SPACES, WRECK_BONUSES: [], hours };
})();
