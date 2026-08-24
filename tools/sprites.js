"use strict";
// Building the sprite sheet the game draws with.
//
// The first version of this game rendered the printed gamesheet as a picture
// and drew boxes on top of it. That is a faithful reproduction of a piece of
// paper, and it plays like one: nothing moves, nothing responds, and a
// 22x22 grid of photographed artwork tells you nothing about which square is
// which until you squint at it.
//
// So the board is now drawn, not photographed, which needs the symbols as
// individual sprites. They come from two places:
//
//   * Postmark ship a MAP MAKER ASSETS folder of the real artwork -- high
//     resolution, transparent, one file per symbol. That covers Maps 1 and 2.
//
//   * Maps 3 to 5 have no supplied art at all: no angler fish, no vents, no
//     penguins, no fossils. Those are CUT from the colour gamesheets. That is
//     only possible because the extraction pipeline already knows exactly
//     which squares every symbol occupies, so each one can be cropped from a
//     known rectangle and keyed off its background.
//
// A cut takes its SHAPE from the low-ink printing of the same sheet, which is
// solid black on white and therefore already an alpha mask, and its COLOUR
// from the colour printing. See cut() for why keying the colour art alone does
// not work.
//
//   node tools/sprites.js [--write]

const fs = require("fs");
const path = require("path");
const { decodePNG } = require("../lib/tools/png.js");
const { resolve, sheet } = require("./sheets.js");
const GEOM = require("./geometry.json");

const PNP = "D:/dev/print-and-plays/Aquamarine/ADDITIONAL ASSETS/MAP MAKER ASSETS";
const OUT = path.join(__dirname, "..", "assets", "sprites");
const DATA = path.join(__dirname, "..", "data");

// Symbols Postmark supply artwork for. Several are one symbol drawn more than
// once -- four shipwrecks, three colossal squid -- and the game wants all the
// variants, so a shoal does not look stamped.
const SUPPLIED = {
  fish: ["Icons/Butterflyfish.png"],
  "fish-banner": ["Icons/Bannerfish.png"],
  jellyfish: ["Icons/Jellyfish.png"],
  "coral-purple": ["Icons/Coral2.png"],
  "coral-orange": ["Icons/Coral1.png"],
  stingray: ["Icons/Stingray.png"],
  cuttlefish: ["Icons/Cuttlefish.png"],
  beacon: ["Icons/Beacon.png"],
  bubbles: ["Icons/Air.png"],
  flag: ["Icons/Flag.png"],
  shark: ["Icons/Shark.png"],
  wreck: ["Icons/Wreck1.png", "Icons/Wreck2.png", "Icons/Wreck3.png", "Icons/Wreck4.png"],
  squid: ["Icons/CSquid1.png", "Icons/CSquid2.png", "Icons/CSquid3.png"],
  boat: ["Icons/Boat.png"],
  // ART/Diver.png and ART/Reef.png are rulebook illustrations -- whole scenes
  // on a white ground, not sprites -- so the diver is drawn in code instead.
  weed: ["Background/Weed.png"],
  rock: ["Background/Rock.png"],
  wall: ["Background/WallTiles1.png", "Background/WallTiles2.png", "Background/WallTiles3.png",
         "Background/WallTiles4.png", "Background/WallTiles5.png"],
  cave: ["Background/Cave1.png", "Background/Cave2.png", "Background/Cave3.png"],
};

// Symbols with no supplied art, cut from the colour sheet of whichever map
// prints them. `on` names the map; the instance is chosen automatically.
const CUT = {
  // Steam is deliberately absent: it prints as a few hairlines rising from a
  // vent, which cut down to a 6-pixel sliver and would look like a scratch.
  // render/board.js draws it as moving water instead, which is what it is.
  angler: "map3", prey: "map3", "glass-squid": "map3", vent: "map3",
  outpost: "map3", tunnel: "map3", cable: "map3", station: "map3",
  penguin: "map4", krill: "map4", camera: "map4",
  eel: "map5", nautilus: "map5", flare: "map5",
  "fossil-ammonite": "map5", "fossil-urchin": "map5", "fossil-bone": "map5",
  "fossil-star": "map5", "fossil-jelly": "map5",
};

