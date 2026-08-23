"use strict";
// Finding the printed grid on an Aquamarine gamesheet.
//
// The sheets mark their lattice with small "+" crosses -- a 3px stroke, arms
// about 10px each way -- printed at every grid intersection that is not buried
// under artwork. They are the one feature on the page that is both regular and
// unambiguous: rock hatching aligns to the grid but is textured, and the
// creature icons sit inside cells but are not evenly spaced.
//
// So: score every pixel for how much it looks like the centre of a cross,
// keep the local maxima, then fit a lattice to whatever survives. Fitting a
// lattice rather than trusting the detections means a sheet where half the
// crosses are hidden under a shipwreck still yields the right geometry -- and
// the residual of that fit is the number that tells us whether to believe it.

const ARM = 9;        // how far a cross arm reaches from centre, in pixels
const GAP = 5;        // how far into a diagonal quadrant to check for paper
const INK = 170;      // luminance at or below this is ink
const PAPER = 225;    // luminance at or above this is paper

// Cross-ness at (x, y): dark along both arms, light in all four quadrants.
// Written as a difference of counts rather than a correlation because the
// sheets are pure black on white and there is no greyscale to model.
function crossScore(px, w, h, x, y) {
  if (x < ARM + GAP || y < ARM + GAP || x >= w - ARM - GAP || y >= h - ARM - GAP) return 0;
  const at = (xx, yy) => px[(yy * w + xx) * 4];
  let arms = 0;
  for (let d = -ARM; d <= ARM; d++) {
    if (at(x + d, y) <= INK) arms++;
    if (at(x, y + d) <= INK) arms++;
  }
  const span = (ARM * 2 + 1) * 2;
  if (arms < span * 0.85) return 0;          // both arms must be nearly solid
  let clear = 0;
  for (const [sx, sy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]])
    for (let a = GAP; a <= ARM; a++)
      for (let b = GAP; b <= ARM; b++)
        if (at(x + sx * a, y + sy * b) >= PAPER) clear++;
    const quad = 4 * (ARM - GAP + 1) * (ARM - GAP + 1);
  return clear < quad * 0.9 ? 0 : arms / span;
}

function findCrosses(img) {
  const { width: w, height: h, rgba } = img;
  // Raw responses first, indexed by pixel. The clustering below used to scan
  // every hit against every other, which is fine for a sheet with a thousand
  // marks and takes twelve seconds on one with fifty thousand -- the rock
  // hatching on the bigger sheets responds weakly across whole regions.
  const score = new Map();
  const key = (x, y) => y * w + x;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const s = crossScore(rgba, w, h, x, y);
      if (s) score.set(key(x, y), { x, y, s });
    }
  // A printed cross is several pixels thick and responds over a small blob;
  // collapse each connected blob to its centroid, which is the mark's centre.
  const seen = new Set();
  const marks = [];
  for (const [k, hit] of score) {
    if (seen.has(k)) continue;
    seen.add(k);
    const stack = [hit];
    let sx = 0, sy = 0, n = 0;
    while (stack.length) {
      const p = stack.pop();
      sx += p.x; sy += p.y; n++;
      for (let dy = -3; dy <= 3; dy++)
        for (let dx = -3; dx <= 3; dx++) {
          const nx = p.x + dx, ny = p.y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const nk = key(nx, ny);
          if (seen.has(nk)) continue;
          const q = score.get(nk);
          if (q) { seen.add(nk); stack.push(q); }
        }
    }
    marks.push({ x: sx / n, y: sy / n, n });
  }
  return marks;
}

// Collapse marks on one axis into candidate grid lines: anything within a few
// pixels of its neighbour is the same printed line seen at different heights
// down the page.
function cluster(values, tol) {
  const v = [...values].sort((a, b) => a - b);
  const out = [];
  let cur = [v[0]];
  for (let i = 1; i < v.length; i++) {
    if (v[i] - cur[cur.length - 1] <= tol) cur.push(v[i]);
    else { out.push(cur); cur = [v[i]]; }
  }
  out.push(cur);
  return out.map((c) => ({ at: c.reduce((a, b) => a + b, 0) / c.length, n: c.length }));
}

