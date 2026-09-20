import test from "node:test";
import assert from "node:assert/strict";
import {Continuity,qualityFailure} from "../dist/continuity.js";
import {continuationDecision,createRouter,parseConfig,candidates} from "../dist/router.js";

const basic={id:"basic",model:"provider/shared",description:"Simple work",cost:"low",quality:"standard",thinking:"low",input:["text"]};
const deep={...basic,id:"deep",quality:"best",thinking:"high"};
const stronger={...deep,id:"stronger",model:"provider/stronger"};
function complete(memory,id,key,profile=basic,success=true){
  memory.begin(id,key);memory.select(id,profile);memory.observe(id,profile.model);memory.finish(id,success);
}
test("continuity preserves exact profile, never aliases a removed or edited profile",()=>{
  const previous={profile:"deep",model:deep.model,quality:deep.quality,updatedAt:Date.now(),escalate:false};
  assert.equal(continuationDecision("continue",[basic,deep],previous).profile,"deep");
  assert.equal(continuationDecision("continue",[basic],previous),undefined);
  assert.equal(continuationDecision("continue",[{...deep,model:"provider/replaced"}],previous),undefined);
  assert.equal(continuationDecision("continue",[basic,deep],{...previous,updatedAt:0}),undefined);
  assert.equal(continuationDecision("continue",[basic,deep],{...previous,profile:"basic",escalate:true}).profile,"basic","thinking-only profiles cannot enforce an upgrade");
});
test("only observed completed routes are reused; overlap, no-choice and fallbacks break continuity",()=>{
  const memory=new Continuity();
  complete(memory,"a","session",deep);
  assert.equal(memory.begin("b","session").profile,"deep");
  memory.select("b",basic);
  assert.equal(memory.begin("c","session"),undefined,"pending run is not reliable context");
  memory.select("b",deep);memory.observe("b",deep.model);memory.finish("b",true);
  assert.equal(memory.owns("b","session"),false);
  memory.finish("c",true);
  assert.equal(memory.begin("d","session"),undefined,"old route cannot survive an unclassified new topic");
  memory.select("d",basic);memory.observe("d",stronger.model);memory.finish("d",true);
  assert.equal(memory.begin("e","session"),undefined,"fallback must not reuse requested model");
  memory.select("e",basic);memory.finish("e",true);
  assert.equal(memory.begin("f","session"),undefined,"unobserved recommendation is not execution");
});
test("only repeated distinct capability failures escalate an unsuccessful task",()=>{
  const memory=new Continuity();
  memory.begin("a","session");memory.select("a",basic);memory.observe("a",basic.model);
  for(const error of ["network timeout","permission denied","401 auth failed","429 quota","connection_reset","aborted","unknown"]){
    assert.equal(qualityFailure(error),false);memory.failure("a",error,error);
  }
  memory.failure("a","invalid_tool_arguments","call-1");
  memory.failure("a","invalid_tool_arguments","call-1");
  memory.finish("a",false);
  assert.equal(memory.begin("b","session").escalate,false,"duplicate callback is not a retry");
  memory.select("b",basic);memory.observe("b",basic.model);
  memory.failure("b","invalid_tool_arguments","call-2");
  memory.failure("b","tool_call_parse_error","call-3");
  memory.finish("b",false);
  const previous=memory.begin("c","session");
  assert.equal(previous.escalate,true);
  assert.equal(continuationDecision("fix it",[basic,stronger],previous).profile,"stronger");
  memory.select("c",basic);memory.observe("c",basic.model);
  memory.failure("c","invalid_tool_arguments","call-4");memory.failure("c","invalid_tool_arguments","call-5");
  memory.finish("c",true);
  memory.failure("c","invalid_tool_arguments","late");
  assert.equal(memory.begin("d","session").escalate,false,"recovered failures do not cost the next turn");
});
test("late run outcomes cannot mutate a newer run or resurrect an ended session",()=>{
  const memory=new Continuity();
  complete(memory,"a","session");memory.begin("b","session");memory.select("b",deep);memory.observe("b",deep.model);
  memory.failure("a","invalid_tool_arguments","old-1");memory.failure("a","invalid_tool_arguments","old-2");memory.finish("a",true);
  memory.finish("b",false);
  assert.equal(memory.begin("c","session").escalate,false);
  memory.end("session");memory.select("c",deep);memory.finish("c",true);
  assert.equal(memory.begin("d","session"),undefined);
  complete(memory,"other","other-session",deep);
  memory.clear();assert.equal(memory.begin("next","other-session"),undefined);
});
test("router deadline includes credential resolution and forbids late network requests",async()=>{
  let resolveCredential,requests=0;
  const route=createRouter(parseConfig({profiles:[basic],timeoutMs:100}),{
    credential:()=>new Promise(resolve=>{resolveCredential=resolve;}),
    fetch:async()=>{requests++;throw Error("must not be called");},
  });
  assert.equal((await route("task",[basic])).reason,"timeout");
  resolveCredential({key:"synthetic",url:"https://example.invalid",model:"test"});
  await new Promise(resolve=>setImmediate(resolve));assert.equal(requests,0);
});
test("profile trust boundary rejects undeclared fields and non-text routes",()=>{
  assert.throws(()=>parseConfig({profiles:[{...basic,id:undefined}]}));
  assert.throws(()=>parseConfig({profiles:[{...basic,extra:"not part of a profile"}]}));
  assert.throws(()=>parseConfig({profiles:[{...basic,input:Array(7).fill("text")}]}));
  assert.deepEqual(candidates(parseConfig({profiles:[{...basic,input:["image"]}]})),[]);
});