const mapData = (id) => JSON.parse(fs.readFileSync(path.join(DATA, id + ".json"), "utf8"));

/* ────────────────────────────────────────────────────── cutting a symbol ── */

// Which instance of a symbol to cut. Cleanest wins: an instance sitting on
// plain water, away from anything else, keys perfectly, while one printed
// half over a rock shelf brings the shelf with it.
function pickInstance(data, board, symbol) {
  const group = (data.symbols || []).find((s) => s.symbol === symbol);
  if (!group || !group.at.length) return null;
  const cols = data.grid.cols;
  const rockIds = new Set(data.palette.filter((p) => p.terrain === "rock" || p.terrain === "ice").map((p) => p.id));

  // Every square any OTHER symbol occupies, so a neighbour is not cut in half.
  const busy = new Set();
  for (const other of data.symbols || []) {
    if (other.symbol === symbol) continue;
    for (const spot of other.at)
      for (const [c, r] of (spot.covers || [spot.home])) busy.add(c + "," + r);
  }

  let best = null;
  for (const spot of group.at) {
    const cells = spot.covers || [spot.home];
    let score = 0;
    for (const [c, r] of cells) {
      if (rockIds.has(data.terrain[r * cols + c])) score += 3;    // background is rock
      // A neighbour poking into the crop is worse than a busy square inside it.
      for (let dc = -1; dc <= 1; dc++)
        for (let dr = -1; dr <= 1; dr++)
          if (busy.has((c + dc) + "," + (r + dr))) score += 1;
    }
    if (!best || score < best.score) best = { score, cells };
  }
  return best;
}

// Cut a symbol out of the sheets: SHAPE from the low-ink art, COLOUR from the
// colour art.
//
// Colour-keying the colour sheet was tried twice and is the wrong tool. The
// terrain palette removes almost nothing, because a crop holds the painted
// variation of the water plus the white aiming cross printed at every grid
// corner, and neither is a palette entry -- every sprite came out an opaque
// square. Learning the background from the crop's own border does better on
// bright symbols and destroys dark ones: a navy penguin or a blue-grey glass
// squid sits close enough to teal water that the flood eats straight through
// it. Half the sprites came back as outlines with the middles missing.
//
// The low-ink sheet solves it outright. It is the same artwork printed as
// solid black on white, which is exactly an alpha mask -- no threshold to
// tune, no colour that might also be background, and a silhouette that is
// correct by construction. So take the shape from there and the colours from
// the colour sheet at the matching position.
//
// Two wrinkles, both handled below: some symbols print as outlines in low ink
// (bubbles are rings), so enclosed holes are filled back in; and a crop can
// clip a neighbour, so only ink connected to the symbol's own squares is kept.

const DARK = 110;        // low-ink luminance at or below this is the symbol
const SUPERSAMPLE = 3;   // mask samples per output pixel, for a clean edge

