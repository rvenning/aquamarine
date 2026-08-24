"use strict";
// Map 2 -- Apex Predators. Map 1, plus a reason to be somewhere dangerous.
//
// Three additions, and they pull against each other, which is the point:
//
//   * Dark caves can only be entered in daylight, or by burning one of three
//     torches. At night, with no torch left, a whole region of the map simply
//     shuts.
//   * Research icons fill four tracks. Filling a space pays a point, finishing
//     a track pays 3, 5 or 7 more, and several spaces hand back a breath, a
//     torch, or an extra free move.
//   * The research icons are printed on the colossal squid and beside the
//     sharks -- so the tracks are filled by going where the things that cost
//     you points live. Twelve of the twenty icons are on squid.

window.AQ = window.AQ || {};
AQ.Rules = AQ.Rules || {};

AQ.Rules.map2 = (() => {
  const base = () => AQ.Rules.map1;

  // The four tracks as printed, read off the sheet's RESEARCH BONUS panel.
  // `spaces` is what each space GIVES as it is crossed off; `bonus` is paid for
  // finishing the track. Twenty-one spaces against twenty icons on the board,
  // so no game fills them all -- which is what makes choosing a track a choice.
  const TRACKS = [
    { id: 0, spaces: ["air", null, null], bonus: 3 },
    { id: 1, spaces: ["move3", null, "air", null, "move3", null, null], bonus: 7 },
    { id: 2, spaces: [null, null, "move5", null, null], bonus: 5 },
    { id: 3, spaces: [null, "air", "torch", null, null], bonus: 5 },
    { id: 4, spaces: [null], bonus: 1 },
  ];

  const TORCHES = 3;

  function newProgress() {
    return { tracks: TRACKS.map(() => 0), torches: TORCHES, torchMax: TORCHES + 1, pendingMoves: [] };
  }

  // The rules hooks the engine calls. Everything Map 2 adds to a TURN lives
  // here; everything it adds to the SCORE lives in score() below.
  function hooks(progress) {
    return {
      // A shape may not enter a cave at night unless a torch is spent, and the
      // torch is spent once for the whole shape however many cave squares it
      // covers.
      canPlace(state, cells) {
        const dark = !AQ.State.isDay(state) && cells.some((i) => state.board.isCave(i));
        if (dark && progress.torches <= 0) return "no torch left, and that cave is pitch black at night";
        return null;
      },
      onPlace(state, record) {
        const board = state.board;
        if (!AQ.State.isDay(state) && record.cells.some((i) => board.isCave(i))) {
          progress.torches--;
          record.torch = true;
        }
        // Every research icon enclosed crosses off one space. The rules let you
        // spread them across tracks; the engine fills the furthest-advanced
        // unfinished track first, which is what a player chasing a completion
        // bonus does.
        let icons = 0;
        for (const i of record.cells)
          for (const obj of board.objectsAt(i))
            if (obj.symbol === "research" && obj.cells.every((c) => state.occupied.has(c))) icons++;
        for (let n = 0; n < icons; n++) cross(progress, record);
      },
      isFreeAir: (obj) => obj.symbol === "bubbles",
    };
  }

  function cross(progress, record) {
    let pick = -1;
    for (let t = 0; t < TRACKS.length; t++) {
      if (progress.tracks[t] >= TRACKS[t].spaces.length) continue;
      if (pick < 0 || progress.tracks[t] > progress.tracks[pick]) pick = t;
    }
    if (pick < 0) return;
    const gift = TRACKS[pick].spaces[progress.tracks[pick]];
    progress.tracks[pick]++;
    if (!gift) return;
    if (gift === "torch") progress.torches = Math.min(progress.torches + 1, TORCHES + 1);
    if (gift === "air" && record) record.air = 0;
    if (gift.startsWith("move")) progress.pendingMoves.push(+gift.slice(4));
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
    lines.push(sc.line("fish", "Banner fish", shoalPoints, fishTotal + " in shoals"));

    const rayDay = caught.filter((e) => e.symbol === "stingray" && e.day).length;
    lines.push(sc.line("stingray", "Stingrays", 5 * rayDay, rayDay + " by day"));
    const cuttleNight = caught.filter((e) => e.symbol === "cuttlefish" && !e.day).length;
    lines.push(sc.line("cuttlefish", "Cuttlefish", 5 * cuttleNight, cuttleNight + " by night"));

    const sharks = sc.countOf(caught, "shark");
    lines.push(sc.line("shark", "Sharks", -3 * sharks, sharks + " disturbed"));

    const squid = sc.countOf(caught, "squid");
    lines.push(sc.line("squid", "Colossal squid", 10 * squid, squid + " of 3 fully explored"));

    const beacons = sc.beaconPairs(caught);
    lines.push(sc.line("beacon", "Beacon pairs", 15 * beacons.pairs, beacons.pairs + " paired"));

    const flags = sc.flagScore(board, caught, 1);
    lines.push(sc.line("flag", "Flags", flags.total,
      flags.kept.length ? flags.kept.map((f) => f.value).join(" + ") : "none reached"));

    // A point a space, plus the completion bonus on any track finished.
    const p = progress || newProgress();
    let researchPoints = 0, filled = 0, done = 0;
    TRACKS.forEach((track, t) => {
      const n = p.tracks[t] || 0;
      filled += n;
      researchPoints += n;
      if (n >= track.spaces.length) { researchPoints += track.bonus; done++; }
    });
    lines.push(sc.line("research", "Research", researchPoints,
      filled + " spaces" + (done ? ", " + done + " track" + (done === 1 ? "" : "s") + " completed" : "")));

    const total = sc.total(lines);
    return {
      lines, total,
      rank: sc.rankFor(board, total),
      solo: AQ.State.soloResult(state),
      wrecksCompleted: 0,
      bonusesAvailable: [],
    };
  }

  return { id: "map2", score, hooks, newProgress, TRACKS, TORCHES, WRECK_BONUSES: [] };
})();
