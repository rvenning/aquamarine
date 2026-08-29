"use strict";
// Map 1 -- Exploratory Expedition. The base game.
//
// Every later map is written as "Map 1, plus", so this module carries the
// rules the others inherit and only override: the dice choice, air, the three
// dives, and the seven scoring categories printed down the sheet.
//
// The two that catch people out on paper are both here. Coral pays 2 a piece
// but ONLY if a single colour is in the box -- catch both and the whole lot is
// crossed out, so a greedy box can be worth less than a careful one. And
// stingrays only count in daylight while cuttlefish only count at night, which
// is why where you join the turn wheel matters.

window.AQ = window.AQ || {};
AQ.Rules = AQ.Rules || {};

AQ.Rules.map1 = (() => {
  const S = () => AQ.Scoring;

  // The six bonuses printed along the bottom of the sheet. Completing a wreck
  // lets you circle one, and each may only be circled once -- so four wrecks
  // means four of these six, chosen as the game goes.
  const WRECK_BONUSES = [
    { id: "coral", label: "1 per coral", per: 1, symbol: "coral" },
    { id: "cuttlefish", label: "5 per cuttlefish", per: 5, symbol: "cuttlefish" },
    { id: "flag", label: "5 per flag scored", per: 5, symbol: "flag" },
    { id: "wreck", label: "5 per wreck explored", per: 5, symbol: "wreck" },
    { id: "beacon", label: "8 per beacon pair", per: 8, symbol: "beacon-pair" },
    { id: "stingray", label: "5 per stingray", per: 5, symbol: "stingray" },
  ];

  const CORALS = ["coral-purple", "coral-orange"];

  function score(state, chosenBonuses) {
    const board = state.board;
    const sc = S();
    const { shapes, caught } = sc.collect(state);
    const lines = [];

    // Shoals: counted per shape, so the same five fish are worth 15 in one box
    // and 5 in five boxes.
    let shoalPoints = 0, fishTotal = 0;
    const shoalSizes = [];
    for (const shape of shapes) {
      const n = shape.objects.filter((e) => e.symbol === "fish").length;
      if (!n) continue;
      fishTotal += n;
      shoalSizes.push(n);
      shoalPoints += sc.shoal(n);
    }
    lines.push(sc.line("fish", "Butterfly fish", shoalPoints,
      fishTotal + " fish in shoals of " + (shoalSizes.sort((a, b) => b - a).join(", ") || "none")));

    // Coral: 2 each, and nothing at all from a box holding both colours.
    let coralPoints = 0, coralKept = 0, coralLost = 0;
    for (const shape of shapes) {
      const byColour = CORALS.map((c) => shape.objects.filter((e) => e.symbol === c).length);
      const present = byColour.filter((n) => n > 0).length;
      const n = byColour.reduce((a, b) => a + b, 0);
      if (!n) continue;
      if (present > 1) { coralLost += n; continue; }
      coralKept += n;
      coralPoints += n * 2;
    }
    lines.push(sc.line("coral", "Coral", coralPoints,
      coralKept + " kept" + (coralLost ? ", " + coralLost + " crossed out for mixing colours" : "")));

    const jellies = sc.countOf(caught, "jellyfish");
    lines.push(sc.line("jellyfish", "Jellyfish", -2 * jellies, jellies + " stung"));

    // Stingrays are day creatures and cuttlefish are night ones. Catching one
    // at the wrong time is not a penalty, just a waste.
    const rayDay = caught.filter((e) => e.symbol === "stingray" && e.day).length;
    const rayNight = caught.filter((e) => e.symbol === "stingray" && !e.day).length;
    lines.push(sc.line("stingray", "Stingrays", 5 * rayDay,
      rayDay + " by day" + (rayNight ? ", " + rayNight + " missed at night" : "")));

    const cuttleNight = caught.filter((e) => e.symbol === "cuttlefish" && !e.day).length;
    const cuttleDay = caught.filter((e) => e.symbol === "cuttlefish" && e.day).length;
    lines.push(sc.line("cuttlefish", "Cuttlefish", 5 * cuttleNight,
      cuttleNight + " by night" + (cuttleDay ? ", " + cuttleDay + " missed in daylight" : "")));

    const beacons = sc.beaconPairs(caught);
    lines.push(sc.line("beacon", "Beacon pairs", 15 * beacons.pairs,
      beacons.pairs + " paired (" + beacons.day + " by day, " + beacons.night + " by night)"));

    const flags = sc.flagScore(board, caught, 1);
    lines.push(sc.line("flag", "Flags", flags.total,
      flags.kept.length ? flags.kept.map((f) => f.value).join(" + ") + ", best one per dive" : "none reached"));

    const wrecks = sc.countOf(caught, "wreck");
    const bonuses = (chosenBonuses || []).slice(0, wrecks);
    let bonusPoints = 0;
    const bonusDetail = [];
    for (const id of bonuses) {
      const bonus = WRECK_BONUSES.find((b) => b.id === id);
      if (!bonus) continue;
      const n = bonus.symbol === "beacon-pair" ? beacons.pairs
        : bonus.symbol === "flag" ? flags.kept.length
        : bonus.symbol === "coral" ? coralKept
        : sc.countOf(caught, bonus.symbol);
      bonusPoints += n * bonus.per;
      bonusDetail.push(bonus.label + " x" + n);
    }
    lines.push(sc.line("wreck", "Shipwreck bonuses", bonusPoints,
      wrecks + " wreck" + (wrecks === 1 ? "" : "s") + " explored" +
      (bonusDetail.length ? ": " + bonusDetail.join("; ") : "")));

    const totalScore = sc.total(lines);
    return {
      lines,
      total: totalScore,
      rank: sc.rankFor(board, totalScore),
      solo: AQ.State.soloResult(state),
      wrecksCompleted: wrecks,
      bonusesAvailable: WRECK_BONUSES,
    };
  }

  // Stingrays by day, cuttlefish by night -- the board dims whichever is asleep
  // and the chips under the wheel say which.
  const hours = (board, isDay) => AQ.Scoring.dayNight(board, isDay);

  return { id: "map1", score, WRECK_BONUSES, CORALS, hours };
})();
