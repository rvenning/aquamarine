"use strict";
// Persistence — gamekit storage configured for Aquamarine.
//
// aqm_* localStorage keys, "aquamarine" Firestore collection. The prefix has
// to be unique across every game on rvenning.github.io because localStorage is
// scoped to the ORIGIN and not the path; gamekit's tests/prefixes.test.js fails
// the build if two ever collide.
//
// Robert asked for two things beyond the usual best-score: a high-score list
// per map, and a log of previous games so a player can see what they got
// before. So progress keeps a `log` of completed dives alongside the bests --
// which makes the merge rule the interesting part of this file.
//
// Everything else here is monotonic and merges by keeping the better side, but
// a LOG is not: two devices each holding games the other has never seen must
// end up with both sets, not with whichever synced last. So the log is merged
// as a union keyed by the moment each game finished, newest first, and capped
// -- with the all-time best kept permanently regardless of age, because that
// is the one entry a player would be upset to lose.

const LOG_KEPT = 50;

const PROGRESS = {
  blank: () => ({
    maps: {},        // { map1: { best, plays, wins, medal, log: [...] } }
    updated: 0,
  }),

  merge: (a, b) => {
    const maps = {};
    for (const id of new Set([...Object.keys(a.maps || {}), ...Object.keys(b.maps || {})])) {
      const x = (a.maps || {})[id] || {};
      const y = (b.maps || {})[id] || {};
      maps[id] = {
        best: Math.max(x.best || 0, y.best || 0),
        plays: Math.max(x.plays || 0, y.plays || 0),
        wins: Math.max(x.wins || 0, y.wins || 0),
        medal: bestMedal(x.medal, y.medal),
        log: mergeLogs(x.log || [], y.log || []),
      };
    }
    return { maps, updated: Math.max(a.updated || 0, b.updated || 0) };
  },
};

const MEDALS = ["", "bronze", "silver", "gold"];
function bestMedal(x, y) {
  return MEDALS[Math.max(MEDALS.indexOf(x || ""), MEDALS.indexOf(y || ""))] || null;
}

function mergeLogs(x, y) {
  const byTime = new Map();
  for (const entry of [...x, ...y]) if (entry && entry.at) byTime.set(entry.at, entry);
  const all = [...byTime.values()].sort((p, q) => q.at - p.at);
  const kept = all.slice(0, LOG_KEPT);
  // Never drop the best game just because it is old.
  const best = all.reduce((acc, e) => (!acc || e.score > acc.score ? e : acc), null);
  if (best && !kept.includes(best)) kept.push(best);
  return kept;
}

const Storage = GK.createStorage({
  prefix: "aqm",
  collection: "aquamarine",
  firebaseConfig: window.FIREBASE_CONFIG || null,
  blankProgress: PROGRESS.blank,
  mergeProgress: PROGRESS.merge,
});

// Record a finished expedition. Returns the map's updated record.
Storage.logDive = function (profileId, mapId, entry) {
  const progress = this.getProgress(profileId);
  progress.maps = progress.maps || {};
  const map = progress.maps[mapId] || { best: 0, plays: 0, wins: 0, medal: null, log: [] };
  map.plays++;
  if (entry.passed) map.wins++;
  map.best = Math.max(map.best || 0, entry.score);
  map.medal = bestMedal(map.medal, entry.medal);
  map.log = mergeLogs(map.log || [], [entry]);
  progress.maps[mapId] = map;
  progress.updated = Date.now();
  this.saveProgress(profileId, progress);
  return map;
};

// The high-score table for one map, across everyone on this device (and, when
// Firestore is reachable, everyone in the family).
Storage.leaderboard = function (mapId) {
  return this.profilesWithProgress()
    .map((p) => ({
      id: p.id, name: p.name, avatar: p.avatar,
      ...(((p.progress || {}).maps || {})[mapId] || { best: 0, plays: 0, wins: 0, medal: null }),
    }))
    .filter((row) => row.plays > 0)
    .sort((a, b) => b.best - a.best);
};
