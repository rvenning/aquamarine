"use strict";
// Drawing the ocean.
//
// The first version of this game put the printed gamesheet on screen as a
// picture and drew boxes over it. It was faithful and it was inert: a
// photograph of a piece of paper, where nothing moves, nothing responds, and
// every square looks like every other until you lean in.
//
// So the board is drawn instead. The artwork is still Postmark's -- the same
// fish, the same coral, cut out as sprites by tools/sprites.js -- but the sea
// they swim in is rendered: a depth gradient from bright surface teal down to
// something nearly black, light falling through the surface, motes drifting in
// it, and every creature idling on its own clock. Rock is built as a mass
// rather than a grid of squares, so a shelf reads as a shelf.
//
// Two rules hold the whole thing together:
//
//   * Nothing animates off a global clock alone. Every creature's phase is
//     derived from WHERE IT IS, so a shoal breathes out of step and the board
//     never pulses as one. The same seed drives which way a fish faces and
//     which of four wreck drawings it uses, so the map looks identical every
//     time it is opened.
//
//   * Motion is slow. This is a game about drawing careful boxes, and a board
//     that jitters would make that harder rather than prettier.

window.AQ = window.AQ || {};

AQ.Render = (() => {
  // The sheets' own palette, sampled from the artwork, so the drawn sea and
  // the cut-out sprites belong to each other.
  const SURFACE = [126, 214, 205];
  const SHALLOW = [102, 198, 188];
  const DEEP = [18, 58, 78];
  const ABYSS = [8, 26, 38];
  const ROCK = [40, 77, 90];
  const ROCK_LIP = [58, 104, 116];
  const ICE = [206, 240, 246];
  const CAVE = [26, 62, 74];

  const DIVE_EDGE = ["#ffce3b", "#5fe07a", "#63b8ff"];
  const DIVE_FILL = ["rgba(255,206,59,.20)", "rgba(95,224,122,.20)", "rgba(99,184,255,.20)"];

  const rgb = (c, a) => "rgba(" + c[0] + "," + c[1] + "," + c[2] + (a === undefined ? ",1)" : "," + a + ")");
  const mix = (a, b, t) => [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];

  // A stable pseudo-random in [0,1) from a cell and a channel. Everything that
  // needs to look arbitrary but stay put comes from here.
  function hash(i, salt) {
    let n = (i * 374761393 + salt * 668265263) | 0;
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  }

  function create(canvas, board) {
    let ctx = canvas.getContext("2d");

    const view = { zoom: 1, panX: 0, panY: 0 };
    const state = {
      dives: [[], [], []],
      preview: null,
      legal: null,
      marks: [],
      spotlight: null,      // squares the tutorial is pointing at
      dormant: null,        // objects that would score nothing at this hour
      diver: null,          // cell the diver is at, or null between dives
      splashes: [],         // short-lived flourishes when something is caught
      dive: 0,
    };

    // Motes of plankton, placed once and drifting forever. Cheap, and they do
    // more than anything else to stop the water reading as flat paint.
    const MOTES = 90;
    const motes = Array.from({ length: MOTES }, (_, i) => ({
      x: hash(i, 11), y: hash(i, 12),
      r: 0.4 + hash(i, 13) * 1.4,
      drift: 0.2 + hash(i, 14) * 0.8,
      phase: hash(i, 15) * Math.PI * 2,
    }));

    let t0 = performance.now();
    let time = 0;

    /* ─────────────────────────────────────────────────────────── layout ── */

    function layout() {
      const cw = canvas.width, ch = canvas.height;
      // Fit the grid, leaving room above it for the boats and the surface.
      const skyRows = 1.05;
      const gridAspect = board.cols / (board.rows + skyRows);
      let cell = Math.min(cw / board.cols, ch / (board.rows + skyRows));
      cell *= view.zoom;
      const w = cell * board.cols, h = cell * (board.rows + skyRows);
      return {
        cell,
        x: (cw - w) / 2 + view.panX,
        y: (ch - h) / 2 + view.panY + cell * skyRows,
        surfaceY: (ch - h) / 2 + view.panY + cell * skyRows,
        w, h,
      };
    }

    const cellX = (L, i) => L.x + board.col(i) * L.cell;
    const cellY = (L, i) => L.y + board.row(i) * L.cell;

    function cellAt(px, py) {
      const L = layout();
      const c = Math.floor((px - L.x) / L.cell);
      const r = Math.floor((py - L.y) / L.cell);
      return board.inBounds(c, r) ? board.index(c, r) : null;
    }

    /* ──────────────────────────────────────────────────────────── water ── */

    // Depth colour: bright at the surface, black at the bottom, with the two
    // air lines showing as a slight step so the player can see the cost of
    // going deeper in the water itself.
    function waterAt(row) {
      const t = board.rows <= 1 ? 0 : row / (board.rows - 1);
      const base = t < 0.35
        ? mix(SURFACE, SHALLOW, t / 0.35)
        : t < 0.75
          ? mix(SHALLOW, DEEP, (t - 0.35) / 0.4)
          : mix(DEEP, ABYSS, (t - 0.75) / 0.25);
      let step = 0;
      for (const line of board.depthLines) if (row >= line) step += 0.06;
      return mix(base, ABYSS, step);
    }

    // Eleven colour stops that depend on nothing but the layout, rebuilt sixty
    // times a second. Cached against the same key as the terrain.
    let grad = null, gradKey = "";
    function waterGradient(L) {
      const key = layoutKey(L);
      if (grad && gradKey === key) return grad;
      grad = ctx.createLinearGradient(0, L.surfaceY - L.cell, 0, L.y + board.rows * L.cell);
      for (let i = 0; i <= 10; i++) {
        const row = (i / 10) * (board.rows - 1);
        grad.addColorStop(i / 10, rgb(waterAt(row)));
      }
      gradKey = key;
      return grad;
    }

    function drawWater(L) {
      ctx.fillStyle = waterGradient(L);
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Light from the surface: broad, slow, and barely there.
      const rays = 5;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < rays; i++) {
        const sway = Math.sin(time * 0.12 + i * 1.7) * L.cell * 1.2;
        const x = L.x + ((i + 0.5) / rays) * L.w + sway;
        const top = L.surfaceY;
        const depth = board.rows * L.cell * 0.62;
        const g = ctx.createLinearGradient(x, top, x + L.cell * 2, top + depth);
        g.addColorStop(0, "rgba(190,255,246,.13)");
        g.addColorStop(1, "rgba(190,255,246,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(x - L.cell * 0.5, top);
        ctx.lineTo(x + L.cell * 0.9, top);
        ctx.lineTo(x + L.cell * 3.4, top + depth);
        ctx.lineTo(x - L.cell * 2.2, top + depth);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();

      // Motes.
      ctx.fillStyle = "rgba(224,255,250,.30)";
      for (const m of motes) {
        const y = L.y + ((m.y + time * 0.008 * m.drift) % 1) * board.rows * L.cell;
        const x = L.x + m.x * L.w + Math.sin(time * 0.3 + m.phase) * L.cell * 0.25;
        ctx.beginPath();
        ctx.arc(x, y, m.r * Math.max(1, L.cell / 40), 0, Math.PI * 2);
        ctx.fill();
      }
    }

    /* ───────────────────────────────────────────────────────── the rock ── */

    // Rock is drawn as a MASS, not as squares. Every rock cell is filled, then
    // a lighter lip is drawn along its top edges only where the square above is
    // water -- which is what makes a shelf look like a shelf rather than a run
    // of identical tiles.
    function drawTerrain(L) {
      const lip = Math.max(2, L.cell * 0.13);
      for (let i = 0; i < board.size; i++) {
        if (!board.isBlocked(i)) continue;
        const x = cellX(L, i), y = cellY(L, i);
        const ice = board.isIce(i);
        const shade = hash(i, 3) * 0.12 - 0.06;
        ctx.fillStyle = ice
          ? rgb(mix(ICE, [255, 255, 255], shade + 0.06))
          : rgb(mix(ROCK, ABYSS, 0.25 + shade + board.row(i) / board.rows * 0.35));
        // Overdraw by a hair so neighbouring cells leave no seam.
        ctx.fillRect(x - 0.5, y - 0.5, L.cell + 1, L.cell + 1);
      }
      for (let i = 0; i < board.size; i++) {
        if (!board.isBlocked(i)) continue;
        const above = board.row(i) > 0 ? board.index(board.col(i), board.row(i) - 1) : -1;
        if (above >= 0 && board.isBlocked(above)) continue;
        const x = cellX(L, i), y = cellY(L, i);
        ctx.fillStyle = board.isIce(i) ? "rgba(255,255,255,.85)" : rgb(ROCK_LIP, 0.9);
        ctx.fillRect(x - 0.5, y - 0.5, L.cell + 1, lip);
      }
      // Cave shading, which is water you may only enter with a light.
      for (let i = 0; i < board.size; i++) {
        if (!board.isCave(i)) continue;
        ctx.fillStyle = rgb(CAVE, 0.55);
        ctx.fillRect(cellX(L, i) - 0.5, cellY(L, i) - 0.5, L.cell + 1, L.cell + 1);
      }
    }

    // Weed along the top of the rock, placed by cell so it never moves, and
    // swaying on a phase taken from the same seed so no two clumps agree.
    function drawWeed(L) {
      const sprite = AQ.Sprites.get("weed");
      if (!sprite) return;
      for (let i = 0; i < board.size; i++) {
        if (!board.isBlocked(i) || board.isIce(i)) continue;
        const r = board.row(i);
        if (r === 0) continue;
        const above = board.index(board.col(i), r - 1);
        if (board.isBlocked(above)) continue;
        if (hash(i, 7) > 0.42) continue;
        const h = L.cell * (0.7 + hash(i, 8) * 0.7);
        const w = h * (sprite.width / sprite.height);
        const x = cellX(L, i) + L.cell * (0.15 + hash(i, 9) * 0.55);
        const y = cellY(L, i);
        const sway = Math.sin(time * 0.5 + hash(i, 10) * 6.3) * 0.05;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(sway);
        ctx.globalAlpha = 0.85;
        ctx.drawImage(sprite, -w / 2, -h, w, h);
        ctx.restore();
      }
    }

    /* ──────────────────────────────────────────────────── the sea above ── */

    function drawSurface(L) {
      const y = L.surfaceY;
      ctx.fillStyle = "#0b2733";
      ctx.fillRect(0, 0, canvas.width, y);

      // The waterline, with a slow swell.
      ctx.beginPath();
      ctx.moveTo(0, y + 2);
      for (let x = 0; x <= canvas.width; x += 8) {
        const wave = Math.sin(x * 0.012 + time * 0.7) * L.cell * 0.06
                   + Math.sin(x * 0.03 - time * 0.4) * L.cell * 0.03;
        ctx.lineTo(x, y + wave);
      }
      ctx.lineTo(canvas.width, 0);
      ctx.lineTo(0, 0);
      ctx.closePath();
      ctx.fillStyle = "#0b2733";
      ctx.fill();

      ctx.strokeStyle = "rgba(190,255,246,.45)";
      ctx.lineWidth = Math.max(1.5, L.cell * 0.05);
      ctx.beginPath();
      for (let x = 0; x <= canvas.width; x += 8) {
        const wave = Math.sin(x * 0.012 + time * 0.7) * L.cell * 0.06
                   + Math.sin(x * 0.03 - time * 0.4) * L.cell * 0.03;
        if (x === 0) ctx.moveTo(x, y + wave); else ctx.lineTo(x, y + wave);
      }
      ctx.stroke();

      const boat = AQ.Sprites.get("boat");
      if (!boat) return;
      board.boats.forEach((b, n) => {
        const mid = (b.cols[0] + b.cols[b.cols.length - 1] + 1) / 2;
        const w = L.cell * 4.2, h = w * (boat.height / boat.width);
        const bob = Math.sin(time * 0.6 + n * 2.1) * L.cell * 0.05;
        ctx.drawImage(boat, L.x + mid * L.cell - w / 2, y - h * 0.82 + bob, w, h);
      });
    }

    /* ──────────────────────────────────────────────── the printed rules ── */

    function drawDepthLines(L) {
      ctx.save();
      ctx.setLineDash([L.cell * 0.28, L.cell * 0.2]);
      board.depthLines.forEach((row, n) => {
        const y = L.y + row * L.cell;
        ctx.strokeStyle = "rgba(255,206,59,.55)";
        ctx.lineWidth = Math.max(1.5, L.cell * 0.05);
        ctx.beginPath();
        ctx.moveTo(L.x, y);
        ctx.lineTo(L.x + L.w, y);
        ctx.stroke();

        ctx.setLineDash([]);
        const label = "−" + (n + 1) + " AIR";
        ctx.font = "600 " + Math.round(L.cell * 0.34) + "px system-ui, sans-serif";
        const pad = L.cell * 0.16;
        const tw = ctx.measureText(label).width;
        ctx.fillStyle = "rgba(11,39,51,.85)";
        ctx.fillRect(L.x + pad, y + pad * 0.5, tw + pad * 2, L.cell * 0.5);
        ctx.fillStyle = "#ffce3b";
        ctx.textBaseline = "middle";
        ctx.fillText(label, L.x + pad * 2, y + pad * 0.5 + L.cell * 0.25);
        ctx.setLineDash([L.cell * 0.28, L.cell * 0.2]);
      });
      ctx.restore();

      // The three dive marks, down the right-hand edge.
      board.diveMarks.forEach((row, n) => {
        const y = L.y + row * L.cell;
        ctx.fillStyle = "rgba(255,255,255,.30)";
        for (let k = 0; k <= n; k++) {
          const cx = L.x + L.w + L.cell * 0.35;
          const cy = y - L.cell * 0.18 * (n - k);
          ctx.beginPath();
          ctx.moveTo(cx - L.cell * 0.14, cy - L.cell * 0.1);
          ctx.lineTo(cx + L.cell * 0.14, cy - L.cell * 0.1);
          ctx.lineTo(cx, cy + L.cell * 0.1);
          ctx.closePath();
          ctx.fill();
        }
      });
    }

    /* ────────────────────────────────────────────────────── the animals ── */

    // How a symbol idles. Kept in one place so a creature behaves the same
    // wherever it appears, and so adding a map's new creatures is a table
    // entry rather than a new branch in the draw loop.
    const IDLE = {
      fish: (p, s) => ({ x: Math.sin(p + s * 0.9) * 0.06, y: Math.sin(p * 1.7 + s) * 0.04, rot: Math.sin(p + s) * 0.06 }),
      "fish-banner": (p, s) => IDLE.fish(p, s),
      prey: (p, s) => ({ x: 0, y: Math.sin(p * 1.2 + s) * 0.05, rot: 0 }),
      jellyfish: (p, s) => ({ y: Math.sin(p * 0.9 + s) * 0.09, squash: 1 + Math.sin(p * 0.9 + s) * 0.09 }),
      bubbles: (p, s) => ({ y: -((p * 0.13 + s) % 1) * 0.5, fade: 1 - ((p * 0.13 + s) % 1) }),
      "coral-purple": (p, s) => ({ rot: Math.sin(p * 0.5 + s) * 0.04 }),
      "coral-orange": (p, s) => ({ rot: Math.sin(p * 0.5 + s) * 0.04 }),
      stingray: (p, s) => ({ x: Math.sin(p * 0.6 + s) * 0.05, squash: 1 + Math.sin(p * 1.4 + s) * 0.05 }),
      cuttlefish: (p, s) => ({ y: Math.sin(p * 0.8 + s) * 0.05 }),
      "glass-squid": (p, s) => ({ y: Math.sin(p * 0.7 + s) * 0.06, squash: 1 + Math.sin(p * 1.6 + s) * 0.07 }),
      squid: (p, s) => ({ squash: 1 + Math.sin(p * 0.7 + s) * 0.04 }),
      shark: (p, s) => ({ x: Math.sin(p * 0.35 + s) * 0.1, rot: Math.sin(p * 0.35 + s) * 0.04 }),
      penguin: (p, s) => ({ y: Math.sin(p * 0.9 + s) * 0.05, rot: Math.sin(p * 0.9 + s) * 0.05 }),
      krill: (p, s) => ({ x: Math.sin(p * 1.8 + s) * 0.05, y: Math.cos(p * 1.5 + s) * 0.04 }),
      eel: (p, s) => ({ y: Math.sin(p * 0.8 + s) * 0.03 }),
      nautilus: (p, s) => ({ y: Math.sin(p * 0.6 + s) * 0.04, rot: Math.sin(p * 0.6 + s) * 0.05 }),
      angler: (p, s) => ({ x: Math.sin(p * 0.5 + s) * 0.05 }),
      beacon: () => ({}),
      flag: () => ({}),
    };

    function drawObjects(L) {
      const drawn = new Set();
      for (const obj of board.objects) {
        if (drawn.has(obj.id)) continue;
        drawn.add(obj.id);
        drawObject(L, obj);
      }
    }

    function drawObject(L, obj) {
      const seed = obj.cells[0];
      const sprite = AQ.Sprites.get(obj.symbol, seed) || AQ.Sprites.get(obj.symbol);
      const c0 = Math.min(...obj.cells.map(board.col)), c1 = Math.max(...obj.cells.map(board.col));
      const r0 = Math.min(...obj.cells.map(board.row)), r1 = Math.max(...obj.cells.map(board.row));
      const bw = (c1 - c0 + 1) * L.cell, bh = (r1 - r0 + 1) * L.cell;
      const cx = L.x + c0 * L.cell + bw / 2;
      const cy = L.y + r0 * L.cell + bh / 2;

      if (obj.symbol === "beacon") return drawBeacon(L, cx, cy, seed);
      if (obj.symbol === "flag") return drawFlag(L, cx, cy, obj);
      if (obj.symbol === "vent") drawSteam(L, cx, cy + bh * 0.2, seed);

      if (!sprite) return drawUnknown(L, cx, cy, obj);

      const idle = IDLE[obj.symbol];
      const move = idle ? idle(time, hash(seed, 21) * 6.3) : {};
      const fit = Math.min(bw / sprite.width, bh / sprite.height) * 0.82;
      const w = sprite.width * fit, h = sprite.height * fit;

      ctx.save();
      ctx.translate(cx + (move.x || 0) * L.cell, cy + (move.y || 0) * L.cell);
      if (move.rot) ctx.rotate(move.rot);
      if (move.squash) ctx.scale(1 / move.squash, move.squash);
      // Half the fish swim the other way, decided once by where they are.
      if (/fish|shark|prey|angler|eel/.test(obj.symbol) && hash(seed, 22) > 0.5) ctx.scale(-1, 1);
      // A creature that does not count at this hour is drawn faded, so the board
      // itself answers "is this worth enclosing right now" at the moment you are
      // dragging a box over it. Faded rather than hidden: it is still there, and
      // you may still enclose it -- it simply pays nothing until its hour comes
      // round. The chips under the wheel are the legend for what the fading means.
      let alpha = move.fade === undefined ? 1 : 0.35 + move.fade * 0.65;
      if (state.dormant && state.dormant.has(obj.id)) alpha *= 0.32;
      if (alpha !== 1) ctx.globalAlpha = alpha;
      // A soft shadow underneath lifts a sprite off the water.
      ctx.shadowColor = "rgba(0,0,0,.35)";
      ctx.shadowBlur = L.cell * 0.18;
      ctx.shadowOffsetY = L.cell * 0.05;
      ctx.drawImage(sprite, -w / 2, -h / 2, w, h);
      ctx.restore();
    }

    // Beacons are drawn rather than blitted: the sprite is a static picture of
    // a pulse, and a pulse should pulse.
    function drawBeacon(L, cx, cy, seed) {
      const sprite = AQ.Sprites.get("beacon");
      const phase = (time * 0.5 + hash(seed, 31)) % 1;
      ctx.save();
      ctx.strokeStyle = "rgba(214,255,250,.55)";
      ctx.lineWidth = Math.max(1, L.cell * 0.04);
      for (let ring = 0; ring < 3; ring++) {
        const p = (phase + ring / 3) % 1;
        ctx.globalAlpha = (1 - p) * 0.7;
        ctx.beginPath();
        ctx.arc(cx, cy + L.cell * 0.1, L.cell * (0.15 + p * 0.55), Math.PI, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
      if (sprite) {
        const h = L.cell * 0.78, w = sprite.width / sprite.height * h;
        ctx.drawImage(sprite, cx - w / 2, cy - h / 2, w, h);
      }
    }

    // A flag, with what it is worth. On the sheet the value hangs beneath the
    // pennant on a pole, often over rock; here it goes on the flag itself,
    // because the number is the entire reason to swim across the map for one.
    function drawFlag(L, cx, cy, obj) {
      const sprite = AQ.Sprites.get("flag");
      const value = board.flagValue(obj.cells[0]);
      const wave = Math.sin(time * 2 + cx * 0.01) * 0.06;
      if (sprite) {
        const h = L.cell * 0.8, w = sprite.width / sprite.height * h;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(wave);
        ctx.shadowColor = "rgba(0,0,0,.35)";
        ctx.shadowBlur = L.cell * 0.15;
        ctx.drawImage(sprite, -w / 2, -h / 2, w, h);
        ctx.restore();
      }
      if (!value) return;
      const r = L.cell * 0.26;
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx + L.cell * 0.24, cy + L.cell * 0.24, r, 0, Math.PI * 2);
      ctx.fillStyle = "#ffce3b";
      ctx.shadowColor = "rgba(0,0,0,.4)";
      ctx.shadowBlur = L.cell * 0.12;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#0b2733";
      ctx.font = "800 " + Math.round(r * 1.25) + "px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(value), cx + L.cell * 0.24, cy + L.cell * 0.25);
      ctx.restore();
    }

    // Steam from a hydrothermal vent: a column of rising water, drawn because
    // the printed version is a few hairlines that cut out as a scratch.
    function drawSteam(L, cx, cy, seed) {
      ctx.save();
      ctx.strokeStyle = "rgba(214,255,250,.22)";
      ctx.lineWidth = Math.max(1, L.cell * 0.05);
      for (let s = 0; s < 3; s++) {
        const off = (s - 1) * L.cell * 0.22;
        ctx.beginPath();
        for (let k = 0; k <= 12; k++) {
          const up = (k / 12) * L.cell * 2.2;
          const wob = Math.sin(time * 1.4 + k * 0.6 + hash(seed, 40 + s) * 6.3) * L.cell * 0.09;
          const x = cx + off + wob, y = cy - up;
          if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.globalAlpha = 0.7;
        ctx.stroke();
      }
      ctx.restore();
    }

    // A symbol with no sprite still has to be visible and countable, so it is
    // drawn as a labelled token rather than silently skipped.
    function drawUnknown(L, cx, cy, obj) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, L.cell * 0.3, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,255,.75)";
      ctx.fill();
      ctx.fillStyle = "#0b2733";
      ctx.font = "700 " + Math.round(L.cell * 0.3) + "px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(obj.symbol.slice(0, 2).toUpperCase(), cx, cy);
      ctx.restore();
    }

    /* ─────────────────────────────────────────────────────────── the dive ── */

    function fillCells(L, cells, style) {
      ctx.fillStyle = style;
      for (const i of cells) ctx.fillRect(cellX(L, i) - 0.5, cellY(L, i) - 0.5, L.cell + 1, L.cell + 1);
    }

    // Outline the boundary of a set of squares rather than each square, so a
    // drawn box reads as one shape the way a pencil line would.
    function outline(L, cells, style, width) {
      const set = new Set(cells);
      ctx.strokeStyle = style;
      ctx.lineWidth = width;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.beginPath();
      for (const i of cells) {
        const c = board.col(i), r = board.row(i);
        const x = cellX(L, i), y = cellY(L, i);
        if (!set.has(board.index(c, r - 1)) || r === 0) { ctx.moveTo(x, y); ctx.lineTo(x + L.cell, y); }
        if (!set.has(board.index(c, r + 1)) || r === board.rows - 1) { ctx.moveTo(x, y + L.cell); ctx.lineTo(x + L.cell, y + L.cell); }
        if (!set.has(board.index(c - 1, r)) || c === 0) { ctx.moveTo(x, y); ctx.lineTo(x, y + L.cell); }
        if (!set.has(board.index(c + 1, r)) || c === board.cols - 1) { ctx.moveTo(x + L.cell, y); ctx.lineTo(x + L.cell, y + L.cell); }
      }
      ctx.stroke();
    }

    function drawDives(L) {
      state.dives.forEach((cells, d) => {
        if (!cells.length) return;
        const current = d === state.dive;
        ctx.save();
        ctx.globalAlpha = current ? 1 : 0.55;
        fillCells(L, cells, DIVE_FILL[d]);
        ctx.shadowColor = DIVE_EDGE[d];
        ctx.shadowBlur = current ? L.cell * 0.35 : 0;
        outline(L, cells, DIVE_EDGE[d], Math.max(2, L.cell * 0.075));
        ctx.restore();
      });
    }

    // The diver: drawn, not blitted. The supplied artwork is a rulebook
    // illustration of a whole scene, and what this needs is a token small
    // enough to sit in one square without hiding what is in it.
    function drawDiver(L) {
      if (state.diver === null || state.diver === undefined) return;
      const i = state.diver;
      const bob = Math.sin(time * 1.6) * L.cell * 0.05;
      const cx = cellX(L, i) + L.cell / 2;
      const cy = cellY(L, i) + L.cell / 2 + bob;
      const s = L.cell * 0.34;
      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,.4)";
      ctx.shadowBlur = L.cell * 0.2;
      // Tank, then body, then mask -- a diver in silhouette, facing right.
      ctx.fillStyle = "#ffce3b";
      ctx.beginPath();
      ctx.roundRect(cx - s * 0.95, cy - s * 0.5, s * 0.5, s, s * 0.22);
      ctx.fill();
      ctx.fillStyle = "#12384a";
      ctx.beginPath();
      ctx.ellipse(cx, cy, s * 0.78, s * 0.6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#bdf3ea";
      ctx.beginPath();
      ctx.ellipse(cx + s * 0.34, cy - s * 0.1, s * 0.26, s * 0.2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // A trail of bubbles leaving the mask.
      ctx.fillStyle = "rgba(224,255,250,.5)";
      for (let k = 0; k < 3; k++) {
        const p = ((time * 0.5 + k / 3) % 1);
        ctx.globalAlpha = (1 - p) * 0.6;
        ctx.beginPath();
        ctx.arc(cx + s * 0.5 + Math.sin(p * 6 + k) * s * 0.2, cy - s * 0.4 - p * L.cell * 0.9, s * 0.12 * (1 - p * 0.4), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    /* ───────────────────────────────────────────────────────── overlays ── */

    // Where a shape may legally go. This is the one thing the digital version
    // does that paper cannot, so it is drawn to be seen: a bright wash and a
    // dotted edge that breathes, rather than a tint a player has to hunt for.
    function drawLegal(L) {
      if (!state.legal || !state.legal.size) return;
      const pulse = 0.5 + Math.sin(time * 2.4) * 0.5;
      ctx.save();
      ctx.fillStyle = "rgba(255,255,255," + (0.13 + pulse * 0.11).toFixed(3) + ")";
      for (const i of state.legal) {
        const x = cellX(L, i), y = cellY(L, i);
        ctx.beginPath();
        ctx.roundRect(x + L.cell * 0.06, y + L.cell * 0.06, L.cell * 0.88, L.cell * 0.88, L.cell * 0.18);
        ctx.fill();
      }
      // Outline the whole reachable region, not each square, so the shape of
      // what is open reads as one area.
      ctx.strokeStyle = "rgba(255,255,255," + (0.35 + pulse * 0.35).toFixed(3) + ")";
      ctx.lineWidth = Math.max(1.5, L.cell * 0.05);
      ctx.setLineDash([L.cell * 0.2, L.cell * 0.16]);
      ctx.lineDashOffset = -time * L.cell * 0.5;
      outline(L, [...state.legal], ctx.strokeStyle, ctx.lineWidth);
      ctx.restore();
    }

    // What the tutorial is talking about. Gold, because every other overlay on
    // this board is white or red, and it has to read as "look here" rather than
    // as another rule about where you may draw.
    function drawSpotlight(L) {
      if (!state.spotlight || !state.spotlight.size) return;
      const pulse = 0.5 + Math.sin(time * 3) * 0.5;
      ctx.save();
      ctx.fillStyle = "rgba(255,206,59," + (0.1 + pulse * 0.14).toFixed(3) + ")";
      for (const i of state.spotlight) fillCells(L, [i], ctx.fillStyle);
      outline(L, [...state.spotlight], "rgba(255,206,59," + (0.55 + pulse * 0.45).toFixed(3) + ")",
        Math.max(2, L.cell * 0.09));
      ctx.restore();
    }

    function drawPreview(L) {
      if (!state.preview) return;
      const ok = state.preview.ok;
      fillCells(L, state.preview.cells, ok ? "rgba(255,255,255,.34)" : "rgba(233,79,79,.34)");
      outline(L, state.preview.cells, ok ? "#ffffff" : "#e94f4f", Math.max(2.5, L.cell * 0.09));
    }

    function drawMarks(L) {
      for (const mark of state.marks) {
        const x = cellX(L, mark.cell), y = cellY(L, mark.cell);
        const pad = L.cell * 0.22;
        ctx.save();
        ctx.lineWidth = Math.max(2, L.cell * 0.08);
        ctx.lineCap = "round";
        if (mark.kind === "cross") {
          ctx.strokeStyle = "#ff6b6b";
          ctx.beginPath();
          ctx.moveTo(x + pad, y + pad);
          ctx.lineTo(x + L.cell - pad, y + L.cell - pad);
          ctx.moveTo(x + L.cell - pad, y + pad);
          ctx.lineTo(x + pad, y + L.cell - pad);
          ctx.stroke();
        } else {
          ctx.strokeStyle = mark.kind === "night" ? "#b39cff" : "#ffce3b";
          ctx.beginPath();
          ctx.ellipse(x + L.cell / 2, y + L.cell / 2, L.cell * 0.38, L.cell * 0.38, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.restore();
      }
    }

    // A short flourish where something was just caught: a ring and the points.
    function drawSplashes(L) {
      const now = time;
      state.splashes = state.splashes.filter((s) => now - s.at < 1.4);
      for (const s of state.splashes) {
        const p = (now - s.at) / 1.4;
        const x = cellX(L, s.cell) + L.cell / 2;
        const y = cellY(L, s.cell) + L.cell / 2;
        ctx.save();
        ctx.globalAlpha = 1 - p;
        ctx.strokeStyle = s.good ? "#ffce3b" : "#ff6b6b";
        ctx.lineWidth = Math.max(2, L.cell * 0.06);
        ctx.beginPath();
        ctx.arc(x, y, L.cell * (0.3 + p * 0.7), 0, Math.PI * 2);
        ctx.stroke();
        if (s.text) {
          ctx.fillStyle = s.good ? "#ffce3b" : "#ff6b6b";
          ctx.font = "800 " + Math.round(L.cell * 0.42) + "px system-ui, sans-serif";
          ctx.textAlign = "center";
          ctx.fillText(s.text, x, y - L.cell * (0.2 + p * 0.9));
        }
        ctx.restore();
      }
    }

    /* ───────────────────────────────────────────────────────── the loop ── */

    // The rock and the depth lines never move.
    //
    // Everything else on this board breathes -- the weed sways, the motes drift,
    // every creature idles on its own clock -- but the terrain is 484 squares of
    // per-cell fills and lips being redrawn sixty times a second to produce an
    // identical picture. It is rendered once into an offscreen canvas instead and
    // blitted, and only rebuilt when the layout it was drawn for changes: a
    // resize, a rotation, or the zoom button.
    const layoutKey = (L) =>
      [canvas.width, canvas.height, L.cell.toFixed(3), L.x.toFixed(2), L.y.toFixed(2)].join(":");

    let cached = null, cachedKey = "";
    function staticLayer(L) {
      const key = layoutKey(L);
      if (cached && cachedKey === key) return cached;
      cached = cached || document.createElement("canvas");
      cached.width = canvas.width;
      cached.height = canvas.height;
      cachedKey = key;
      // Point the drawing code at the offscreen surface, so the cache is built by
      // exactly the same functions that used to draw it live -- there is no
      // second implementation of the rock to drift out of step.
      const live = ctx;
      ctx = cached.getContext("2d");
      ctx.clearRect(0, 0, cached.width, cached.height);
      drawTerrain(L);
      drawDepthLines(L);
      ctx = live;
      return cached;
    }

    function draw() {
      const L = layout();
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      drawWater(L);
      ctx.drawImage(staticLayer(L), 0, 0);
      drawWeed(L);
      drawObjects(L);
      drawMarks(L);
      drawLegal(L);
      drawSpotlight(L);
      drawDives(L);
      drawDiver(L);
      drawPreview(L);
      drawSplashes(L);
      drawSurface(L);
    }

    let running = false;
    let raf = null;
    function frame(now) {
      time = (now - t0) / 1000;
      draw();
      if (running) raf = requestAnimationFrame(frame);
    }

    // A canvas has two sizes -- the CSS box it occupies and the pixel buffer it
    // draws into -- and they have to agree or the browser stretches one into the
    // other.
    function resize() {
      const rect = canvas.getBoundingClientRect();
      // A screen that is not showing measures 0x0, and sizing the buffer to that
      // throws the board away: coming back to it would flash blank before the
      // next resize rebuilt it.
      if (!rect.width || !rect.height) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(1, Math.round(rect.width * dpr));
      const h = Math.max(1, Math.round(rect.height * dpr));
      if (w === canvas.width && h === canvas.height) return;
      canvas.width = w;
      canvas.height = h;
      draw();
    }

    // Rotating an iPad fires `resize` on the window while the layout is still
    // mid-turn, so the buffer was being sized from the box the page was leaving
    // rather than the one it was arriving at -- and the browser then scaled that
    // wrongly-shaped bitmap into the new box, which is why every fish came out
    // slightly stretched and stayed that way until something else redrew.
    //
    // A ResizeObserver reports the box AFTER layout has settled, which is the
    // only moment the two sizes can be made to agree.
    const observer = typeof ResizeObserver === "function"
      ? new ResizeObserver(() => resize())
      : null;
    if (observer) observer.observe(canvas);

    return {
      state, draw, resize, cellAt, layout,
      // Say the board has changed, without insisting on a repaint.
      //
      // While the game screen is up the animation loop is already painting every
      // frame, so calling draw() from an input handler only rendered the same
      // frame twice -- and a drag on an iPad reports moves faster than the screen
      // refreshes, so it was two or three times over. This paints only when the
      // loop is not running, which is the one case where nothing else would.
      invalidate() { if (!running) draw(); },
      destroy() { if (observer) observer.disconnect(); },
      start() { if (running) return; running = true; t0 = performance.now() - time * 1000; raf = requestAnimationFrame(frame); },
      stop() { running = false; if (raf) cancelAnimationFrame(raf); raf = null; },
      splash(cell, text, good) { state.splashes.push({ cell, text, good: good !== false, at: time }); },
      setZoom(z) { view.zoom = Math.max(1, Math.min(3.5, z)); draw(); },
      pan(dx, dy) { view.panX += dx; view.panY += dy; draw(); },
      resetView() { view.zoom = 1; view.panX = 0; view.panY = 0; draw(); },
      get zoom() { return view.zoom; },
    };
  }

  return { create, DIVE_EDGE };
})();
