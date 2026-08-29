"use strict";
// Which picture stands for which thing, wherever the game names it in words.
//
// Four places in the interface list the same set of creatures: the scoring
// panel behind the ?, the shipwreck-bonus chooser, the bonus tracker in the
// HUD, and the result sheet at the end. They were drifting -- the result sheet
// grew sprites and the others stayed as text -- so the lookup lives here once
// and they all read from it.
//
// This is deliberately separate from render/sprites.js. That file loads the
// images the canvas draws with; this one only answers "what file name goes with
// the word 'cuttlefish'", which is a pure question with no Image, no fetch and
// no canvas, so the tests can ask it too.

window.AQ = window.AQ || {};

AQ.Icons = (() => {
  // Score-line keys, bonus symbols and help-table terms all resolve through the
  // same table -- they are the same nouns, named by three different bits of the
  // game, and keeping one map means a sprite that gets rebuilt or renamed is
  // fixed in one place.
  const SPRITE = {
    fish: "fish",
    coral: "coral-orange",
    "coral-purple": "coral-purple",
    "coral-orange": "coral-orange",
    jellyfish: "jellyfish",
    stingray: "stingray",
    cuttlefish: "cuttlefish",
    beacon: "beacon",
    "beacon-pair": "beacon",
    flag: "flag",
    wreck: "wreck1",
    bubbles: "bubbles",
    shark: "shark",
    squid: "squid1",
    research: "research",
    camera: "camera",
    krill: "krill",
    penguin: "penguin",
    vent: "vent",
    steam: "steam",
    "glass-squid": "glass-squid",
    angler: "angler",
    prey: "prey",
    eel: "eel",
    nautilus: "nautilus",
    flare: "flare",
    fossil: "fossil-ammonite",
    outpost: "outpost",
    cable: "cable",
    tunnel: "tunnel",
    cave: "cave1",
    boat: "boat",
    rock: "rock",
    weed: "weed",
  };

  // The shoal fish is a different fish on three of the sheets, and the picture
  // beside "1 / 3 / 6 / 10 / 15 for a shoal" should be the one actually printed
  // on the board being played.
  const PER_MAP = {
    map2: { fish: "fish-banner" },
    map3: { fish: "prey" },
  };

  function idFor(key, mapId) {
    if (!key) return null;
    const overrides = PER_MAP[mapId];
    if (overrides && overrides[key]) return overrides[key];
    return SPRITE[key] || null;
  }

  // An <img> for a key, or an empty string. Callers drop this straight into a
  // template, so a key with no picture has to vanish rather than leave a broken
  // image behind -- half these lists are things like "Photographs" and "Air"
  // that were never drawn as a creature.
  function img(key, mapId, className) {
    const id = idFor(key, mapId);
    if (!id) return "";
    return '<img class="' + (className || "aq-icon") + '" src="assets/sprites/' +
      id + '.webp" alt="" loading="lazy">';
  }

  return { idFor, img, SPRITE, PER_MAP };
})();
