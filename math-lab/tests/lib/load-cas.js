"use strict";
/* Loads the vendored nerdamer bundle for use in Node.

   assets/vendor/nerdamer.min.js cannot be require()'d directly: its CommonJS branch does a
   require('./nerdamer.core.js') for the unbundled layout, which does not exist next to the
   all-in-one minified file we vendor. Evaluating it in a VM context that looks like a
   browser (a `self`/`window` global, no `module`) takes the browser branch instead, so the
   tests exercise byte-for-byte the same bundle the pages load. */

const fs = require("fs");
const vm = require("vm");
const path = require("path");

let cached = null;

module.exports = function loadNerdamer() {
  if (cached) return cached;
  const file = path.join(__dirname, "..", "..", "assets", "vendor", "nerdamer.min.js");
  const sandbox = { console };
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(file, "utf8"), sandbox);
  if (typeof sandbox.nerdamer !== "function") {
    throw new Error("nerdamer failed to load from " + file);
  }
  cached = sandbox.nerdamer;
  return cached;
};
