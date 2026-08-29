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
    wheel: null,        // the day/night turn track
    undo: null,         // snapshot of the state before the last box
    canUndo: false,
    awaitingBonus: false, // the wreck chooser is open and the game must wait
    coach: null,        // the tutorial, when one is running
    teaching: false,    // this game IS the tutorial, coach dismissed or not
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

  async function startGame(mapId, teaching) {
    app.mapId = mapId;
    app.coach = null;
    app.teaching = !!teaching;
    el("aq-mapname").textContent = teaching ? "Learn to dive" : AQ.Maps.info(mapId).name;
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
    // The tutorial needs particular dice to make particular points, so it plays
    // through a generator it can prompt. Past the end of the script it falls
    // back to the seeded one and the game is an ordinary game again.
    const rng = teaching
      ? AQ.Tutorial.scriptedRng(GK.util.seededRand(seed))
      : GK.util.seededRand(seed);
    // Each map keeps its own running state -- torches, research tracks, photo
    // powers, fossils quarried -- and hands the engine the hooks that read it.
    app.progress = app.rules.newProgress ? app.rules.newProgress() : null;
    const rules = app.rules.hooks ? app.rules.hooks(app.progress, app.board) : {};
    app.state = AQ.State.create(app.board, rng, {
      rules,
      startFace: teaching ? AQ.Tutorial.START_FACE : undefined,
    });
    app.state.seed = seed;

    if (app.render) { app.render.stop(); app.render.destroy(); }
    if (app.wheel) app.wheel.destroy();
    app.render = AQ.Render.create(el("aq-board"), app.board);
    app.render.resize();
    app.render.start();
    app.wheel = AQ.Wheel.create(el("aq-wheel"),
      Object.assign({ turns: app.state.turns }, app.state.wheel));
    app.wheel.resize();
    app.canUndo = false;
    app.undo = null;
    app.awaitingBonus = false;
    bindBoard();
    refresh();
    if (teaching) {
      app.coach = AQ.Tutorial.begin({
        app,
        redrawChoices: refresh,
        leave: () => { app.coach = null; UI.showScreen("maps"); },
      });
      // Showing the first card asks the game to redraw its buttons, and at that
      // moment app.coach is still unassigned -- so step one alone would come up
      // with every button live. One more refresh, now that it is set.
      refresh();
      hint("Follow the card on the board.");
    } else {
      hint("Roll to begin. You join the turn wheel at " + app.state.startFace + ".");
    }
  }

  /* ─────────────────────────────────────────────────────────── the HUD ── */

  function refresh() {
    const s = app.state;
    const day = AQ.State.isDay(s);
    el("aq-phase").textContent = day ? "day" : "night";
    el("aq-phase").className = "aq-phase " + (day ? "is-day" : "is-night");
    if (app.wheel) app.wheel.set({
      tick: AQ.State.tickOf(s), played: Math.min(s.turn, s.turns), startTick: s.startTick,
    });
    renderTanks();
    renderDice();
    renderBonuses();
    renderHours(day);
    el("aq-score").textContent = app.rules.score(s, app.bonuses, app.progress).total;

    app.render.state.dives = s.diveCells.map((cells) => cells.slice());
    while (app.render.state.dives.length < 3) app.render.state.dives.push([]);
    app.render.state.dive = s.dive;
    // The diver sits on the deepest square of the shape drawn last turn, which
    // is where the next box has to connect to.
    app.render.state.diver = s.lastShape && s.lastShape.length
      ? s.lastShape.reduce((a, i) => (app.board.row(i) > app.board.row(a) ? i : a), s.lastShape[0])
      : null;
    app.render.invalidate();

    // While the tutorial is running there is exactly one thing to press, so a
    // button the current step is not asking for stays hidden. Undo is the
    // exception it makes no sense to offer: the script would carry on from a
    // turn that had been taken back.
    const coach = app.coach;
    el("btn-roll").hidden = !!s.roll || s.over || (coach && !coach.canRoll());
    el("btn-surface").hidden = !s.roll || !s.diveCells[s.dive].length
      || s.dive >= AQ.State.DIVES - 1 || (coach && !coach.canSurface());
    el("btn-undo").hidden = !app.canUndo || s.over || !!coach;
    // Finishing a shipwreck on the LAST turn opens the bonus chooser at the same
    // moment the game ends. Scoring straight through would leave the chooser
    // floating over the result sheet and the bonus you then picked worth nothing
    // -- it was already counted, without it. So the ending waits for the answer.
    if (s.over && !app.awaitingBonus) finish();
  }

  // Which creatures this hour is paying for.
  //
  // The rule costs people points quietly: catch a cuttlefish in daylight and it
  // is simply crossed out, and on paper you find that out after you have spent
  // the air getting to it. Two showings of one fact -- the board fades whatever
  // is asleep, and these chips name it -- both from a single call to the map's
  // own rules, so the dimming and the legend cannot drift apart.
  function renderHours(isDay) {
    const wrap = el("aq-hours");
    const hours = app.rules.hours ? app.rules.hours(app.board, isDay) : null;
    if (!hours) {
      wrap.hidden = true;
      app.render.state.dormant = null;
      return;
    }
    wrap.hidden = false;
    wrap.innerHTML = hours.chips.map((c) => {
      // A map may word its own, because a rule about WHERE something counts does
      // not fit the sentence for a rule about WHEN.
      const why = c.title || (c.active
        ? "counting right now"
        : "nothing until " + (isDay ? "dark" : "daylight"));
      return '<span class="aq-hour' + (c.active ? " is-on" : "") + '" title="' + why + '">' +
        AQ.Icons.img(c.symbol, app.mapId, "aq-hour-pic") +
        (c.note ? '<em>' + c.note + "</em>" : "") + "</span>";
    }).join("");
    app.render.state.dormant = hours.dormant;
  }

  // Air, crossed off the way a pencil would.
  //
  // `spentBefore` is what the tanks looked like a moment ago, so a breath just
  // taken can draw its cross on rather than appearing already struck. Without
  // that, spending three air to reach something deep is a silent change to a
  // row of dots.
  function renderTanks(spentBefore) {
    const s = app.state;
    const wrap = el("aq-tanks");
    wrap.innerHTML = "";
    s.tanks.forEach((capacity, d) => {
      const tank = document.createElement("div");
      tank.className = "aq-tank" + (d === s.dive ? " is-current" : "") + (d < s.dive ? " is-done" : "");
      for (let i = 0; i < capacity; i++) {
        const pip = document.createElement("i");
        pip.className = "aq-pip";
        if (i < s.spent[d]) {
          pip.classList.add("spent");
          if (spentBefore && i >= (spentBefore[d] || 0)) pip.classList.add("just");
        }
        tank.appendChild(pip);
      }
      wrap.appendChild(tank);
    });

    const left = AQ.State.airLeft(s);
    const label = el("aq-air-left");
    label.textContent = s.over ? "—" : left + " left";
    label.className = "aq-air-left" + (left === 0 ? " is-out" : left <= 3 ? " is-low" : "");
  }

  function renderDice(rolling) {
    const s = app.state;
    const dice = el("aq-dice");
    if (!s.roll) { dice.innerHTML = ""; }
    else {
      const doubled = s.roll[0] === s.roll[1];
      dice.innerHTML = s.roll.map((d) =>
        '<span class="aq-die' + (rolling ? " rolling" : " settled") +
        (doubled && !rolling ? " is-double" : "") + '">' + d + "</span>").join("");
    }
    const wrap = el("aq-choices");
    wrap.innerHTML = "";
    if (!s.roll || rolling) return;
    for (const option of AQ.State.options(s)) {
      const button = document.createElement("button");
      // A tutorial step teaching one particular die greys out the other rather
      // than removing it, so the choice being passed up is still visible.
      const barred = app.coach && !app.coach.optionAllowed(option);
      button.className = "aq-choice" + (app.option && app.option.id === option.id ? " is-picked" : "") +
        (barred ? " is-barred" : "");
      button.disabled = !!barred;
      button.innerHTML = "<strong>" + option.size + "</strong><span>" + option.label +
        (option.note ? "<em>" + option.note + "</em>" : "") + "</span>";
      button.onclick = () => chooseOption(option);
      wrap.appendChild(button);
    }
  }

  // Tumble the dice before they settle.
  //
  // The numbers really do change while it runs -- a die spinning on one face
  // is a loading spinner, not a roll -- and the roll is only committed to the
  // game state at the end, so what settles is what was rolled.
  //
  // Driven by requestAnimationFrame against the wall clock, not a chain of
  // setTimeouts. A hidden tab clamps timers to about a second each, which
  // turned a two-thirds-of-a-second roll into one that was still tumbling
  // twelve seconds later; rAF simply does not fire while hidden, and the
  // elapsed-time check means the roll is already over when the tab comes back.
  const ROLL_MS = 620;

  function rollWithFlourish(onDone) {
    const s = app.state;
    const dice = el("aq-dice");
    GK.Sfx.click();
    const started = performance.now();
    let last = 0;
    let done = false;

    // Whichever gets there first finishes the roll, once.
    //
    // requestAnimationFrame does not fire at all while the tab is in the
    // background, so a player who switches away mid-roll would come back to a
    // game frozen on "Rolling..." with no dice and the roll button hidden. The
    // timeout is the guarantee that the turn always arrives; rAF is what makes
    // it look like anything while they are watching.
    const settle = () => {
      if (done) return;
      done = true;
      AQ.State.rollDice(s);
      renderDice(false);
      GK.Sfx.coin();
      onDone();
    };

    const frame = (now) => {
      if (done) return;
      const t = Math.min(1, (now - started) / ROLL_MS);
      // Faces change quickly at first and slow as the dice come to rest.
      const gap = 45 + t * t * 150;
      if (now - last > gap) {
        last = now;
        const fake = [1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)];
        dice.innerHTML = fake.map((d) => '<span class="aq-die rolling">' + d + "</span>").join("");
      }
      if (t < 1) requestAnimationFrame(frame); else settle();
    };

    el("aq-choices").innerHTML = "";
    requestAnimationFrame(frame);
    setTimeout(settle, ROLL_MS + 90);
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
      ? "Doubles — tap any " + option.size + " connected squares."
      : "Drag out a box of " + option.size + ".");
    app.render.invalidate();
    if (app.coach) app.coach.did("choose", option);
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

  // Setting the state is the whole job: the renderer is already painting every
  // animation frame, so asking it to paint again here only made the SAME frame
  // twice. That mattered most while dragging, which is exactly when it hurt --
  // an iPad reports pointer moves faster than it displays frames, so a drag was
  // costing two or three full redraws per frame shown.
  function preview(cells) {
    if (!cells || !cells.length) { app.render.state.preview = null; app.render.invalidate(); return; }
    const why = AQ.Shapes.reject(app.board, cells, placementOpts());
    app.render.state.preview = { cells, ok: !why };
    hint(why ? capitalise(why) : costLine(cells), !!why);
    app.render.invalidate();
  }

  function costLine(cells) {
    const cost = AQ.State.costOf(app.state, cells, app.option);
    if (cost.free) return "Air bubble — this turn is free.";
    if (!cost.air) return "Costs nothing.";
    return "Costs " + cost.air + " air — " + cost.reasons.join(", ") + ".";
  }

  const capitalise = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  // One line, always. The hint used to sit inside the button row, where "Roll
  // for the next turn" wrapped onto four lines in the landscape column and
  // shoved the buttons around -- and it was telling the player to press the
  // one button already lit. It now reports what the turn cost instead.
  function hint(text, bad) {
    const box = el("aq-hint");
    box.textContent = text;
    box.className = "aq-hint" + (bad ? " is-bad" : "");
  }

  function turnSummary(cost) {
    const s = app.state;
    if (s.dive !== app.undo.dive) return "Tank empty — surfacing. Dive " + (s.dive + 1) + " next.";
    if (cost && cost.free) return "Air bubble — that turn was free.";
    if (cost && cost.air) return "Cost " + cost.air + " air. " + AQ.State.airLeft(s) + " left in the tank.";
    return "No air spent. " + AQ.State.airLeft(s) + " left in the tank.";
  }

  // A snapshot of everything one turn changes, so it can be put back.
  //
  // Drawing a box is the whole game and there is no way to un-draw one on
  // paper, but on paper you can also see the box forming under your pencil.
  // Here a mis-drag is committed the moment it is legal, so one step back is
  // the difference between a slip and a ruined expedition.
  function snapshot() {
    const s = app.state;
    return {
      turn: s.turn, dive: s.dive, roll: s.roll && s.roll.slice(),
      spent: s.spent.slice(),
      diveCells: s.diveCells.map((c) => c.slice()),
      lastShape: s.lastShape && s.lastShape.slice(),
      occupied: new Set(s.occupied),
      previousDives: new Set(s.previousDives),
      history: s.history.slice(),
      over: s.over,
      progress: app.progress ? JSON.parse(JSON.stringify(app.progress)) : null,
      bonuses: app.bonuses.slice(),
      marks: app.render.state.marks.slice(),
    };
  }

  function restore(snap) {
    const s = app.state;
    Object.assign(s, {
      turn: snap.turn, dive: snap.dive, roll: snap.roll && snap.roll.slice(),
      spent: snap.spent.slice(),
      diveCells: snap.diveCells.map((c) => c.slice()),
      lastShape: snap.lastShape && snap.lastShape.slice(),
      occupied: new Set(snap.occupied),
      previousDives: new Set(snap.previousDives),
      history: snap.history.slice(),
      over: snap.over,
    });
    if (snap.progress) Object.assign(app.progress, snap.progress);
    app.bonuses = snap.bonuses.slice();
    app.render.state.marks = snap.marks.slice();
    app.option = null;
    app.painted = null;
    app.render.state.legal = null;
    app.render.state.preview = null;
  }

  function commit(cells) {
    app.undo = snapshot();
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
    app.canUndo = true;
    refresh();
    renderTanks(app.undo.spent);
    if (!app.state.over) hint(turnSummary(result.cost));
    if (app.coach) app.coach.did("place", {
      // What this box actually caught, so the coach can name it. Three quarters
      // of the legal first boxes on this sheet enclose nothing at all, and a
      // card that talks about the fish you caught when you caught none teaches
      // the player to stop reading it.
      caught: AQ.Scoring.collect(app.state).caught.slice(before).map((e) => e.symbol),
      // Whether the box finished below the first depth line, which is the
      // thing the depth lesson wants to react to.
      deep: app.board.depthCost(Math.max.apply(null, cells.map((i) => app.board.row(i)))) > 0,
      cost: result.cost,
    });
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

  /* ────────────────────────────────────────────────────────────── bonuses ── */

  // The two maps that hand out bonuses do it differently -- Map 1 has six
  // shipwreck bonuses and you take one each time you finish a wreck; the Trench
  // has twelve in six pairs, and claiming one strikes its partner out for the
  // rest of the game. Both come through here as the same list, so the tracker,
  // the chooser and the modal are written once.
  //
  //   claimed  yours, and scoring
  //   open     still there to be taken
  //   struck   gone: you took its partner instead
  function bonusList() {
    const rules = app.rules;
    if (rules.WRECK_BONUSES && rules.WRECK_BONUSES.length) {
      const taken = new Set(app.bonuses);
      return {
        title: "Shipwreck bonuses",
        items: rules.WRECK_BONUSES.map((b) => ({
          id: b.id, label: b.label, symbol: b.symbol,
          state: taken.has(b.id) ? "claimed" : "open",
        })),
      };
    }
    if (rules.BONUS_PAIRS && rules.BONUS_PAIRS.length) {
      const p = app.progress || { bonuses: [], struck: [] };
      const taken = new Set(p.bonuses || []);
      const struck = new Set(p.struck || []);
      return {
        title: "Station bonuses",
        paired: true,
        items: rules.BONUS_PAIRS.flat().map((b) => ({
          id: b.id, label: b.label, symbol: b.symbol || (b.kind === "power" ? "outpost" : null),
          state: taken.has(b.id) ? "claimed" : struck.has(b.id) ? "struck" : "open",
        })),
      };
    }
    return null;
  }

  // The strip in the HUD: what you have and what is still out there, at a
  // glance. On paper the six bonuses are printed beside the board with the ones
  // you have taken circled, so there is never a moment where you have to
  // remember which you already spent.
  function renderBonuses() {
    const wrap = el("aq-bonuses");
    const list = bonusList();
    if (!list) { wrap.hidden = true; return; }
    wrap.hidden = false;
    const claimed = list.items.filter((b) => b.state === "claimed").length;
    el("aq-bonus-count").textContent = claimed + " / " + list.items.length;
    el("aq-bonus-title").textContent = list.title;
    el("aq-bonus-strip").innerHTML = list.items.map((b) =>
      '<span class="aq-chip is-' + b.state + '" title="' + b.label +
      (b.state === "claimed" ? " — claimed" : b.state === "struck" ? " — gone" : " — not yet") + '">' +
      (AQ.Icons.img(b.symbol, app.mapId, "aq-chip-pic") || '<i class="aq-chip-dot"></i>') +
      "</span>").join("");
  }

  // The same list in full, with the words -- because the strip can only show
  // the picture, and "5 per flag reached" is not something a flag conveys.
  function showBonusSheet() {
    const list = bonusList();
    if (!list) return;
    const rows = list.items.map((b) =>
      '<li class="aq-bonus-row is-' + b.state + '">' +
      '<span class="aq-bonus-icon">' + AQ.Icons.img(b.symbol, app.mapId, "aq-bonus-pic") + "</span>" +
      "<span>" + b.label + "</span>" +
      '<em>' + (b.state === "claimed" ? "claimed" : b.state === "struck" ? "gone" : "—") + "</em>" +
      "</li>").join("");
    el("aq-bonus-sheet-body").innerHTML =
      "<h3>" + list.title + "</h3>" +
      '<p class="aq-modal-sub">' +
        (list.paired
          ? "Twelve in six pairs. Claiming one strikes its partner out for the rest of the game."
          : "One for every shipwreck you explore completely. Each may be taken once.") +
      "</p>" +
      '<ul class="aq-bonus-rows">' + rows + "</ul>" +
      '<button class="btn btn-grey" data-close="modal-bonus-sheet">Close</button>';
    UI.openModal("modal-bonus-sheet");
  }

  function offerWreckBonus() {
    if (!app.rules.WRECK_BONUSES || !app.rules.WRECK_BONUSES.length) return;
    const { caught } = AQ.Scoring.collect(app.state);
    const wrecks = caught.filter((e) => e.symbol === "wreck").length;
    if (wrecks <= app.bonuses.length) return;
    showBonusChooser();
  }

  function showBonusChooser() {
    const taken = new Set(app.bonuses);
    const list = el("aq-bonus-list");
    list.innerHTML = "";
    for (const bonus of app.rules.WRECK_BONUSES) {
      const button = document.createElement("button");
      button.className = "aq-bonus";
      button.disabled = taken.has(bonus.id);
      // The picture of the thing being paid for. Six lines of "5 per X" read as
      // one grey block otherwise, and the choice is worth more thought than that
      // -- it is the difference between a bonus that pays and one that does not.
      button.innerHTML =
        '<span class="aq-bonus-icon">' + AQ.Icons.img(bonus.symbol, app.mapId, "aq-bonus-pic") + "</span>" +
        "<span>" + bonus.label + "</span>" +
        '<em>' + (taken.has(bonus.id) ? "taken" : "worth " + bonusWorth(bonus) + " now") + "</em>";
      button.onclick = () => {
        app.bonuses.push(bonus.id);
        app.awaitingBonus = false;
        UI.closeModal("modal-bonus");
        refresh();
      };
      list.appendChild(button);
    }
    app.awaitingBonus = true;
    UI.openModal("modal-bonus");
  }

  // What a bonus would be worth if you took it right now.
  //
  // Asked by scoring the game twice -- once as it stands, once with this bonus
  // added -- and taking the difference, rather than counting the creatures here.
  // Several of them do not pay per creature caught: "1 per coral" pays only for
  // coral in single-colour boxes, and the beacon bonus pays per PAIR. A count
  // reimplemented in the interface would quietly disagree with the sheet, and
  // the player would find out at the end.
  function bonusWorth(bonus) {
    const at = (chosen) => {
      const line = app.rules.score(app.state, chosen, app.progress).lines
        .find((l) => l.key === "wreck" || l.key === "outpost");
      return line ? line.points : 0;
    };
    return at(app.bonuses.concat(bonus.id)) - at(app.bonuses);
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

    // The coach card sits over the bottom of the board. Reading and dragging
    // are never the same moment, so it gets out of the way for the drag.
    const coachCard = el("aq-coach");
    const coachAway = (away) => coachCard.classList.toggle("is-away", away);

    canvas.onpointerdown = (event) => {
      if (!app.option) { hint("Choose which die to take first.", true); return; }
      const cell = at(event);
      if (cell === null) return;
      canvas.setPointerCapture(event.pointerId);
      coachAway(true);
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
      coachAway(false);
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

    el("aq-zoom").onclick = () => {
      app.render.setZoom(app.render.zoom >= 2 ? 1 : 2);
    };
  }

  /* ───────────────────────────────────────────────── turns and endings ── */

  el("btn-roll").onclick = () => {
    app.option = null;
    app.render.state.legal = null;
    app.canUndo = false;
    el("btn-roll").hidden = true;
    el("btn-undo").hidden = true;
    hint("Rolling…");
    if (app.coach) app.coach.aboutToRoll();
    rollWithFlourish(() => {
      refresh();
      if (app.coach) app.coach.did("roll");
      const options = AQ.State.options(app.state);
      // A double is the only option there is, so choosing it is not a choice --
      // except in the tutorial, where taking it is the lesson.
      if (options.length === 1 && !app.coach) chooseOption(options[0]);
      else if (options.length > 1) hint("Take the low die free, or pay for the high one.");
      // The tutorial takes its own doubles, so the hint has to say something --
      // otherwise the line is left reading "Rolling…" with the dice long settled.
      else hint("Doubles — take them.");
    });
  };

  el("btn-undo").onclick = () => {
    if (!app.undo) return;
    restore(app.undo);
    app.canUndo = false;
    app.undo = null;
    GK.Sfx.click();
    refresh();
    hint("Turn taken back. Choose a die again.");
  };

  // The rules for THIS map, and how it scores. Every sheet in the box scores
  // differently, and on paper that panel is printed beside the board.
  el("btn-help").onclick = () => {
    el("aq-help-body").innerHTML = AQ.Help.html(app.mapId, app.board);
    UI.openModal("modal-help");
  };

  el("btn-surface").onclick = () => {
    const result = AQ.State.surface(app.state);
    if (!result.ok) { UI.toast(capitalise(result.why)); return; }
    app.option = null;
    app.render.state.legal = null;
    UI.toast("Surfaced — the rest of the tank is gone");
    app.canUndo = false;
    refresh();
    hint("Dive " + (app.state.dive + 1) + " starts from a boat.");
    if (app.coach) app.coach.did("surface");
  };

  // The guided expedition is always the base game. Everything the other four
  // sheets add is written against Map 1's rules, so it is the only one worth
  // teaching on.
  el("btn-tutorial").onclick = () => startGame("map1", true);
  el("aq-bonuses").onclick = () => { GK.Sfx.click(); showBonusSheet(); };

  el("btn-again").onclick = () => startGame(app.mapId);
  el("btn-logbook").onclick = () => { renderLogbook(); UI.showScreen("logbook"); };
  // Straight from the result sheet to where that score sits against everyone
  // else's, on the map just played rather than whatever was open last.
  el("btn-result-scores").onclick = () => { renderLogbook(app.mapId); UI.showScreen("logbook"); };
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
    // A tutorial game is played on scripted dice, so it does not belong in the
    // logbook or anywhere near a high score. It cannot normally reach here --
    // the script ends long before turn 24 -- but a player who skips the coach
    // and keeps going would otherwise post a rigged run.
    const record = app.teaching ? null : Storage.logDive(app.profile.id, app.mapId, entry);
    const best = record && record.best === result.total && record.plays > 1;

    el("aq-result-map").textContent = AQ.Maps.info(app.mapId).name;
    el("aq-result").innerHTML = resultHtml(result, best);
    UI.showScreen("result");
    if (result.solo.passed) GK.Sfx.coin();
  }

  function resultHtml(result, isBest) {
    const medal = result.solo.medal;
    const rows = result.lines.map((line) => {
      const icon = AQ.Icons.img(line.key, app.mapId, "");
      const sign = line.points > 0 ? "is-plus" : line.points < 0 ? "is-minus" : "is-zero";
      return '<li class="aq-row ' + sign + '">' +
        '<span class="aq-row-icon">' +
          icon +
        "</span>" +
        '<span class="aq-row-body"><strong>' + line.label + "</strong>" +
        '<em>' + (line.detail || "") + "</em></span>" +
        '<span class="aq-row-points">' + (line.points > 0 ? "+" : "") + line.points + "</span>" +
        "</li>";
    }).join("");

    // The three dives, drawn as how deep each one got against the marks it had
    // to pass. It is the solo game's whole win condition and it was previously
    // a sentence.
    const marks = app.board.diveMarks;
    const depths = result.solo.depths;
    const dives = depths.map((depth, i) => {
      const reached = marks.length ? marks.filter((m) => depth >= m).length : 0;
      const failed = marks.length && depth < marks[0];
      const pct = depth < 0 ? 0 : Math.round(((depth + 1) / app.board.rows) * 100);
      return '<div class="aq-dive-bar' + (failed ? " is-failed" : "") + '">' +
        "<span>Dive " + (i + 1) + "</span>" +
        '<div class="aq-depth"><i style="height:' + pct + '%"></i></div>' +
        "<b>" + (depth < 0 ? "not taken" : "row " + depth) + "</b>" +
        (marks.length ? "<em>" + reached + "/" + marks.length + " marks</em>" : "") +
        "</div>";
    }).join("");

    return [
      '<div class="aq-verdict ' + (result.solo.passed ? "is-pass" : "is-fail") + '">',
      medal ? '<span class="aq-big-medal aq-medal-' + medal + '"></span>' : "",
      '<span class="aq-total">' + result.total + "</span>",
      "<strong>" + (result.rank || "") + "</strong>",
      isBest ? '<span class="aq-pb">a personal best</span>' : "",
      "<em>" + verdictLine(result.solo) + "</em>",
      "</div>",
      marks.length || depths.some((d) => d >= 0) ? '<div class="aq-dives">' + dives + "</div>" : "",
      '<ul class="aq-rows">' + rows + "</ul>",
      '<p class="aq-ranks-note">' + AQ.Help.RANKS + "</p>",
    ].join("");
  }

  function verdictLine(solo) {
    if (!solo.passed) return "The expedition failed — every dive must pass the first mark";
    if (solo.medal === "gold") return "Gold: all three dives reached the deepest mark";
    if (solo.medal === "silver") return "Silver: all three dives reached the second mark";
    if (solo.medal === "bronze") return "All three dives passed the first mark";
    return "Expedition complete";
  }

  /* ────────────────────────────────────────────────────────── the logbook ── */

  // One map at a time.
  //
  // The logbook used to stack all five maps down a single page, which answered
  // "how am I doing" for nobody: the five sheets score completely differently --
  // a 70 on the Trench is not a 70 on the reef -- so the only comparison worth
  // making is between divers on the SAME map, and it was the one thing you had
  // to scroll to find. Now the map is chosen first and the page is that map's:
  // the family's table, then your own dives on it.
  let logbookMap = null;

  function renderLogbook(mapId) {
    logbookMap = mapId || logbookMap || app.mapId || AQ.Maps.LIST[0].id;
    const progress = Storage.getProgress(app.profile.id);
    const record = ((progress.maps || {})[logbookMap]) || null;
    const table = Storage.leaderboard(logbookMap);
    const info = AQ.Maps.info(logbookMap);

    el("aq-log-tabs").innerHTML = AQ.Maps.LIST.map((map) => {
      const mine = ((progress.maps || {})[map.id]) || {};
      return '<button class="aq-log-tab' + (map.id === logbookMap ? " is-on" : "") +
        '" data-map="' + map.id + '">' +
        '<span class="aq-log-tab-n">' + String(map.n).padStart(2, "0") + "</span>" +
        (mine.best ? '<span class="aq-log-tab-best">' + mine.best + "</span>" : "") +
        "</button>";
    }).join("");

    const podium = table.length
      ? '<table class="aq-scores"><thead><tr><th></th><th>Diver</th><th>Best</th>' +
        "<th></th><th>Dives</th><th>Passed</th></tr></thead><tbody>" +
        table.map((row, i) =>
          '<tr class="' + (row.id === app.profile.id ? "is-me" : "") + '">' +
          '<td class="aq-place">' + (i + 1) + "</td>" +
          "<td>" + row.avatar + " " + row.name + "</td>" +
          '<td class="aq-best">' + row.best + "</td>" +
          "<td>" + (row.medal ? medalDot(row.medal) : "") + "</td>" +
          "<td>" + row.plays + "</td>" +
          "<td>" + (row.wins || 0) + "</td></tr>").join("") +
        "</tbody></table>"
      : "<p class='aq-empty'>Nobody has finished an expedition on this sheet yet.</p>";

    // Your own dives, newest first, each against the best you have managed --
    // which is what makes a middling score readable as progress or as a slump.
    const best = record ? record.best : 0;
    const history = record && record.log && record.log.length
      ? '<ol class="aq-history">' + record.log.slice().sort((a, b) => b.at - a.at).map((e) =>
          '<li' + (e.score === best ? ' class="is-best"' : "") + ">" +
          "<span>" + new Date(e.at).toLocaleDateString() + "</span>" +
          "<strong>" + e.score + "</strong>" +
          '<i class="aq-spark"><b style="width:' +
            (best > 0 ? Math.max(2, Math.round((e.score / best) * 100)) : 0) + '%"></b></i>' +
          "<em>" + (e.rank || "") + (e.medal ? " · " + e.medal : "") +
          (e.passed ? "" : " · failed") + "</em></li>").join("") + "</ol>"
      : "<p class='aq-empty'>You have not finished this one yet.</p>";

    el("aq-logbook").innerHTML =
      "<h3>" + info.name + "</h3>" +
      '<p class="aq-log-blurb">' + info.blurb + "</p>" +
      "<h4>Every diver</h4>" + podium +
      "<h4>Your dives" + (record ? " · best " + record.best : "") + "</h4>" + history;
  }

  // The tabs are rebuilt on every render, so the listener lives on the strip.
  el("aq-log-tabs").onclick = (event) => {
    const tab = event.target.closest("[data-map]");
    if (!tab) return;
    GK.Sfx.click();
    renderLogbook(tab.dataset.map);
  };

  const RULES_HTML = [
    "<h3>How a dive works</h3>",
    "<p class='aq-modal-sub'>Or skip the reading: <strong>Learn to dive</strong>",
    "on the expedition list walks you through all of this a turn at a time.</p>",
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
    const screen = event.target.closest("[data-screen]");
    if (screen) UI.showScreen(screen.dataset.screen);
    const close = event.target.closest("[data-close]");
    if (close) UI.closeModal(close.dataset.close);
  });

  // Both canvases watch their own boxes with a ResizeObserver, which is the
  // thing that catches a rotation properly. This is the backstop, and it is not
  // redundant: an observer only delivers while the page is rendering, and it
  // reports a box changing but not the device pixel ratio changing underneath a
  // box that stayed the same size.
  //
  // Re-measuring is deliberately deferred. iOS fires `resize` while the rotation
  // is still in flight, so reading the box right now returns the one being left
  // behind -- which is the whole bug. Next frame catches the settled layout, and
  // the later pass catches Safari moving it again when its toolbars finish
  // animating. Both are free when nothing changed: resize() returns early unless
  // the buffer and the box actually disagree.
  const remeasure = () => {
    if (app.render) app.render.resize();
    if (app.wheel) app.wheel.resize();
  };
  const scheduleRemeasure = () => {
    requestAnimationFrame(remeasure);
    setTimeout(remeasure, 350);
  };
  window.addEventListener("resize", scheduleRemeasure);
  window.addEventListener("orientationchange", scheduleRemeasure);

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
      // A bot cannot answer a dialogue, and an unanswered chooser now holds the
      // ending back -- so it takes the first bonus going and carries on.
      if (app.awaitingBonus) {
        const open = (bonusList().items || []).find((b) => b.state === "open");
        if (open) { app.bonuses.push(open.id); app.awaitingBonus = false; UI.closeModal("modal-bonus"); refresh(); }
      }
      return "turn " + s.turn + ", dive " + (s.dive + 1);
    }
    AQ.State.pass(s);
    refresh();
    return "passed";
  }

  // Behind ?debug=1, the live game is reachable from the console. Drawing a box
  // is a drag across a canvas, so without this there is no way to drive a turn
  // from outside the page -- which is what checking the tutorial's flow, or any
  // placement bug, actually needs.
  if (new URLSearchParams(location.search).get("debug") === "1") AQ.app = app;

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
    })
    // Finishing every square of a shipwreck is rare enough that a bot can play
    // all 24 turns without doing it once, so the chooser -- and everything the
    // tracker does once something is claimed -- is otherwise unreachable to look
    // at. This opens it on demand.
    .action("offer a bonus", () => {
      if (!app.state) return "start a dive first";
      const list = bonusList();
      if (!list) return "this map has no bonuses";
      const open = list.items.filter((b) => b.state === "open");
      if (!open.length) return "all of them are gone";
      showBonusChooser();
      return open.length + " still available";
    })
    .action("claim a bonus", () => {
      const list = bonusList();
      if (!list) return "this map has no bonuses";
      const open = list.items.find((b) => b.state === "open");
      if (!open) return "all of them are gone";
      if (app.rules.WRECK_BONUSES && app.rules.WRECK_BONUSES.length) app.bonuses.push(open.id);
      else if (app.progress) app.progress.bonuses.push(open.id);
      refresh();
      return "claimed " + open.label;
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
