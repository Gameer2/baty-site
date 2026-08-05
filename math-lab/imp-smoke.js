const path = require("path");
const math = require(path.join(__dirname, "assets", "vendor", "math.min.js"));
const loadNerdamer = require(path.join(__dirname, "tests", "lib", "load-cas.js"));
const CS = require(path.join(__dirname, "assets", "js", "calculus-symbolic.js"));
CS.configure({ nerdamer: loadNerdamer(), math });
function show(label, r){
  console.log("---", label);
  if (!r || !r.ok) { console.log("  REJECT:", r && r.reason); return; }
  console.log("  verdict:", r.verdict, "value:", r.value, "numeric:", r.numeric, "verified:", r.verified, "F:", r.antideriv);
}
show("int_0^inf e^-x =1", CS.improperIntegral("e^(-x)","x","0","Infinity"));
show("int_1^inf 1/x^2 =1", CS.improperIntegral("1/x^2","x","1","Infinity"));
show("int_1^inf 1/x DIVERGES", CS.improperIntegral("1/x","x","1","Infinity"));
show("int_0^1 1/sqrt(x)=2", CS.improperIntegral("1/sqrt(x)","x","0","1"));
show("int_0^1 1/x DIVERGES", CS.improperIntegral("1/x","x","0","1"));
show("int_0^1 ln(x)=-1", CS.improperIntegral("log(x)","x","0","1"));
show("int_-1^1 1/x DIVERGES", CS.improperIntegral("1/x","x","-1","1"));
show("int_-inf^inf 1/(1+x^2)=pi", CS.improperIntegral("1/(1+x^2)","x","-Infinity","Infinity"));
show("int_0^inf 1/(1+x^2)=pi/2", CS.improperIntegral("1/(1+x^2)","x","0","Infinity"));
show("int_0^inf e^-x^2 (erf)=sqrt(pi)/2~0.886", CS.improperIntegral("e^(-x^2)","x","0","Infinity"));
show("int_1^inf 1/(x-1)^2 DIVERGES", CS.improperIntegral("1/(x-1)^2","x","1","Infinity"));
show("int_1^inf 1/x^1.5 =2", CS.improperIntegral("1/x^(3/2)","x","1","Infinity"));
show("int_1^inf 1/sqrt(x) DIVERGES", CS.improperIntegral("1/sqrt(x)","x","1","Infinity"));
show("int_0^1 1/x^0.5 conv=2", CS.improperIntegral("1/x^(1/2)","x","0","1"));
show("int_0^1 x^(-1/3) conv=3/2", CS.improperIntegral("1/x^(1/3)","x","0","1"));
show("int_1^inf 1/x^2 conv=1", CS.improperIntegral("1/x^2","x","1","Infinity"));
