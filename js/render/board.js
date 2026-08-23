"use strict";
// Drawing the sheet.
//
// The board IS the printed gamesheet -- the real artwork, at full resolution,
// with the player's dive drawn over it. Redrawing the map in our own style was
// the alternative and would have been worse in every way that matters: this
// game's whole pleasure is the look of the thing, the map is the reason you
// want to play it, and a reimplementation would be a worse copy of a piece of
// art we already have.
//
// So the canvas is: the sheet image, a grid the player can point at, the boxes
// they have drawn, and nothing else. Everything the printed game asks you to
// mark with a pencil -- crossed-out coral, circled beacons, air spent -- is
// drawn as a mark ON the sheet, in the same places a pencil would go.

window.AQ = window.AQ || {};

AQ.Render = (() => {
  // Ink colours, chosen against the sheets' teal rather than from a palette:
  // a dive has to read clearly over both open water and dark rock.
  const INK = "#12232e";
  const DIVE_FILL = ["rgba(255,179,43,.30)", "rgba(67,198,90,.30)", "rgba(63,155,224,.30)"];
  const DIVE_EDGE = ["#ffb32b", "#43c65a", "#3f9be0"];
  const LEGAL = "rgba(255,255,255,.34)";
  const HOVER = "rgba(255,255,255,.72)";
  const BAD = "rgba(233,79,79,.45)";

  function create(canvas, board) {
    const ctx = canvas.getContext("2d");
    const sheet = new Image();
    let loaded = false;

    const view = {
      // The grid's position within the sheet image, as fractions of it, so the
      // same numbers work at any canvas size and for any of the five maps.
      grid: board.sheet.grid,
      // What part of the sheet is on screen. Panning and zooming move this,
      // never the canvas transform, so hit-testing stays a simple inverse.
      zoom: 1, panX: 0, panY: 0,
    };

    const state = {
      dives: [[], [], []],      // cells drawn, per dive
      preview: null,            // { cells, ok } while a shape is being dragged
      legal: null,              // Set of cells a legal shape could start from
      marks: [],                // { cell, kind } pencil marks on the sheet
      hover: null,
    };

    sheet.onload = () => { loaded = true; draw(); };
    sheet.src = board.sheet.image;

    // Where the play area sits on the canvas, in canvas pixels. The sheet is
    // letterboxed to fit, then zoom and pan are applied on top.
    function layout() {
      const cw = canvas.width, ch = canvas.height;
      const aspect = (sheet.naturalWidth || 3) / (sheet.naturalHeight || 4);
      let w = cw, h = cw / aspect;
      if (h > ch) { h = ch; w = ch * aspect; }
      w *= view.zoom; h *= view.zoom;
      const x = (cw - w) / 2 + view.panX;
      const y = (ch - h) / 2 + view.panY;
      return {
        x, y, w, h,
        cellW: w * view.grid.cell,
        cellH: h * view.grid.cellY,
        gridX: x + w * view.grid.x,
        gridY: y + h * view.grid.y,
      };
    }

    const cellRect = (L, i) => ({
      x: L.gridX + board.col(i) * L.cellW,
      y: L.gridY + board.row(i) * L.cellH,
      w: L.cellW, h: L.cellH,
    });

    // Canvas point -> cell index, or null if the point is off the grid.
    function cellAt(px, py) {
      const L = layout();
      const c = Math.floor((px - L.gridX) / L.cellW);
      const r = Math.floor((py - L.gridY) / L.cellH);
      return board.inBounds(c, r) ? board.index(c, r) : null;
    }

    function fillCells(ctx, L, cells, style) {
      ctx.fillStyle = style;
      for (const i of cells) {
        const r = cellRect(L, i);
        ctx.fillRect(r.x, r.y, r.w, r.h);
      }
    }

    // Outline the boundary of a set of cells rather than each cell, so a drawn
    // box reads as one shape the way a pencil line would.
    function outline(ctx, L, cells, style, width) {
      const set = new Set(cells);
      ctx.strokeStyle = style;
      ctx.lineWidth = width;
      ctx.lineJoin = "round";
      ctx.beginPath();
      for (const i of cells) {
        const c = board.col(i), r = board.row(i);
        const box = cellRect(L, i);
        if (!set.has(board.index(c, r - 1))) { ctx.moveTo(box.x, box.y); ctx.lineTo(box.x + box.w, box.y); }
        if (!set.has(board.index(c, r + 1))) { ctx.moveTo(box.x, box.y + box.h); ctx.lineTo(box.x + box.w, box.y + box.h); }
        if (!set.has(board.index(c - 1, r)) || c === 0) { ctx.moveTo(box.x, box.y); ctx.lineTo(box.x, box.y + box.h); }
        if (!set.has(board.index(c + 1, r)) || c === board.cols - 1) { ctx.moveTo(box.x + box.w, box.y); ctx.lineTo(box.x + box.w, box.y + box.h); }
      }
      ctx.stroke();
    }

    function draw() {
      const cw = canvas.width, ch = canvas.height;
      ctx.clearRect(0, 0, cw, ch);
      if (!loaded) return;
      const L = layout();
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(sheet, L.x, L.y, L.w, L.h);

      // Squares a legal shape could be drawn on, lifted slightly out of the
      // page. This is the rule the printed game leaves to the player and the
      // single biggest thing the digital version can do for them.
      if (state.legal && state.legal.size) fillCells(ctx, L, state.legal, LEGAL);

      state.dives.forEach((cells, d) => {
        if (!cells.length) return;
        fillCells(ctx, L, cells, DIVE_FILL[d]);
        outline(ctx, L, cells, DIVE_EDGE[d], Math.max(2, L.cellW * 0.07));
      });

      if (state.preview) {
        fillCells(ctx, L, state.preview.cells, state.preview.ok ? HOVER : BAD);
        outline(ctx, L, state.preview.cells, state.preview.ok ? "#fff" : "#e94f4f", Math.max(2, L.cellW * 0.09));
      }

      for (const mark of state.marks) drawMark(ctx, L, mark);
    }

    // A pencil mark on the sheet: a cross through something that will not
    // score, a ring around something that will.
    function drawMark(ctx, L, mark) {
      const box = cellRect(L, mark.cell);
      const pad = box.w * 0.22;
      ctx.lineWidth = Math.max(2, box.w * 0.08);
      ctx.lineCap = "round";
      if (mark.kind === "cross") {
        ctx.strokeStyle = "#e94f4f";
        ctx.beginPath();
        ctx.moveTo(box.x + pad, box.y + pad);
        ctx.lineTo(box.x + box.w - pad, box.y + box.h - pad);
        ctx.moveTo(box.x + box.w - pad, box.y + pad);
        ctx.lineTo(box.x + pad, box.y + box.h - pad);
        ctx.stroke();
      } else {
        ctx.strokeStyle = mark.kind === "night" ? "#8f7bd8" : "#ffb32b";
        ctx.beginPath();
        ctx.ellipse(box.x + box.w / 2, box.y + box.h / 2, box.w * 0.36, box.h * 0.36, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    function resize() {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      draw();
    }

    return {
      state, draw, resize, cellAt, layout, cellRect,
      get ready() { return loaded; },
      setZoom(z, cx, cy) {
        const before = layout();
        view.zoom = Math.max(1, Math.min(4, z));
        const after = layout();
        // Keep the point under the fingers where it was.
        if (cx !== undefined) {
          view.panX += (cx - before.x) * (1 - after.w / before.w);
          view.panY += (cy - before.y) * (1 - after.h / before.h);
        }
        draw();
      },
      pan(dx, dy) { view.panX += dx; view.panY += dy; draw(); },
      resetView() { view.zoom = 1; view.panX = 0; view.panY = 0; draw(); },
      get zoom() { return view.zoom; },
    };
  }

  return { create, DIVE_EDGE, INK };
})();
