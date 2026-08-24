"use strict";
// Loading the sprite set.
//
// Around fifty small WebPs, 424KB the lot, built by tools/sprites.js from
// Postmark's own artwork. They are loaded as individual files rather than one
// packed atlas: the whole set is smaller than a single one of the printed
// sheets, HTTP/2 makes fifty small requests cheap, and keeping them separate
// means a sprite can be rebuilt without repacking everything.
//
// Loading never rejects. A missing sprite draws as nothing and the game
// continues -- one absent fish is not a reason to show a player an error.

window.AQ = window.AQ || {};

AQ.Sprites = (() => {
  const images = new Map();
  let index = null;
  let ready = null;

  function loadOne(id) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => { images.set(id, img); resolve(img); };
      img.onerror = () => { images.set(id, null); resolve(null); };
      img.src = "assets/sprites/" + id + ".webp";
    });
  }

  function load() {
    if (ready) return ready;
    ready = fetch("assets/sprites/index.json")
      .then((r) => r.json())
      .then((json) => {
        index = json;
        return Promise.all(Object.keys(json).map(loadOne));
      })
      .then(() => images);
    return ready;
  }

  // Several symbols have more than one drawing -- four shipwrecks, three
  // colossal squid, five wall tiles. `variant` picks one deterministically
  // from a number, so the same wreck is always the same wreck and a stretch of
  // wall does not reshuffle itself every frame.
  function get(id, variant) {
    if (images.has(id)) return images.get(id);
    if (variant === undefined) return null;
    const options = [];
    for (let i = 1; i <= 8; i++) if (images.has(id + i)) options.push(images.get(id + i));
    return options.length ? options[Math.abs(variant) % options.length] : null;
  }

  const has = (id) => images.has(id) || images.has(id + "1");

  return { load, get, has, get index() { return index; } };
})();
