"use strict";
// The five expeditions, and loading one.
//
// Each map's board data is a JSON file and its artwork is a WebP of the
// printed sheet -- around 600KB apiece. They are fetched on demand rather than
// up front: a player who only ever dives Map 1 should not pay for the Trench,
// and the service worker caches whichever ones actually get played.

window.AQ = window.AQ || {};

AQ.Maps = (() => {
  const LIST = [
    { id: "map1", n: 1, name: "Exploratory Expedition", blurb: "The reef. Coral, shoals and four shipwrecks.", ready: true },
    { id: "map2", n: 2, name: "Apex Predators", blurb: "Dark caves, research tracks, and colossal squid.", ready: false },
    { id: "map3", n: 3, name: "1000 Fathoms Deep", blurb: "A submersible, a trench, and hydrothermal vents.", ready: false },
    { id: "map4", n: 4, name: "The Polar Shelf", blurb: "Ice, penguins, and a camera worth carrying.", ready: false },
    { id: "map5", n: 5, name: "Ancient Waters", blurb: "Fossils in the rock, flares, and bad-tempered eels.", ready: false },
  ];

  const cache = new Map();

  async function load(id) {
    if (cache.has(id)) return cache.get(id);
    const res = await fetch("data/" + id + ".json");
    if (!res.ok) throw new Error("could not load " + id);
    const data = await res.json();
    const board = AQ.Board.make(data);
    cache.set(id, board);
    return board;
  }

  const rulesFor = (id) => AQ.Rules[id] || AQ.Rules.map1;
  const info = (id) => LIST.find((m) => m.id === id);

  return { LIST, load, rulesFor, info };
})();
