"use strict";
// Save a canvas export from the running game to a file.
//
// The Browser pane in this environment cannot take screenshots, and a data URL
// is far too long to return through the tool channel. So the page stashes the
// export on window.__shot, this reads it out in chunks and writes the image.
//
//   node tools/shot.js <path-to-tool-result.txt> <out.jpg>
const fs = require("fs");
const raw = fs.readFileSync(process.argv[2], "utf8");
const m = raw.match(/data:image\/(jpeg|png);base64,([A-Za-z0-9+/=]+)/);
if (!m) { console.error("no data URL in " + process.argv[2]); process.exit(1); }
fs.writeFileSync(process.argv[3], Buffer.from(m[2], "base64"));
console.log("wrote " + process.argv[3]);
