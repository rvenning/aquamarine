"use strict";
// Where the printed Aquamarine sheets live, and which file to read for what.
//
// Every sheet ships in two inks. The LOW-INK version is line art on white at
// ~1743px wide -- clean edges, no photographic texture, and an eighth of the
// bytes -- which makes it the right thing to READ from. The COLOUR version is
// what the player looks at, so it is the thing to SHIP. Both are the same
// artwork at different scales, which is why every coordinate this toolchain
// produces is normalised to 0..1 of the sheet and never a pixel.

const path = require("path");

const PNP = process.env.AQUAMARINE_PNP || "D:/dev/print-and-plays/Aquamarine";

const SHEETS = [
  {
    id: "map1", n: 1, name: "Exploratory Expedition",
    read: "GAMESHEETS/MAP01/Aquamarine_Map1_Low-Ink.png",
    ship: "GAMESHEETS/MAP01/Aquamarine_Map1.png",
    rules: "RULES/ENGLISH/AQUAMARINE MAP 1 RULES - EXPLORATORY EXPEDITION_A4.pdf",
    log: "DIVER LOGS/MAP01/DiversLog_Map01.png",
  },
  {
    id: "map2", n: 2, name: "Apex Predators",
    read: "GAMESHEETS/MAP02/Aquamarine_Map2_Low-Ink.png",
    ship: "GAMESHEETS/MAP02/Aquamarine_Map2.png",
    rules: "RULES/ENGLISH/AQUAMARINE MAP 2 RULES - APEX PREDATORS_A4.pdf",
    log: "DIVER LOGS/MAP02/DiversLog_Map02.png",
  },
  {
    // Map 3 is printed as two half-sheets; FULLSCREEN is the joined image the
    // rules tell digital players to use, so the extractor treats it as one map
    // with a hard boundary partway down (the Trench).
    id: "map3", n: 3, name: "1000 Fathoms Deep",
    read: "GAMESHEETS/MAP03/Aquamarine_Map3_Low-Ink_FULLSCREEN.png",
    ship: "GAMESHEETS/MAP03/Aquamarine_Map3_FULLSCREEN.png",
    rules: "RULES/ENGLISH/AQUAMARINE MAP 3 RULES - 1000 FATHOMS DEEP_A4.pdf",
    log: "DIVER LOGS/MAP03/DiversLog_Map3_V1.png",
  },
  {
    id: "map4", n: 4, name: "The Polar Shelf",
    read: "GAMESHEETS/MAP04/Aquamarine_Map4_Low-Ink.png",
    ship: "GAMESHEETS/MAP04/Aquamarine_Map4.png",
    rules: "RULES/ENGLISH/AQUAMARINE MAP 4 RULES - THE POLAR SHELF_A4.pdf",
    log: "DIVER LOGS/MAP04/DiversLog_Map4_V1.png",
  },
  {
    id: "map5", n: 5, name: "Ancient Waters",
    read: "GAMESHEETS/MAP05/Aquamarine_Map5_Low-Ink.png",
    ship: "GAMESHEETS/MAP05/Aquamarine_Map5.png",
    rules: "RULES/ENGLISH/AQUAMARINE MAP 5 RULES - ANCIENT WATERS_A4.pdf",
    log: "DIVER LOGS/MAP05/DiversLog_Map5_V1.png",
  },
];

const resolve = (rel) => path.join(PNP, rel);
const sheet = (id) => {
  const s = SHEETS.find((x) => x.id === id);
  if (!s) throw new Error("no such sheet: " + id);
  return s;
};

module.exports = { PNP, SHEETS, sheet, resolve };
