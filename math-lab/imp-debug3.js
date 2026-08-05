const path = require("path");
const math = require(path.join(__dirname, "assets", "vendor", "math.min.js"));
const loadNerdamer = require(path.join(__dirname, "tests", "lib", "load-cas.js"));
const CS = require(path.join(__dirname, "assets", "js", "calculus-symbolic.js"));
CS.configure({ nerdamer: loadNerdamer(), math });
const r = CS.improperIntegral("sin(x)","x","0","Infinity");
console.log(JSON.stringify(r, null, 1));
