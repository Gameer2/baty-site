const path = require("path");
const math = require(path.join(__dirname, "assets", "vendor", "math.min.js"));
const loadNerdamer = require(path.join(__dirname, "tests", "lib", "load-cas.js"));
const CS = require(path.join(__dirname, "assets", "js", "calculus-symbolic.js"));
CS.configure({ nerdamer: loadNerdamer(), math });
function show(label, r){ console.log("---", label); if (!r||!r.ok){ console.log("  REJECT:", r&&r.reason); return;} console.log("  ", r.verdict, "value:", r.value, "numeric:", r.numeric, "verified:", r.verified); }
show("proper int_0^1 1 =1", CS.improperIntegral("1","x","0","1"));
show("proper int_0^2 x^2 =8/3", CS.improperIntegral("x^2","x","0","2"));
show("backwards a>b", CS.improperIntegral("1/x","x","2","1"));
show("+inf as lower", CS.improperIntegral("1/x^2","x","Infinity","1"));
show("int_-inf^inf e^-x^2 =sqrt(pi)", CS.improperIntegral("e^(-x^2)","x","-Infinity","Infinity"));
show("int_0^inf sin(x) oscillates", CS.improperIntegral("sin(x)","x","0","Infinity"));
show("int_0^2 1/(x-1) split internal DIVERGES", CS.improperIntegral("1/(x-1)","x","0","2"));
show("int_0^2 1/(x-1)^2 split DIVERGES", CS.improperIntegral("1/(x-1)^2","x","0","2"));
show("int_0^2 |x-1|^-0.5 conv", CS.improperIntegral("1/sqrt(abs(x-1))","x","0","2"));
