"use strict";
// Grouping a sheet's cells by what is printed in them.
//
// Greedy agglomeration around the busiest exemplars: take the cell furthest
// from anything already claimed, make it a cluster head, and sweep in every
// unclaimed cell within the threshold. Ordering by ink descending matters --
// starting from a heavily-inked cell means the heads are distinctive symbols
// rather than near-empty water, which would otherwise swallow half the sheet
// into one blurry group.

const { distance } = require("./cells.js");

function clusterCells(cells, threshold) {
  const order = [...cells].sort((a, b) => b.ink - a.ink);
  const clusters = [];
  const claimed = new Set();
  for (const head of order) {
    if (claimed.has(head)) continue;
    claimed.add(head);
    const members = [head];
    for (const c of order) {
      if (claimed.has(c)) continue;
      if (distance(head.dark, c.dark) <= threshold) { claimed.add(c); members.push(c); }
    }
    clusters.push({ head, members });
  }
  return clusters.sort((a, b) => b.members.length - a.members.length);
}

// How cleanly a clustering separates: the gap between the worst distance
// inside a cluster and the best distance between two cluster heads. A positive
// margin means no cell is closer to another cluster's head than to its own.
function separation(clusters) {
  let worstIn = 0;
  for (const cl of clusters)
    for (const m of cl.members) worstIn = Math.max(worstIn, distance(cl.head.dark, m.dark));
  let bestBetween = Infinity;
  for (let i = 0; i < clusters.length; i++)
    for (let j = i + 1; j < clusters.length; j++)
      bestBetween = Math.min(bestBetween, distance(clusters[i].head.dark, clusters[j].head.dark));
  return { worstIn, bestBetween, margin: bestBetween - worstIn };
}

module.exports = { clusterCells, separation };
