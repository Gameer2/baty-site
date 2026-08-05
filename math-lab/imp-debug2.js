const path = require("path");
const math = require(path.join(__dirname, "assets", "vendor", "math.min.js"));
const loadNerdamer = require(path.join(__dirname, "tests", "lib", "load-cas.js"));
const CS = require(path.join(__dirname, "assets", "js", "calculus-symbolic.js"));
CS.configure({ nerdamer: loadNerdamer(), math });
// replicate the internal probeSide via the engine's limit on -cos at +inf
const r = CS.limit("-cos(x)","x","Infinity");
console.log("limit(-cos,x,inf) ->", JSON.stringify(r));
// partial integrals of sin via the engine's own numeric path? just print 1-cos at truncations
for (const T of [1,10,100,1000,1e4,1e5,1e6,1e7,1e8]) console.log("1-cos("+T+")=",1-Math.cos(T));
