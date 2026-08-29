"use strict";
// A guided first expedition.
//
// Aquamarine is not a hard game, but almost nothing about it is guessable from
// the board: that you take ONE of the two dice, that the higher one is bought
// with air, that depth is charged on where the turn finishes, that doubles are
// the only free-form shape you ever get, and -- the rule everybody gets wrong
// on paper -- that a new dive may not touch an earlier one even at a corner.
// Reading that in the help panel is not the same as doing it once.
//
// So the tutorial is the real game, on the real Map 1 board, with the dice
// scripted so each lesson is guaranteed to come up. The engine is untouched:
// the dice are forced by handing State.create a random source that has been
// told what to say next, which is exactly what a seeded generator is for. Every
// rule the player meets here is the rule the game actually enforces -- there is
// no separate tutorial mode of the rules to drift out of step.
//
// Steps wait for one thing each. A step either waits for a button (roll,
// surface), for a die to be chosen, for a box to be drawn, or for the player to
// read it and press Next. Nothing is gated except which die may be taken, and
// only where the lesson IS the die -- being refused a box you can see is legal
// teaches the wrong thing.

window.AQ = window.AQ || {};

AQ.Tutorial = (() => {
  // Joining the wheel at tick 0 gives twelve turns of daylight before dark, so
  // the day/night lesson lands while the player can still see the sun on the
  // wheel and the night half is visibly ahead of them.
  const START_FACE = 1;

  // A random source that can be told what the next roll is.
  //
  // AQ.Dice.roll takes two numbers from rng() and maps each to a face with
  // 1 + floor(n * 6), so a face v is produced by any value in [(v-1)/6, v/6).
  // Feeding the midpoint is exact and stays exact if the mapping is ever
  // rewritten in terms of rounding. When the queue is empty this is an ordinary
  // seeded generator, so a tutorial that runs past its script still plays.
  function scriptedRng(fallback) {
    const queue = [];
    const fn = () => (queue.length ? queue.shift() : fallback());
    fn.feed = ([a, b]) => queue.push((a - 0.5) / 6, (b - 0.5) / 6);
    return fn;
  }

  /* ────────────────────────────────────────────────────────── the script ── */

  // wait  what has to happen before the next step: "next" (the button),
  //       "roll", "choose", "place", "surface", or "end"
  // roll  the dice this step's Roll will produce
  // only  the id of the only die option that may be taken
  // spot  squares to ring on the board, as a function of the live game
  // text  a string, or a function of (app, last) for a reaction to what
  //       actually happened
  const STEPS = [
    {
      title: "The sheet",
      text: "This is a map of the ocean, twenty-two squares across and " +
        "twenty-two deep. Everything printed on it — fish, coral, wrecks, the " +
        "little flags — scores if you can enclose it in a box you draw. You have " +
        "<b>three dives</b> and <b>twenty-four turns</b> to spend on them.",
      wait: "next",
    },
    {
      title: "Two dice",
      text: "Every turn begins with a roll. Press <b>Roll</b>.",
      wait: "roll",
      roll: [2, 4],
    },
    {
      title: "Take one of them",
      text: "A 2 and a 4. You do not use both — you take <b>one</b> and draw a " +
        "box enclosing exactly that many squares. The lower die is free. The " +
        "higher one costs air equal to the gap between them, so the 4 would cost " +
        "two breaths.<br><br>Take the <b>2</b>.",
      wait: "choose",
      only: "low",
    },
    {
      title: "Start at a boat",
      text: "The first box of a dive has to cover a square under one of the " +
        "boats. Every square you are allowed to use is lit up — that highlight " +
        "is on for the whole game, and it is the one thing here that paper " +
        "cannot do.<br><br>Drag out a box of <b>2</b> beneath a boat.",
      wait: "place",
      spot: (app) => launchCells(app.board),
    },
    {
      title: "What a box catches",
      text: (app, last) => "Anything inside the box is discovered and scores. " +
        (caughtLine(last) || "That one enclosed nothing — three quarters of the " +
          "water under the boats is empty, so it happens.") +
        "<br><br>The pattern to learn is the <b>shoal</b>: one fish is worth 1, " +
        "but two in the same box is 3, three is 6, four is 10, five is 15. It is " +
        "almost always worth drawing around what is close together.<br><br>" +
        "Your running score is in the top corner.",
      wait: "next",
    },
    {
      title: "Keep going",
      text: "Roll again.",
      wait: "roll",
      roll: [2, 5],
    },
    {
      title: "Buying the bigger die",
      text: "From now on every box must <b>touch the box you drew last turn</b> " +
        "— look at where the highlight has moved to.<br><br>This time take the " +
        "<b>5</b>. It costs three breaths, and you will see them crossed off the " +
        "first tank. That trade is most of the game: a bigger box, or a cheaper one.",
      wait: "choose",
      only: "high",
    },
    {
      title: "Draw it",
      text: "Drag out a box of <b>5</b>.",
      wait: "place",
    },
    {
      title: "Air",
      text: (app) => "Three breaths gone. You have three tanks of twelve, one " +
        "per dive, and " + AQ.State.airLeft(app.state) + " left in this one. " +
        "When a tank empties the dive is over and you surface — you do not lose " +
        "the turn that emptied it.",
      wait: "next",
    },
    {
      title: "Roll",
      text: "Roll once more.",
      wait: "roll",
      roll: [4, 4],
    },
    {
      title: "Doubles",
      text: "Doubles are the best thing that can happen to you. You draw " +
        "<b>two squares bigger</b> than the number rolled — six here — you pay " +
        "<b>no air at all</b>, and it is the only time all game the shape does " +
        "not have to be a rectangle.<br><br>Take the double.",
      wait: "choose",
      only: "double",
    },
    {
      title: "Any shape you like",
      text: "Tap <b>six connected squares</b>. Snake it around whatever is worth " +
        "having — this is how you get at things a rectangle would have to swallow " +
        "a jellyfish to reach.",
      wait: "place",
    },
    {
      title: "Depth costs",
      text: "See the dashed line across the sheet, marked <b>−1 AIR</b>. Finish a " +
        "turn below it and that turn costs an extra breath; below the second line " +
        "it costs two. It is charged on the <b>deepest</b> square of the box you " +
        "just drew — the diver marks it.<br><br>Roll, then try to finish below the " +
        "first line.",
      wait: "roll",
      roll: [3, 6],
      spot: (app) => rowCells(app.board, app.board.depthLines[0]),
    },
    {
      title: "Pick a die",
      text: "Take whichever you like. The 6 costs three breaths, but it reaches " +
        "further down.",
      wait: "choose",
      spot: (app) => rowCells(app.board, app.board.depthLines[0]),
    },
    {
      title: "Go deep",
      text: "Draw it. Watch the cost line under the board while you drag — it " +
        "tells you what the box will cost before you let go.",
      wait: "place",
      spot: (app) => rowCells(app.board, app.board.depthLines[0]),
    },
    {
      title: "Day and night",
      text: (app, last) => (last && last.deep
        ? "Below the line — that turn cost an extra breath, and so will every " +
          "turn you finish down there. "
        : "Still above the line, so no surcharge that time. ") +
        "<br><br>Now look at the wheel. Twenty-four ticks, half of them daylight " +
        "and half dark, and a die at setup decided where you joined it. It " +
        "matters: <b>stingrays only score in daylight and cuttlefish only at " +
        "night</b>. Catch one at the wrong hour and it is crossed out for nothing.",
      wait: "next",
    },
    {
      title: "Ending a dive",
      text: "You do not have to wait for a tank to run dry. Roll, and then " +
        "surface early — it costs you the rest of the tank, but the dice you " +
        "just rolled carry over and the next dive starts immediately.",
      wait: "roll",
      roll: [3, 5],
    },
    {
      title: "Surface",
      text: "Press <b>Surface</b>.",
      wait: "surface",
    },
    {
      title: "The rule everyone breaks",
      text: "Here is the one people get wrong on paper every single game: a new " +
        "dive may <b>not touch an earlier dive</b> — not side by side, and not " +
        "even at a corner.<br><br>Look at the lit squares. The whole ring around " +
        "your first dive has gone dark. Choose a die and start dive two from a boat.",
      wait: "choose",
    },
    {
      title: "Dive two",
      text: "Draw your box.",
      wait: "place",
    },
    {
      title: "That is the game",
      text: "One last thing, and it is the one that decides whether an expedition " +
        "counts at all. Down the right-hand edge are three marks. Playing solo, " +
        "<b>every one of your three dives must reach below the first mark</b> or " +
        "the expedition has failed, however well you scored. Reach the second on " +
        "all three for silver, the third for gold.<br><br>Staying safe in the " +
        "shallows is not a cheap strategy. It is a loss.",
      wait: "end",
    },
  ];

  /* ──────────────────────────────────────────────────────── board helpers ── */

  // Naming what a box caught, in the words printed on the sheet.
  const CAUGHT_NAMES = {
    fish: ["a fish", "fish"],
    "coral-purple": ["a purple coral", "purple coral"],
    "coral-orange": ["an orange coral", "orange coral"],
    jellyfish: ["a jellyfish", "jellyfish"],
    bubbles: ["an air bubble", "air bubbles"],
    stingray: ["a stingray", "stingrays"],
    cuttlefish: ["a cuttlefish", "cuttlefish"],
    beacon: ["a beacon", "beacons"],
    flag: ["a flag", "flags"],
    wreck: ["a shipwreck", "shipwrecks"],
  };

  const COUNTS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight"];

  function caughtLine(last) {
    const symbols = (last && last.caught) || [];
    if (!symbols.length) return "";
    const tally = new Map();
    for (const s of symbols) tally.set(s, (tally.get(s) || 0) + 1);
    const parts = [...tally].map(([symbol, n]) => {
      const name = CAUGHT_NAMES[symbol] || [symbol, symbol];
      return n === 1 ? name[0] : (COUNTS[n] || n) + " " + name[1];
    });
    const list = parts.length === 1 ? parts[0]
      : parts.slice(0, -1).join(", ") + " and " + parts[parts.length - 1];
    return "You caught " + list + ".";
  }

  function launchCells(board) {
    const out = [];
    for (let i = 0; i < board.size; i++) if (board.isLaunch(i)) out.push(i);
    return out;
  }

  // The row a depth line sits on, as squares -- so "below the −1 AIR line" can
  // be pointed at rather than described.
  function rowCells(board, row) {
    if (row === undefined) return [];
    const out = [];
    for (let c = 0; c < board.cols; c++) out.push(board.index(c, row));
    return out;
  }

  /* ───────────────────────────────────────────────────────────── the coach ── */

  // `host` is what the tutorial is allowed to touch in the game: the live app,
  // and the two things it cannot reach on its own -- redrawing the die buttons
  // when gating changes, and leaving.
  function begin(host) {
    const app = host.app;
    const card = document.getElementById("aq-coach");
    const body = document.getElementById("aq-coach-text");
    const title = document.getElementById("aq-coach-title");
    const count = document.getElementById("aq-coach-count");
    const next = document.getElementById("aq-coach-next");
    const skip = document.getElementById("aq-coach-skip");

    let at = -1;
    let last = null;      // what the last action actually did, for reactions
    let live = true;
    let settleCard = null;

    const step = () => (at >= 0 && at < STEPS.length ? STEPS[at] : null);

    function go(i) {
      at = i;
      const s = step();
      if (!s) return stop();
      title.textContent = s.title;
      body.innerHTML = typeof s.text === "function" ? s.text(app, last) : s.text;
      count.textContent = (i + 1) + " / " + STEPS.length;
      next.hidden = s.wait !== "next" && s.wait !== "end";
      next.textContent = s.wait === "end" ? "Start a real expedition" : "Next";
      card.hidden = false;
      card.classList.remove("is-new");
      void card.offsetWidth;      // restart the entry animation
      card.classList.add("is-new");
      // A background tab suspends CSS animations where they stand, and this one
      // fades the card in from transparent -- so a player who switches away as a
      // step arrives would come back to a card they can see the board through,
      // with no animationend ever fired to clean it up. Timers still run, so the
      // class comes off on a timer rather than on the animation finishing.
      clearTimeout(settleCard);
      settleCard = setTimeout(() => card.classList.remove("is-new"), 400);
      app.render.state.spotlight = s.spot ? new Set(s.spot(app)) : null;
      host.redrawChoices();
      app.render.draw();
    }

    function advance() { go(at + 1); }

    function stop() {
      live = false;
      card.hidden = true;
      if (app.render) app.render.state.spotlight = null;
    }

    next.onclick = () => {
      GK.Sfx.click();
      if (step() && step().wait === "end") { stop(); host.leave(); return; }
      advance();
    };
    skip.onclick = () => { GK.Sfx.click(); stop(); host.leave(); };

    const coach = {
      // The dice this step wants, handed to the scripted generator the moment
      // before the roll happens rather than all at the start -- a player who
      // takes an unscripted action never desynchronises the rest of the script.
      aboutToRoll() {
        const s = step();
        if (s && s.roll) app.state.rng.feed(s.roll);
      },
      // Which die may be taken. Everything is allowed unless a step is teaching
      // one particular choice.
      optionAllowed(option) {
        const s = step();
        return !live || !s || !s.only || s.only === option.id;
      },
      // A step that waits for a button hides the others, so there is exactly one
      // thing to do.
      canRoll() {
        const s = step();
        return !live || !s || s.wait === "roll";
      },
      canSurface() {
        const s = step();
        return !live || !s || s.wait === "surface";
      },
      did(what, info) {
        if (!live) return;
        const s = step();
        if (!s || s.wait !== what) return;
        last = info || null;
        // Let the board settle before the next card arrives, or the reaction
        // text lands on top of the splash it is reacting to.
        setTimeout(advance, what === "next" ? 0 : 420);
      },
      active: () => live,
    };

    go(0);
    return coach;
  }

  return { begin, scriptedRng, START_FACE, STEPS };
})();
