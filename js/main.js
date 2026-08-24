"use strict";
// Wiring: screens, the dive itself, and what happens when it ends.
//
// The turn is the whole interface. Roll, choose which die to take, drag out a
// box, and the box is drawn -- with the game showing which squares are legal
// before a finger goes anywhere near them. That highlighting is the point of
// the adaptation: on paper the no-touching-a-previous-dive rule is policed by
// the player, badly, and here it simply cannot be broken.

(() => {
  const el = (id) => document.getElementById(id);
  const UI = GK.UI;

  const app = {
    profile: null,
    mapId: null,
    board: null,
    rules: null,
    state: null,
    render: null,
    option: null,       // the die choice being drawn with
    drag: null,         // { from, to } while dragging out a rectangle
    painted: null,      // Set of cells, for the freeform shape doubles allow
    bonuses: [],        // shipwreck bonuses circled this game
    progress: null,     // whatever this map tracks of its own
  };

  /* ─────────────────────────────────────────── profiles and map choice ── */

  GK.Profiles.init({
    storage: Storage,
    listEl: "gk-profile-list",
    addLabel: "New diver",
    avatars: ["🐠", "🐟", "🐡", "🦑", "🐙", "🦈", "🐢", "🦀", "🐳", "🦞", "🐬", "🪼"],
    maxNameLen: 12,
    meta: (profile, progress) => {
      const maps = Object.values((progress || {}).maps || {});
      if (!maps.length) return "no dives yet";
      const dives = maps.reduce((a, m) => a + (m.plays || 0), 0);
      const best = Math.max.apply(null, maps.map((m) => m.best || 0));
      return dives + " dive" + (dives === 1 ? "" : "s") + " · best " + best;
    },
    onEnter: (profile) => {
      app.profile = profile;
      el("aq-who").textContent = profile.avatar + " " + profile.name;
      renderMaps();
      UI.showScreen("maps");
    },
  });

  function renderMaps() {
    const progress = Storage.getProgress(app.profile.id);
    const wrap = el("aq-maps");
    wrap.innerHTML = "";
    for (const map of AQ.Maps.LIST) {
      const record = ((progress.maps || {})[map.id]) || {};
      const card = document.createElement("button");
      card.className = "aq-map" + (map.ready ? "" : " aq-map-soon");
      card.disabled = !map.ready;
      card.innerHTML =
        '<span class="aq-map-n">' + String(map.n).padStart(2, "0") + "</span>" +
        '<span class="aq-map-body"><strong>' + map.name + "</strong>" +
        '<span class="aq-map-blurb">' + map.blurb + "</span></span>" +
        '<span class="aq-map-best">' +
          (map.ready
            ? (record.plays ? (record.medal ? medalDot(record.medal) : "") + "best " + record.best : "new")
            : "soon") +
        "</span>";
      card.onclick = () => startGame(map.id);
      wrap.appendChild(card);
    }
  }

  const medalDot = (m) => '<span class="aq-medal aq-medal-' + m + '"></span>';

  /* ──────────────────────────────────────────────────────── a new dive ── */

  async function startGame(mapId) {
    app.mapId = mapId;
    el("aq-mapname").textContent = AQ.Maps.info(mapId).name;
    UI.showScreen("game");
    try {
      app.board = await AQ.Maps.load(mapId);
    } catch (err) {
      UI.toast("Could not load that map");
      UI.showScreen("maps");
      return;
    }
    await AQ.Sprites.load();
    app.rules = AQ.Maps.rulesFor(mapId);
    app.bonuses = [];

    const seed = GK.util.seedFrom(mapId + ":" + Date.now() + ":" + Math.random());
    const rng = GK.util.seededRand(seed);
    // Each map keeps its own running state -- torches, research tracks, photo
    // powers, fossils quarried -- and hands the engine the hooks that read it.
    app.progress = app.rules.newProgress ? app.rules.newProgress() : null;
    const rules = app.rules.hooks ? app.rules.hooks(app.progress, app.board) : {};
    app.state = AQ.State.create(app.board, rng, { rules });
    app.state.seed = seed;

    if (app.render) app.render.stop();
    app.render = AQ.Render.create(el("aq-board"), app.board);
    app.render.resize();
    app.render.start();
    bindBoard();
    refresh();
    UI.toast("Turn wheel enters at " + app.state.startFace);
  }

  /* ─────────────────────────────────────────────────────────── the HUD ── */

  function refresh() {
    const s = app.state;
    el("aq-turn").textContent = Math.min(s.turn + 1, s.turns);
    el("aq-phase").textContent = AQ.State.isDay(s) ? "☀ day" : "☾ night";
    el("aq-phase").className = "aq-phase " + (AQ.State.isDay(s) ? "is-day" : "is-night");
    renderTanks();
    renderDice();
    el("aq-score").textContent = app.rules.score(s, app.bonuses, app.progress).total;

    app.render.state.dives = s.diveCells.map((cells) => cells.slice());
    while (app.render.state.dives.length < 3) app.render.state.dives.push([]);
    app.render.state.dive = s.dive;
    // The diver sits on the deepest square of the shape drawn last turn, which
    // is where the next box has to connect to.
    app.render.state.diver = s.lastShape && s.lastShape.length
      ? s.lastShape.reduce((a, i) => (app.board.row(i) > app.board.row(a) ? i : a), s.lastShape[0])
      : null;
    app.render.draw();

    el("btn-roll").hidden = !!s.roll || s.over;
    el("btn-surface").hidden = !s.roll || !s.diveCells[s.dive].length || s.dive >= AQ.State.DIVES - 1;
    if (s.over) finish();
  }

  function renderTanks() {
    const s = app.state;
    const wrap = el("aq-tanks");
    wrap.innerHTML = "";
    s.tanks.forEach((capacity, d) => {
      const tank = document.createElement("div");
      tank.className = "aq-tank" + (d === s.dive ? " is-current" : "") + (d < s.dive ? " is-done" : "");
      for (let i = 0; i < capacity; i++) {
        const pip = document.createElement("i");
        if (i < s.spent[d]) pip.className = "spent";
        tank.appendChild(pip);
      }
      wrap.appendChild(tank);
    });
  }

  function renderDice() {
    const s = app.state;
    el("aq-dice").innerHTML = s.roll
      ? s.roll.map((d) => '<span class="aq-die">' + d + "</span>").join("")
      : "";
    const wrap = el("aq-choices");
    wrap.innerHTML = "";
    if (!s.roll) return;
    for (const option of AQ.State.options(s)) {
      const button = document.createElement("button");
      button.className = "aq-choice" + (app.option && app.option.id === option.id ? " is-picked" : "");
      button.innerHTML = "<strong>" + option.size + "</strong><span>" + option.label +
        (option.note ? "<em>" + option.note + "</em>" : "") + "</span>";
      button.onclick = () => chooseOption(option);
      wrap.appendChild(button);
    }
  }

  /* ──────────────────────────────────────────── choosing and drawing ──── */

  function chooseOption(option) {
    app.option = option;
    app.painted = option.freeform ? new Set() : null;
    app.drag = null;
    // Show every square a legal shape could cover. Not every legal shape --
    // that would be a mess of overlapping highlights -- but the union of them,
    // which is what a player actually wants to know.
    const legal = AQ.Shapes.legalRectangles(app.board, placementOpts());
    const union = new Set();
    for (const cells of legal) for (const i of cells) union.add(i);
    app.render.state.legal = union;
    app.render.state.preview = null;
    renderDice();
    hint(option.freeform
      ? "Doubles: paint any " + option.size + " connected squares"
      : "Drag out a box of " + option.size);
    app.render.draw();
  }

  const placementOpts = () => ({
    size: app.option.size,
    freeform: app.option.freeform,
    occupied: app.state.occupied,
    lastShape: app.state.lastShape,
    previousDives: app.state.previousDives,
  });

  function rectBetween(a, b) {
    const board = app.board;
    const c0 = Math.min(board.col(a), board.col(b)), c1 = Math.max(board.col(a), board.col(b));
    const r0 = Math.min(board.row(a), board.row(b)), r1 = Math.max(board.row(a), board.row(b));
    const cells = [];
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) cells.push(board.index(c, r));
    return cells;
  }

  function preview(cells) {
    if (!cells || !cells.length) { app.render.state.preview = null; app.render.draw(); return; }
    const why = AQ.Shapes.reject(app.board, cells, placementOpts());
    app.render.state.preview = { cells, ok: !why };
    hint(why ? capitalise(why) : costLine(cells));
    app.render.draw();
  }

  function costLine(cells) {
    const cost = AQ.State.costOf(app.state, cells, app.option);
    if (cost.free) return "Air bubble — this turn is free";
    if (!cost.air) return "Costs nothing";
    return "Costs " + cost.air + " air (" + cost.reasons.join(", ") + ")";
  }

  const capitalise = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const hint = (text) => { el("aq-hint").textContent = text; };

  function commit(cells) {
    const before = AQ.Scoring.collect(app.state).caught.length;
    const result = AQ.State.place(app.state, cells, app.option);
    if (!result.ok) { UI.toast(capitalise(result.why)); return; }
    GK.Sfx.click();
    app.option = null;
    app.painted = null;
    app.render.state.legal = null;
    app.render.state.preview = null;
    markSheet();
    flourish(before);
    offerWreckBonus();
    refresh();
    if (!app.state.over) hint("Roll for the next turn");
  }

  // Ring whatever this box just caught, and say what it was worth. On paper
  // you find out at the end; here the board can tell you as it happens, which
  // is most of the difference between a score sheet and a game.
  function flourish(before) {
    const { caught } = AQ.Scoring.collect(app.state);
    for (const entry of caught.slice(before)) {
      const cell = entry.object.cells[0];
      const bad = entry.symbol === "jellyfish" || entry.symbol === "shark";
      app.render.splash(cell, LABEL[entry.symbol] || "", !bad);
    }
    if (caught.length > before) GK.Sfx.coin();
  }

  const LABEL = {
    fish: "shoal", jellyfish: "−2", stingray: "+5", cuttlefish: "+5",
    "coral-purple": "+2", "coral-orange": "+2", beacon: "beacon",
    flag: "flag", wreck: "wreck!", bubbles: "air", shark: "−3",
    squid: "+10", penguin: "+7", vent: "vent", "glass-squid": "+5",
  };

  // Draw the pencil marks the printed game asks for: a cross through anything
  // caught at the wrong time of day, a ring around each beacon so its pair is
  // visible at a glance.
  function markSheet() {
    const marks = [];
    const { caught } = AQ.Scoring.collect(app.state);
    for (const entry of caught) {
      const cell = entry.object.cells[0];
      if (entry.symbol === "stingray" && !entry.day) marks.push({ cell, kind: "cross" });
      if (entry.symbol === "cuttlefish" && entry.day) marks.push({ cell, kind: "cross" });
      if (entry.symbol === "beacon") marks.push({ cell, kind: entry.day ? "day" : "night" });
    }
    app.render.state.marks = marks;
  }

  function offerWreckBonus() {
    if (!app.rules.WRECK_BONUSES || !app.rules.WRECK_BONUSES.length) return;
    const { caught } = AQ.Scoring.collect(app.state);
    const wrecks = caught.filter((e) => e.symbol === "wreck").length;
    if (wrecks <= app.bonuses.length) return;
    const taken = new Set(app.bonuses);
    const list = el("aq-bonus-list");
    list.innerHTML = "";
    for (const bonus of app.rules.WRECK_BONUSES) {
      const button = document.createElement("button");
      button.className = "aq-bonus";
      button.disabled = taken.has(bonus.id);
      button.textContent = bonus.label;
      button.onclick = () => {
        app.bonuses.push(bonus.id);
        UI.closeModal("modal-bonus");
        refresh();
      };
      list.appendChild(button);
    }
    UI.openModal("modal-bonus");
  }

  /* ──────────────────────────────────────────────────── board handling ── */

  function bindBoard() {
    const canvas = el("aq-board");
    let pointer = null;

    const at = (event) => {
      const rect = canvas.getBoundingClientRect();
      const dpr = canvas.width / rect.width;
      return app.render.cellAt((event.clientX - rect.left) * dpr, (event.clientY - rect.top) * dpr);
    };

    canvas.onpointerdown = (event) => {
      if (!app.option) { hint("Choose which die to take first"); return; }
      const cell = at(event);
      if (cell === null) return;
      canvas.setPointerCapture(event.pointerId);
      if (app.painted) {
        togglePainted(cell);
      } else {
        pointer = cell;
        app.drag = { from: cell, to: cell };
        preview(rectBetween(cell, cell));
      }
    };

    canvas.onpointermove = (event) => {
      if (!app.option) return;
      const cell = at(event);
      if (cell === null) return;
      if (app.drag && pointer !== null) {
        app.drag.to = cell;
        preview(rectBetween(app.drag.from, cell));
      }
    };

    canvas.onpointerup = () => {
      pointer = null;
      if (!app.drag) return;
      const cells = rectBetween(app.drag.from, app.drag.to);
      app.drag = null;
      // A drag that ends on a legal shape commits it. Anything else stays as a
      // preview with the reason showing, so the player can adjust rather than
      // start again.
      if (!AQ.Shapes.reject(app.board, cells, placementOpts())) commit(cells);
    };

    function togglePainted(cell) {
      if (app.painted.has(cell)) app.painted.delete(cell);
      else app.painted.add(cell);
      const cells = [...app.painted];
      preview(cells);
      if (cells.length === app.option.size && !AQ.Shapes.reject(app.board, cells, placementOpts())) commit(cells);
    }

    window.addEventListener("resize", () => app.render.resize());
    el("aq-zoom").onclick = () => {
      app.render.setZoom(app.render.zoom >= 2 ? 1 : 2);
    };
  }

  /* ───────────────────────────────────────────────── turns and endings ── */

  el("btn-roll").onclick = () => {
    AQ.State.rollDice(app.state);
    app.option = null;
    app.render.state.legal = null;
    GK.Sfx.click();
    refresh();
    const options = AQ.State.options(app.state);
    if (options.length === 1) chooseOption(options[0]);
    else hint("Take the low die or pay for the high one");
  };

  el("btn-surface").onclick = () => {
    const result = AQ.State.surface(app.state);
    if (!result.ok) { UI.toast(capitalise(result.why)); return; }
    app.option = null;
    app.render.state.legal = null;
    UI.toast("Surfaced — the rest of the tank is gone");
    refresh();
  };

  el("btn-again").onclick = () => startGame(app.mapId);
  el("btn-logbook").onclick = () => { renderLogbook(); UI.showScreen("logbook"); };
  el("btn-rules").onclick = () => { el("aq-rules-body").innerHTML = RULES_HTML; UI.openModal("modal-rules"); };

  function finish() {
    const result = app.rules.score(app.state, app.bonuses, app.progress);
    const entry = {
      at: Date.now(),
      score: result.total,
      rank: result.rank,
      medal: result.solo.medal,
      passed: result.solo.passed,
      seed: app.state.seed,
      depths: result.solo.depths,
      breakdown: result.lines.map((l) => ({ key: l.key, points: l.points })),
    };
    Storage.logDive(app.profile.id, app.mapId, entry);

    el("aq-result-map").textContent = AQ.Maps.info(app.mapId).name;
    el("aq-result").innerHTML =
      '<div class="aq-verdict ' + (result.solo.passed ? "is-pass" : "is-fail") + '">' +
        '<span class="aq-total">' + result.total + "</span>" +
        "<strong>" + (result.rank || "") + "</strong>" +
        "<em>" + verdictLine(result.solo) + "</em>" +
      "</div>" +
      '<table class="aq-breakdown">' +
        result.lines.map((l) =>
          "<tr><th>" + l.label + "</th><td>" + l.points + "</td><td>" + (l.detail || "") + "</td></tr>").join("") +
      "</table>";
    UI.showScreen("result");
  }

  function verdictLine(solo) {
    if (!solo.passed) return "The expedition failed — every dive must pass the first mark";
    if (solo.medal === "gold") return "Gold: all three dives reached the deepest mark";
    if (solo.medal === "silver") return "Silver: all three dives reached the second mark";
    return "All three dives passed the first mark";
  }

  function renderLogbook() {
    const progress = Storage.getProgress(app.profile.id);
    const wrap = el("aq-logbook");
    wrap.innerHTML = "";
    for (const map of AQ.Maps.LIST) {
      const record = ((progress.maps || {})[map.id]) || null;
      const table = Storage.leaderboard(map.id);
      if (!record && !table.length) continue;
      const section = document.createElement("section");
      section.className = "aq-log-map";
      section.innerHTML =
        "<h3>" + map.name + "</h3>" +
        (table.length
          ? '<table class="aq-scores"><tbody>' + table.map((row, i) =>
              "<tr><td>" + (i + 1) + "</td><td>" + row.avatar + " " + row.name + "</td>" +
              "<td>" + row.best + "</td><td>" + (row.medal ? medalDot(row.medal) : "") + "</td>" +
              "<td>" + row.plays + " dive" + (row.plays === 1 ? "" : "s") + "</td></tr>").join("") +
            "</tbody></table>"
          : "") +
        (record && record.log && record.log.length
          ? '<ol class="aq-history">' + record.log.map((e) =>
              "<li><span>" + new Date(e.at).toLocaleDateString() + "</span>" +
              "<strong>" + e.score + "</strong>" +
              "<em>" + (e.rank || "") + (e.medal ? " · " + e.medal : "") + "</em></li>").join("") + "</ol>"
          : "");
      wrap.appendChild(section);
    }
    if (!wrap.children.length) wrap.innerHTML = "<p class='aq-empty'>No dives logged yet.</p>";
  }

  const RULES_HTML = [
    "<h3>How a dive works</h3>",
    "<p>Twenty-four turns, split between day and night. Each turn two dice are",
    "rolled and you take <strong>one</strong> of them: draw a box enclosing that",
    "many squares. Taking the higher die costs air equal to the difference.</p>",
    "<p>Roll doubles and you get two squares more than the number shown, no air,",
    "and the only chance you get to draw something other than a rectangle.</p>",
    "<p>A dive starts in one of the four squares under a boat and continues from",
    "the box you drew <em>last turn</em>. It can never overlap a rock, and it can",
    "never so much as touch a corner of an earlier dive.</p>",
    "<p>Below the &minus;1 AIR line every turn costs an extra breath; below",
    "&minus;2 AIR it costs two. Enclose an air bubble and the whole turn is free.</p>",
    "<p>You get three dives and three tanks. Solo, every one of them has to get",
    "below the first mark on the right or the expedition has failed — reach the",
    "second or third on all three for silver and gold.</p>",
    "<p class='aq-modal-credit'>Aquamarine is a print-and-play game by Postmark",
    "Games, designed by Matthew Dunstan and Rory Muldoon. This is an unofficial",
    "adaptation, not affiliated with or endorsed by them.</p>",
    '<button class="btn btn-grey" onclick="GK.UI.closeModal(\'modal-rules\')">Close</button>',
  ].join(" ");

  document.addEventListener("click", (event) => {
    const target = event.target.closest("[data-screen]");
    if (target) UI.showScreen(target.dataset.screen);
  });

  // Developer tools behind ?debug=1. Playing 24 turns by hand to see the
  // result screen is the kind of check that gets skipped, so the panel can
  // play them: one turn at a time to watch the board fill, or the whole
  // expedition at once to land on the scoring. gamekit turns progress writes
  // off while debug is on, so none of this reaches a real logbook.
  function autoTurn() {
    const s = app.state;
    if (s.over) return "the expedition is already over";
    if (!s.roll) AQ.State.rollDice(s);
    for (const option of AQ.State.options(s)) {
      app.option = option;
      const legal = AQ.Shapes.legalRectangles(app.board, placementOpts());
      if (!legal.length) continue;
      // Deepest first, so an auto-played game actually finishes its dives
      // rather than paddling about in the shallows for 24 turns.
      legal.sort((a, b) => Math.max(...b.map(app.board.row)) - Math.max(...a.map(app.board.row)));
      commit(legal[0]);
      return "turn " + s.turn + ", dive " + (s.dive + 1);
    }
    AQ.State.pass(s);
    refresh();
    return "passed";
  }

  GK.Debug.init({ storage: Storage, title: "AQUAMARINE" })
    .action("play a turn", () => (app.state ? autoTurn() : "start a dive first"))
    .action("play the whole expedition", () => {
      if (!app.state) return "start a dive first";
      let guard = 0;
      while (!app.state.over && guard++ < 200) autoTurn();
      return "finished on turn " + app.state.turn;
    })
    .action("surface now", () => {
      if (!app.state) return "start a dive first";
      const r = AQ.State.surface(app.state);
      refresh();
      return r.ok ? "surfaced" : r.why;
    });

  UI.onScreenChange = (name) => {
    if (!app.render) return;
    if (name === "game") app.render.start(); else app.render.stop();
  };

  GK.Sfx.enabled = Storage.getSettings().sound !== false;
  UI.bindSoundToggle(Storage);
  UI.bindMenuClicks();
  GK.initPWA({ appName: "Aquamarine" });
  GK.Profiles.renderList();

  // Firestore arrives late or not at all, and the game is fully playable
  // either way -- so the roster is drawn from localStorage first and redrawn
  // if the family's other devices turn out to be reachable.
  Storage.initFirebase().then((online) => {
    if (online && UI.screen === "profiles") GK.Profiles.renderList();
    if (online && UI.screen === "maps" && app.profile) renderMaps();
  });
})();