function cut(low, lowGeom, colour, colGeom, cells, pad, biggest) {
  const c0 = Math.min(...cells.map((x) => x[0])), c1 = Math.max(...cells.map((x) => x[0]));
  const r0 = Math.min(...cells.map((x) => x[1])), r1 = Math.max(...cells.map((x) => x[1]));
  const cw = c1 - c0 + 1 + pad * 2, chh = r1 - r0 + 1 + pad * 2;

  // The mask, built in low-ink pixels.
  const mw = Math.round(cw * lowGeom.pitch), mh = Math.round(chh * lowGeom.pitch);
  const mx = lowGeom.x0 + (c0 - pad) * lowGeom.pitch;
  const my = lowGeom.y0 + (r0 - pad) * lowGeom.pitch;
  const ink = new Uint8Array(mw * mh);
  for (let y = 0; y < mh; y++)
    for (let x = 0; x < mw; x++) {
      const sx = Math.round(mx + x), sy = Math.round(my + y);
      if (sx < 0 || sy < 0 || sx >= low.width || sy >= low.height) continue;
      const i = (sy * low.width + sx) * 4;
      if ((low.rgba[i] + low.rgba[i + 1] + low.rgba[i + 2]) / 3 <= DARK) ink[y * mw + x] = 1;
    }

  // Keep ink connected to the symbol's own squares, so a neighbour clipped by
  // the crop does not come along for the ride.
  //
  // `biggest` keeps only the largest such piece, which is what the fossils
  // need: they are printed INSIDE the rock, so everything touching them also
  // touches the rock's hatching, and taking every connected piece cut out a
  // fossil with a fringe of stripes attached.
  const pieces = [];
  const seen = new Uint8Array(mw * mh);
  const own = new Set(cells.map((c) => c.join(",")));
  const stack = [];
  for (let y = 0; y < mh; y++)
    for (let x = 0; x < mw; x++) {
      if (!ink[y * mw + x] || seen[y * mw + x]) continue;
      const cc = Math.floor((mx + x - lowGeom.x0) / lowGeom.pitch);
      const rr = Math.floor((my + y - lowGeom.y0) / lowGeom.pitch);
      if (!own.has(cc + "," + rr)) continue;
      const piece = [];
      seen[y * mw + x] = 1;
      stack.push(y * mw + x);
      while (stack.length) {
        const k = stack.pop();
        piece.push(k);
        const kx = k % mw, ky = (k / mw) | 0;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const nx = kx + dx, ny = ky + dy;
            if (nx < 0 || ny < 0 || nx >= mw || ny >= mh) continue;
            const nk = ny * mw + nx;
            if (ink[nk] && !seen[nk]) { seen[nk] = 1; stack.push(nk); }
          }
      }
      pieces.push(piece);
    }

  const keep = new Uint8Array(mw * mh);
  // Not strictly the largest piece: a share of it. Several fossils are drawn
  // in two or three parts, and keeping only the biggest reduced an urchin to a
  // single triangle. The rock hatching around them is much thinner than any
  // real part of the symbol, so a quarter of the largest piece separates them.
  const largest = pieces.reduce((a, b) => (!a || b.length > a.length ? b : a), null);
  const chosen = biggest && largest
    ? pieces.filter((p) => p.length >= largest.length * 0.25)
    : pieces;
  for (const piece of chosen) for (const k of piece) keep[k] = 1;

  // Fill enclosed holes: flood the NON-ink inward from the crop border, then
  // anything unreached is inside the symbol. Bubbles and beacons print as
  // rings, and without this they would be cut out as rings too.
  const outside = new Uint8Array(mw * mh);
  const q = [];
  for (let x = 0; x < mw; x++) { q.push(x); q.push((mh - 1) * mw + x); }
  for (let y = 0; y < mh; y++) { q.push(y * mw); q.push(y * mw + mw - 1); }
  while (q.length) {
    const k = q.pop();
    if (outside[k] || keep[k]) continue;
    outside[k] = 1;
    const kx = k % mw, ky = (k / mw) | 0;
    if (kx > 0) q.push(k - 1);
    if (kx < mw - 1) q.push(k + 1);
    if (ky > 0) q.push(k - mw);
    if (ky < mh - 1) q.push(k + mw);
  }
  for (let k = 0; k < keep.length; k++) if (!outside[k]) keep[k] = 1;

  // Paint: alpha from the mask, supersampled for a clean edge; colour from the
  // colour sheet at the matching place on the page.
  const ow = Math.round(cw * colGeom.pitch), oh = Math.round(chh * colGeom.pitch);
  const ox = colGeom.x0 + (c0 - pad) * colGeom.pitch;
  const oy = colGeom.y0 + (r0 - pad) * colGeom.pitch;
  const out = Buffer.alloc(ow * oh * 4);
  const scale = lowGeom.pitch / colGeom.pitch;
  for (let y = 0; y < oh; y++)
    for (let x = 0; x < ow; x++) {
      let hit = 0;
      for (let sy = 0; sy < SUPERSAMPLE; sy++)
        for (let sx = 0; sx < SUPERSAMPLE; sx++) {
          const lx = Math.round((x + (sx + 0.5) / SUPERSAMPLE) * scale);
          const ly = Math.round((y + (sy + 0.5) / SUPERSAMPLE) * scale);
          if (lx >= 0 && ly >= 0 && lx < mw && ly < mh && keep[ly * mw + lx]) hit++;
        }
      const o = (y * ow + x) * 4;
      const alpha = Math.round((hit / (SUPERSAMPLE * SUPERSAMPLE)) * 255);
      const cx = Math.round(ox + x), cy = Math.round(oy + y);
      if (alpha === 0 || cx < 0 || cy < 0 || cx >= colour.width || cy >= colour.height) { out[o + 3] = 0; continue; }
      const i = (cy * colour.width + cx) * 4;
      out[o] = colour.rgba[i]; out[o + 1] = colour.rgba[i + 1]; out[o + 2] = colour.rgba[i + 2];
      out[o + 3] = alpha;
    }

  return trim({ width: ow, height: oh, rgba: out });
}

