"use strict";
// The board: an extracted map, turned into something the rules can ask
// questions of.
//
// Everything here is fixed for the whole game -- what is rock, what creature is
// printed where, how deep a row is. Nothing about a player's dive lives on the
// board; that belongs to state.js. Keeping the two apart means the board is
// built once per map and shared, so a balance bot can run a thousand games
// without rebuilding it each time.

window.AQ = window.AQ || {};

AQ.Board = {
  // `data` is a data/<id>.json as produced by the extraction pipeline.
  make(data) {
    const { cols, rows } = data.grid;
    const n = cols * rows;

    // Terrain, flattened to the two questions the rules actually ask: may a
    // shape cover this square, and does drawing beside it cost extra.
    const terrainOf = data.terrain.map((p) => (data.palette[p] || {}).terrain || "water");
    const blocked = new Uint8Array(n);
    const ice = new Uint8Array(n);
    const cave = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      const t = terrainOf[i];
      // Rock and ice both stop a dive dead. Ice additionally charges a breath
      // for merely being next to it, which is why the two stay distinct.
      if (t === "rock" || t === "ice" || t === "divider") blocked[i] = 1;
      if (t === "ice") ice[i] = 1;
      if (t === "cave") cave[i] = 1;
    }

    // Symbols, indexed by the square they sit in. A multi-square creature is
    // listed against every square it covers, all pointing at one record, so
    // "is this wreck finished" is a question about a single object rather than
    // a reconciliation between several.
    // Where a symbol sits, the square is diveable -- with two exceptions.
    //
    // Terrain is read from the colour of a square's background, sampled in a
    // ring around whatever is printed on top. That works everywhere except
    // where the printed thing is large and dark: the Trench's research
    // outposts and its hydrothermal steam are painted in a navy close enough
    // to the seabed's that the ring reads rock, and two eight-square outposts
    // came out with seven diveable squares each -- unfinishable, and with them
    // a scoring track the player could never complete.
    //
    // The sheets never print a creature or a structure on a square you cannot
    // enter, so a symbol is itself evidence of water. The exceptions are the
    // two things deliberately drawn INTO the stone: shipwrecks, half-buried by
    // design, and fossils, which are quarried through the rock rather than
    // enclosed.
    const DRAWN_ON_ROCK = (symbol) => symbol === "wreck" || symbol.startsWith("fossil");
    for (const group of data.symbols || []) {
      if (DRAWN_ON_ROCK(group.symbol)) continue;
      for (const spot of group.at)
        for (const [c, r] of (spot.covers || [spot.home])) {
          const i = r * cols + c;
          if (i >= 0 && i < n && blocked[i] && !ice[i]) blocked[i] = 0;
        }
    }

    const at = Array.from({ length: n }, () => []);
    const objects = [];
    for (const group of data.symbols || [])
      for (const spot of group.at) {
        const covers = spot.covers || [spot.home];
        // An object's SPACES are the squares of it a dive could actually
        // enclose, which is not the same as the squares its picture covers.
        //
        // The shipwrecks are drawn half-buried, hull and mast running over the
        // rock beside them, and the rules ask you to enclose "all spaces of a
        // Shipwreck". Counting the buried squares makes that impossible: rock
        // can never be enclosed, so all four of Map 1's wrecks were unfinishable
        // and the entire shipwreck-bonus category was dead. Sixty bot games
        // scored zero from it without anything looking wrong.
        //
        // The parts drawn over rock are scenery. The parts in the water are the
        // wreck.
        //
        // Fossils are the exception, and a deliberate one: Ancient Waters
        // embeds them IN the stone, and they are collected by tracing a line
        // through rock between two enclosed squares, never by being enclosed.
        // Filtering them out as unreachable would delete the map's whole
        // central mechanic -- it silently removed 32 of its 120 objects.
        const all = covers.map(([c, r]) => r * cols + c).filter((i) => i >= 0 && i < n);
        const inRock = group.symbol.startsWith("fossil");
        const cells = inRock ? all : all.filter((i) => !blocked[i]);
        if (!cells.length) continue;
        const obj = {
          id: objects.length,
          symbol: group.symbol,
          home: spot.home,
          cells,
          buried: covers.length - cells.length,
        };
        objects.push(obj);
        for (const i of obj.cells) at[i].push(obj);
      }

    const flagValues = {};
    for (const [key, v] of Object.entries((data.structure || {}).flagValues || {}))
      if (key !== "_") flagValues[key] = v;

    const launch = new Uint8Array(n);
    for (const boat of data.boats || [])
      for (const [c, r] of boat.launch) launch[r * cols + c] = 1;

    const depthLines = (data.depthLines || []).map((l) => l.row);

    return {
      id: data.id,
      name: data.name,
      cols, rows, size: n,
      sheet: data.sheet,
      structure: data.structure || {},
      boats: data.boats || [],
      objects,
      depthLines,

      index: (c, r) => r * cols + c,
      col: (i) => i % cols,
      row: (i) => Math.floor(i / cols),
      inBounds: (c, r) => c >= 0 && r >= 0 && c < cols && r < rows,

      terrainAt: (i) => terrainOf[i],
      isBlocked: (i) => blocked[i] === 1,
      isIce: (i) => ice[i] === 1,
      isCave: (i) => cave[i] === 1,
      isLaunch: (i) => launch[i] === 1,
      objectsAt: (i) => at[i],

      // Extra air for finishing the turn deep. The printed lines are row
      // BOUNDARIES drawn along the top of a row, so "below the -1 AIR line"
      // means a square in that row or deeper.
      depthCost(rowIndex) {
        let cost = 0;
        for (const line of depthLines) if (rowIndex >= line) cost++;
        return cost;
      },

      // Solo play needs every dive to get below the first mark; the second and
      // third are the silver and gold results.
      diveMarks: (data.structure || {}).diveMarks || [],

      flagValue(i) {
        return flagValues[(i % cols) + "," + Math.floor(i / cols)] || 0;
      },
    };
  },
};
