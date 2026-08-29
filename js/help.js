"use strict";
// What each map asks of you, and what it pays.
//
// Every sheet in this box prints its own scoring panel down the side, because
// no two of them score the same way -- Ancient Waters pays for fossils you
// never enclose, the Polar Shelf pays a photo track once per dive, the Trench
// squares its vents. A player halfway down a map they have not dived before
// needs that panel, and on paper they have it in front of them.
//
// So the help is per map: the base rules everyone needs, then what THIS sheet
// does differently, then its scoring table. Written from the English rules
// PDFs rather than paraphrased from the code, so the two can be compared.

window.AQ = window.AQ || {};

AQ.Help = (() => {
  const BASE = [
    ["Each turn", "Two dice are rolled. Take <b>one</b> of them and draw a box enclosing exactly that many squares. Taking the higher die costs air equal to the difference between them."],
    ["Doubles", "Draw a shape <b>two squares bigger</b> than the number rolled, pay no air for the dice, and — only on doubles — draw any shape you like instead of a rectangle."],
    ["Where you may draw", "The first box of a dive must cover one of the four squares under a boat. Every box after that must touch the box you drew <b>last turn</b>. Nothing may overlap rock, or an earlier box — and it may not so much as touch a corner of an <b>earlier dive</b>."],
    ["Air", "Below the −1 AIR line every turn costs one extra breath; below −2 AIR it costs two. Enclose an air bubble and the whole turn is free, whatever else you owe."],
    ["Dives", "Three dives, one tank each. A dive ends when its tank empties, or you can surface early — which costs the rest of the tank but starts the next dive straight away."],
    ["Day and night", "The wheel is half daylight and half dark, and a die at setup decides where you join it. Some creatures only count at the right hour."],
  ];

  const SOLO = "Every one of your three dives must reach below the first mark on the right or the expedition has failed, whatever you scored. Reach the second or third mark on all three for silver and gold.";

  const RANKS = "Flounderer 0–40 · Beginner 41–70 · Day tripper 71–90 · Master 91–110 · Instructor 111+";

  const MAPS = {
    map1: {
      name: "Exploratory Expedition",
      adds: [],
      scoring: [
        ["Butterfly fish", "1 / 3 / 6 / 10 / 15 for a shoal of 1 to 5 <b>in one box</b>"],
        ["Coral", "2 each — but only if a box holds a <b>single colour</b>. Catch both and every coral in that box is crossed out."],
        ["Jellyfish", "−2 each"],
        ["Stingrays", "5 each, <b>daylight only</b>"],
        ["Cuttlefish", "5 each, <b>night only</b>"],
        ["Beacons", "15 a pair — one found by day, one by night"],
        ["Flags", "the printed value, best <b>one per dive</b>"],
        ["Shipwrecks", "explore every square of one and circle a bonus, scored at the end"],
      ],
    },
    map2: {
      name: "Apex Predators",
      adds: [
        ["Dark caves", "A box covering a shaded cave square needs daylight, or one of your <b>three torches</b>. At night with no torch left, the caves are shut."],
        ["Research", "Every research icon you enclose crosses off a space on a track. Some spaces hand back a breath, a torch, or a free extra move."],
      ],
      scoring: [
        ["Banner fish", "1 / 3 / 6 / 10 / 15 for a shoal of 1 to 5 in one box"],
        ["Colossal squid", "10 each, and only when <b>every</b> square of it is enclosed (they are 7, 8 and 11 squares)"],
        ["Sharks", "−3 each"],
        ["Stingrays", "5 each, daylight only"],
        ["Cuttlefish", "5 each, night only"],
        ["Beacons", "15 a pair, one by day and one by night"],
        ["Flags", "the printed value, best one per dive"],
        ["Research", "1 a space, plus 3, 5 or 7 for finishing a track"],
      ],
    },
    map3: {
      name: "1000 Fathoms Deep",
      adds: [
        ["A submersible", "Air is energy. Alongside the low and high die you may take the <b>sum of both</b> and pay the higher one — the only way to draw a nine."],
        ["Power cables", "Touch one and the turn is free, exactly like an air bubble."],
        ["The Trench", "You cannot reach the lower map directly. Enclose a tunnel, and from the next turn you may carry on from any square along the Trench's top row."],
        ["Vents", "Steam costs a point of energy for every square of it you cross — and vents are worth more the more of them you find."],
        ["Outposts", "Enclose all eight squares of a research outpost and claim one of a pair of bonuses; the other is struck out for the rest of the game."],
      ],
      scoring: [
        ["Glass squid", "5 each — in the <b>upper map by day</b>, in the <b>Trench by night</b>. Wrong half, wrong hour, nothing."],
        ["Jellyfish", "−2 each"],
        ["Surgeonfish", "1 / 3 / 6 / 10 / 15 / 21 for a shoal of 1 to 6 in one box"],
        ["Angler fish", "2 for every prey caught in the same box as one"],
        ["Vents", "1 / 4 / 9 / 16 / 25 / 36 / 49 for 1 to 7 of the seven on the sheet"],
        ["Flags", "the printed value — <b>two per dive</b> here, one in each half"],
        ["Outposts", "whatever the bonuses you claimed are worth"],
      ],
      note: "This sheet prints no dive marks — its right margin carries the scoring panels instead — so a Trench expedition is judged on score alone.",
    },
    map4: {
      name: "The Polar Shelf",
      adds: [
        ["Ice", "Ice blocks a box exactly as rock does, and costs <b>one extra air</b> whenever the box you draw is orthogonally beside any of it."],
        ["Photographs", "Every camera enclosed fills the next space on the photo track. The track is totalled <b>after each dive</b>, so a picture taken early counts three times over."],
        ["Powers", "Three spaces on that track unlock a permanent power: +1 to the lower die, +1 to any die beside ice, or one more shape after a tank empties."],
      ],
      scoring: [
        ["Bluenose fish", "1 / 3 / 6 / 10 / 15 for a shoal of 1 to 5 in one box"],
        ["Penguins", "7 each — both squares in <b>one box</b>, and no air bubble in it"],
        ["Krill", "2 for every other icon caught in the same box. Only one krill in a box scores."],
        ["Stingrays", "5 each, daylight only"],
        ["Cuttlefish", "5 each, night only"],
        ["Beacons", "15 a pair, one by day and one by night"],
        ["Flags", "the printed value, best one per dive"],
        ["Photographs", "the track total, added up after every dive"],
      ],
    },
    map5: {
      name: "Ancient Waters",
      adds: [
        ["Fossils", "Fossils are <b>inside the rock</b> and are never enclosed. At the end of a turn, sight along a straight line — orthogonal or diagonal — between two squares you have explored. If that line passes only through stone, every fossil on it is collected."],
        ["Flares", "Enclose a flare and drop a marker anywhere on the rows or columns of the box you just drew. It counts as a one-square shape for sighting."],
      ],
      scoring: [
        ["Prehistoric fish", "1 / 3 / 6 / 10 / 15 for a shoal of 1 to 5 in one box"],
        ["Eels", "+6 if you finish one across <b>two or more</b> boxes; −3 if you take it in a single box, or leave it half done"],
        ["Nautilus", "2 each, and 2 more if the box crosses an air line"],
        ["Stingrays", "5 each, daylight only"],
        ["Cuttlefish", "5 each, night only"],
        ["Beacons", "15 a pair, one by day and one by night"],
        ["Flags", "the printed value, best one per dive"],
        ["Fossils", "each track pays more the further along it you get"],
      ],
    },
  };

  const rows = (list) => list.map(([term, text]) =>
    "<tr><th>" + term + "</th><td>" + text + "</td></tr>").join("");

  function html(mapId, board) {
    const map = MAPS[mapId] || MAPS.map1;
    const soloApplies = board && board.diveMarks && board.diveMarks.length;
    return [
      '<h3>' + map.name + "</h3>",
      map.adds.length
        ? '<h4>What this map adds</h4><table class="aq-help">' + rows(map.adds) + "</table>"
        : '<p class="aq-help-lead">The base game, and the sheet every other map is written against.</p>',
      '<h4>Scoring</h4><table class="aq-help">' + rows(map.scoring) + "</table>",
      '<h4>Playing solo</h4><p>' + (soloApplies ? SOLO : map.note || SOLO) + "</p>",
      '<p class="aq-help-ranks">' + RANKS + "</p>",
      '<h4>The rules in full</h4><table class="aq-help">' + rows(BASE) + "</table>",
      '<p class="aq-modal-credit">Aquamarine is a print-and-play game by Postmark Games, designed by Matthew Dunstan and Rory Muldoon.</p>',
      '<button class="btn btn-grey" data-close="modal-help">Close</button>',
    ].join("");
  }

  return { html, MAPS, BASE, RANKS };
})();
