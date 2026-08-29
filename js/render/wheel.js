"use strict";
// The turn track: a wheel of 24 ticks, half day and half night.
//
// This is the piece of the printed sheet the first build left out, and it
// turns out to be the one that explains the game. A die at setup decides where
// on the wheel you join it, and from there you walk clockwise for 24 turns --
// so the roll is not flavour, it decides how your game splits between daylight
// and dark, and therefore whether the stingrays or the cuttlefish are the ones
// you can afford to chase. Without the wheel on screen a player has a "day" or
// "night" badge and no idea how long it lasts.
//
// Drawn rather than laid out in DOM: it is a ring of 24 wedges with a marker
// that has to sit exactly on one of them, which is a page of CSS or four lines
// of arc().

window.AQ = window.AQ || {};

AQ.Wheel = (() => {
  const DAY_FILL = "#ffce3b";
  const DAY_DIM = "#5c5330";
  const NIGHT_FILL = "#b39cff";
  const NIGHT_DIM = "#3b3654";
  const INK = "#eaf6f4";

  function create(canvas, wheel) {
    const ctx = canvas.getContext("2d");
    const ticks = wheel.ticks || 24;
    const [dayFrom, dayTo] = wheel.dayTicks || [0, 11];
    const starts = wheel.starts || [0, 4, 8, 12, 16, 20];
    const isDayTick = (t) => t >= dayFrom && t <= dayTo;

    let state = { tick: 0, played: 0, startTick: 0 };

    // Same two sizes as the board, and the same trap: a buffer measured while a
    // rotation is still settling gets stretched into the box that arrives.
    function resize() {
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;   // a screen that is not showing
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(1, Math.round(rect.width * dpr));
      const h = Math.max(1, Math.round(rect.height * dpr));
      if (w === canvas.width && h === canvas.height) return;
      canvas.width = w;
      canvas.height = h;
      draw();
    }

    const observer = typeof ResizeObserver === "function"
      ? new ResizeObserver(() => resize())
      : null;
    if (observer) observer.observe(canvas);

    function draw() {
      const w = canvas.width, h = canvas.height;
      if (!w || !h) return;
      ctx.clearRect(0, 0, w, h);
      const cx = w / 2, cy = h / 2;
      const outer = Math.min(w, h) / 2 - 2;
      const inner = outer * 0.62;

      // Twelve o'clock is tick 0, and the track runs clockwise from there --
      // the same way round as the printed wheel.
      const angleOf = (t) => -Math.PI / 2 + (t / ticks) * Math.PI * 2;
      const step = (Math.PI * 2) / ticks;

      for (let t = 0; t < ticks; t++) {
        const from = angleOf(t) + step * 0.08;
        const to = angleOf(t) + step * 0.92;
        const day = isDayTick(t);
        // A tick is lit once it has been played, so the wheel fills in behind
        // you and the remaining daylight is visible at a glance.
        const done = played(t);
        ctx.beginPath();
        ctx.arc(cx, cy, outer, from, to);
        ctx.arc(cx, cy, inner, to, from, true);
        ctx.closePath();
        ctx.fillStyle = done ? (day ? DAY_FILL : NIGHT_FILL) : (day ? DAY_DIM : NIGHT_DIM);
        ctx.fill();
      }

      // The six entry points the setup die chooses between.
      ctx.font = "700 " + Math.round(outer * 0.24) + "px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      starts.forEach((t, i) => {
        const a = angleOf(t) + step / 2;
        const r = outer * 1.0 - (outer - inner) / 2;
        ctx.fillStyle = t === state.startTick ? INK : "rgba(234,246,244,.45)";
        ctx.fillText(String(i + 1), cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      });

      // Sun and moon, on their own halves.
      const midDay = angleOf((dayFrom + dayTo) / 2) + step / 2;
      const midNight = midDay + Math.PI;
      const iconR = inner * 0.58;
      sun(ctx, cx + Math.cos(midDay) * iconR, cy + Math.sin(midDay) * iconR, inner * 0.24);
      moon(ctx, cx + Math.cos(midNight) * iconR, cy + Math.sin(midNight) * iconR, inner * 0.24);

      // Where you are now: a pointer on the current tick.
      const a = angleOf(state.tick) + step / 2;
      ctx.save();
      ctx.translate(cx + Math.cos(a) * (outer * 1.0), cy + Math.sin(a) * (outer * 1.0));
      ctx.rotate(a + Math.PI / 2);
      ctx.beginPath();
      ctx.moveTo(0, -outer * 0.02);
      ctx.lineTo(-outer * 0.13, -outer * 0.28);
      ctx.lineTo(outer * 0.13, -outer * 0.28);
      ctx.closePath();
      ctx.fillStyle = INK;
      ctx.fill();
      ctx.restore();

      // Turns remaining, in the middle where the eye lands.
      const left = Math.max(0, (wheel.turns || 24) - state.played);
      ctx.fillStyle = INK;
      ctx.font = "800 " + Math.round(inner * 0.62) + "px system-ui, sans-serif";
      ctx.fillText(String(left), cx, cy - inner * 0.08);
      ctx.fillStyle = "rgba(234,246,244,.6)";
      ctx.font = "600 " + Math.round(inner * 0.24) + "px system-ui, sans-serif";
      ctx.fillText("left", cx, cy + inner * 0.36);
    }

    // Has this tick been walked over yet? The track wraps, so "played" is a
    // distance from where you joined rather than a comparison of indices.
    function played(t) {
      const from = state.startTick;
      const d = (t - from + ticks) % ticks;
      return d < state.played;
    }

    function sun(c, x, y, r) {
      c.save();
      c.strokeStyle = DAY_FILL;
      c.fillStyle = DAY_FILL;
      c.lineWidth = Math.max(1, r * 0.16);
      c.beginPath();
      c.arc(x, y, r * 0.52, 0, Math.PI * 2);
      c.fill();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        c.beginPath();
        c.moveTo(x + Math.cos(a) * r * 0.78, y + Math.sin(a) * r * 0.78);
        c.lineTo(x + Math.cos(a) * r * 1.05, y + Math.sin(a) * r * 1.05);
        c.stroke();
      }
      c.restore();
    }

    function moon(c, x, y, r) {
      c.save();
      c.fillStyle = NIGHT_FILL;
      c.beginPath();
      c.arc(x, y, r * 0.8, 0, Math.PI * 2);
      c.fill();
      // Bite a crescent out with the background colour behind the dial.
      c.globalCompositeOperation = "destination-out";
      c.beginPath();
      c.arc(x + r * 0.42, y - r * 0.24, r * 0.72, 0, Math.PI * 2);
      c.fill();
      c.restore();
    }

    return {
      resize, draw,
      destroy() { if (observer) observer.disconnect(); },
      set(next) { Object.assign(state, next); draw(); },
      get state() { return state; },
    };
  }

  return { create };
})();