// Recovering the lattice from the detections.
//
// Three approaches were tried, and the two that failed are worth recording
// because both looked right on four sheets out of five.
//
// Filtering for "strong" grid lines and chaining them collapsed on The Polar
// Shelf, whose rock walls throw a hundred false crosses down each edge and
// dwarf the real lines: no threshold separates a grid line hidden under a
// shipwreck from a page border that is not a grid line at all.
//
// Scoring candidate pitches by how many marks they explain is closer, but the
// phase cannot be a circular mean -- where a sheet carries false marks halfway
// between the true lines the two populations sit 180 degrees apart, cancel,
// and the fit lands on half the real pitch.
//
// What actually works is DENSITY. Collapse the marks to candidate lines, then
// look for the longest run of lines that are evenly spaced AND essentially all
// present. The printed grid is the only thing on the page with no gaps in it:
// hatching is irregular, panel furniture is a different pitch, and a harmonic
// of the true pitch is by definition half empty. Requiring near-perfect
// occupancy is what tells the grid apart from everything that resembles it.

const MIN_DENSITY = 0.88;   // fraction of a run's lattice positions that must be present.
// Not 1.0, and not much lower either. The colour sheets paint their depth
// lines straight over a whole row of aiming crosses, so two rows out of the
// Map 1 grid print no marks at all -- while a harmonic of the true pitch sits
// near 0.5 by construction. There is a wide gap between "the grid, with a
// couple of rows obscured" and "half a grid", and this sits in it.
const LINE_TOL = 5;         // pixels a line may sit off its lattice position
const MIN_HITS = 6;         // detections needed before a cluster counts as a line

// The longest evenly-spaced, near-complete run of lines on one axis.
// Candidate pitches come from every pair of lines (over small multiples, so a
// pair that happens to straddle a gap still proposes the right spacing) --
// there are only a few dozen lines per axis, so this is cheap and exhaustive.
function longestRun(clusters) {
  const pts = clusters.filter((c) => c.n >= MIN_HITS).map((c) => c.at);
  let best = null;
  for (let i = 0; i < pts.length; i++)
    for (let j = i + 1; j < pts.length; j++)
      for (const mult of [1, 2, 3]) {
        const pitch = (pts[j] - pts[i]) / mult;
        if (pitch < 45 || pitch > 200) continue;
        const on = pts.filter((v) => {
          const k = (v - pts[i]) / pitch;
          return Math.abs(k - Math.round(k)) * pitch <= LINE_TOL;
        });
        if (on.length < 6) continue;
        const lo = Math.min(...on), hi = Math.max(...on);
        const lines = Math.round((hi - lo) / pitch) + 1;
        const density = on.length / lines;
        if (density < MIN_DENSITY) continue;
        // Most lines wins; a tie goes to the coarser pitch, which is the real
        // one -- a harmonic can only ever tie by being twice as long.
        if (!best || lines > best.lines || (lines === best.lines && pitch > best.pitch))
          best = { pitch, lo, hi, lines, density, members: on };
      }
  if (!best) throw new Error("no regular grid found on this axis");
  // Least-squares the spacing across the whole run rather than trusting the
  // two lines that happened to propose it.
  let sp = 0, sk = 0, skk = 0, sv = 0;
  for (const v of best.members) {
    const k = Math.round((v - best.lo) / best.pitch);
    sp += k * v; sk += k; skk += k * k; sv += v;
  }
  const n = best.members.length;
  const pitch = (n * sp - sk * sv) / (n * skk - sk * sk);
  const first = (sv - pitch * sk) / n;
  return { pitch, first, lines: best.lines, density: best.density };
}

// Raw lattice of printed cross LINES -- positions, not cells. Callers decide
// what the lines mean; tools/fit-geometry.js turns them into a cell grid, and
// records there why the crosses are corners rather than centres.
function fitLattice(img) {
  const marks = findCrosses(img);
  const fx = longestRun(cluster(marks.map((m) => m.x), 10));
  const fy = longestRun(cluster(marks.map((m) => m.y), 10));
  const pitch = (fx.pitch + fy.pitch) / 2;   // the printed cells are square
  return {
    x0: fx.first, y0: fy.first,
    pitch, cols: fx.lines - 1, rows: fy.lines - 1,
    density: Math.min(fx.density, fy.density),
    skew: Math.abs(fx.pitch - fy.pitch),
    detected: marks.length,
  };
}

module.exports = { crossScore, findCrosses, cluster, longestRun, fitLattice };