// Crop to the alpha bounding box, so a sprite's own edges are its edges and
// the renderer can centre it without carrying a random margin around.
function trim(img) {
  let minX = img.width, minY = img.height, maxX = -1, maxY = -1;
  for (let y = 0; y < img.height; y++)
    for (let x = 0; x < img.width; x++)
      if (img.rgba[(y * img.width + x) * 4 + 3] > 8) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
  if (maxX < 0) return img;
  const w = maxX - minX + 1, h = maxY - minY + 1;
  const out = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++)
    img.rgba.copy(out, y * w * 4, ((y + minY) * img.width + minX) * 4, ((y + minY) * img.width + minX + w) * 4);
  return { width: w, height: h, rgba: out };
}

/* ──────────────────────────────────────────────────────────── the build ── */

async function build(write) {
  const sharp = require("sharp");
  if (write) fs.mkdirSync(OUT, { recursive: true });
  const made = [];

  for (const [name, files] of Object.entries(SUPPLIED))
    files.forEach((rel, i) => {
      const id = files.length > 1 ? name + (i + 1) : name;
      made.push({ id, from: "supplied", src: path.join(PNP, rel) });
    });

  const sheets = new Map();
  for (const [name, mapId] of Object.entries(CUT)) {
    if (!sheets.has(mapId)) {
      sheets.set(mapId, {
        colour: decodePNG(fs.readFileSync(resolve(sheet(mapId).ship))),
        low: decodePNG(fs.readFileSync(resolve(sheet(mapId).read))),
        data: mapData(mapId),
        colGeom: GEOM[mapId].colour,
        lowGeom: GEOM[mapId].lowink,
      });
    }
    const { colour, low, data, colGeom, lowGeom } = sheets.get(mapId);
    const pick = pickInstance(data, null, name);
    if (!pick) { console.log("  ! no instance of " + name + " on " + mapId); continue; }
    // Fossils sit inside the rock, so only their largest connected piece is
    // theirs; everything else touching them is the stone hatching.
    const sprite = cut(low, lowGeom, colour, colGeom, pick.cells, 0.15, name.startsWith("fossil"));
    made.push({ id: name, from: "cut:" + mapId, sprite, cells: pick.cells.length });
  }

  const index = {};
  for (const item of made) {
    let png;
    if (item.from === "supplied") png = await sharp(item.src).toBuffer();
    else png = await sharp(item.sprite.rgba, {
      raw: { width: item.sprite.width, height: item.sprite.height, channels: 4 },
    }).png().toBuffer();

    // One long edge of 256 is plenty: a cell is at most ~90 screen pixels even
    // on a large display, and these are flat shapes with no fine detail.
    const resized = sharp(png).resize(256, 256, { fit: "inside", withoutEnlargement: true });
    const meta = await resized.metadata();
    if (write) await resized.clone().webp({ quality: 92, alphaQuality: 100 }).toFile(path.join(OUT, item.id + ".webp"));
    index[item.id] = { w: meta.width, h: meta.height, from: item.from };
    console.log("  " + item.id.padEnd(18), (meta.width + "x" + meta.height).padEnd(9), item.from);
  }

  if (write) {
    fs.writeFileSync(path.join(OUT, "index.json"), JSON.stringify(index, null, 2) + "\n");
    console.log("\nwrote " + Object.keys(index).length + " sprites to assets/sprites/");
  } else console.log("\n(dry run -- pass --write)");
  return index;
}

if (require.main === module) build(process.argv.includes("--write")).catch((e) => {
  console.error(e.message);
  process.exit(1);
});

module.exports = { build, cut, trim, pickInstance, SUPPLIED, CUT };
