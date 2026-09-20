import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {fileHistoryStore,HistoryStore} from "../dist/history.js";
import {filePreferenceStore} from "../dist/preferences.js";
import {parseConfig,candidates,continuationDecision,createRouter,modelAllowed,redact} from "../dist/router.js";
import plugin from "../dist/index.js";
import {hostAuth} from "../dist/readiness.js";
const profiles=[
 {id:"routine",model:"ollama/kimi-k3:cloud",description:"Routine coding",thinking:"low",cost:"low",quality:"standard",input:["text","image"]},
 {id:"complex",model:"openai/gpt-6-astra",description:"Difficult architecture",thinking:"high",cost:"high",quality:"best",input:["text","image"]},
];
const config=parseConfig({profiles});
const credential=async()=>({key:"test-only",url:"https://api.typesafe.ai/v1/systemone",model:"jev-latest"});
const response=(choice="routine",confidence=.9)=>new Response(JSON.stringify({answers:{route:{choice,confidence}}}));
test("strict config rejects invalid choices",()=>{
 assert.throws(()=>parseConfig({profiles:[profiles[0],profiles[0]]}));
 assert.throws(()=>parseConfig({profiles:[{...profiles[0],thinking:"turbo"}]}));
 assert.throws(()=>parseConfig({timeoutMs:NaN}));
 assert.throws(()=>parseConfig({mode:"invalid"}));
 assert.throws(()=>parseConfig({optimization:"cheapest"}));
 assert.throws(()=>parseConfig({continuity:"yes"}));
 assert.throws(()=>parseConfig({profiles:[{...profiles[0],cost:"free"}]}));
});
test("short follow-ups keep their route and failure signals raise one quality tier",()=>{
 const previous={profile:"routine",model:profiles[0].model,quality:"standard",updatedAt:Date.now(),escalate:false};
 assert.equal(continuationDecision("do it",profiles,previous).model,profiles[0].model);
 assert.equal(continuationDecision("do it",profiles,{...previous,escalate:true}).model,profiles[1].model);
 assert.equal(continuationDecision("explain a new API",profiles,previous),undefined);
});
test("legacy profiles get neutral portable cost and quality defaults",()=>{
 const parsed=parseConfig({profiles:[{id:"general",model:"provider/model",description:"General work",input:["text"]}]});
 assert.equal(parsed.optimization,"balanced");
 assert.equal(parsed.profiles[0].cost,"medium");
 assert.equal(parsed.profiles[0].quality,"strong");
});
test("allow policies, wildcard escaping and attachment capabilities",()=>{
 assert.equal(modelAllowed("openai/gpt-6-astra",["openai/*"]),true);
 assert.equal(candidates(config,["openai/*"]).length,1);
 assert.equal(candidates(config,[]).length,0);
 assert.equal(candidates(config,["openai/gpt-6.astra"]).length,0);
 assert.equal(candidates(config,undefined,[{kind:"video"}]).length,0);
});
test("valid paired choice stays inside eligible profiles",async()=>{
 let request;
 const route=createRouter(config,{credential,fetch:async(url,init)=>{request=JSON.parse(init.body);return response();}});
 const d=await route("Fix a typo",profiles);
 assert.equal(d.model,profiles[0].model);assert.equal(d.thinking,"low");
 assert.equal(request.questions.route.type,"choice");
 assert.equal(Object.keys(request.questions.route.criteria).length,2);
 assert.match(request.questions.route.criteria.routine,/relative_cost=low; expected_quality=standard/);
 assert.match(request.questions.route.instructions,/Avoid false economy/);
});
test("quality and economy goals produce distinct portable instructions",async()=>{
 for(const [optimization,expected] of [["quality","Prioritize reliable"],["economy","Prefer lower relative cost"]]){
  let request;
  const route=createRouter(parseConfig({profiles,optimization}),{credential,fetch:async(_url,init)=>{request=JSON.parse(init.body);return response();}});
  await route("task",profiles);
  assert.match(request.questions.route.instructions,new RegExp(expected));
 }
});
test("malformed and low-confidence responses retain current model",async()=>{
 for(const [body,reason] of [[{choice:"unknown",confidence:.9},"invalid_response"],[{choice:"routine",confidence:.1},"low_confidence"],[{choice:"routine",confidence:5},"invalid_response"]]){
  const route=createRouter(config,{credential,fetch:async()=>new Response(JSON.stringify({answers:{route:body}}))});
  const d=await route("task",profiles);assert.equal(d.reason,reason);assert.equal(d.model,undefined);
 }
});
test("missing credentials and abort retain current model",async()=>{
 assert.equal((await createRouter(config,{credential:async()=>{throw Error("credential_missing");}})("task",profiles)).reason,"credential_missing");
 assert.equal((await createRouter(config,{credential,fetch:async()=>{throw new DOMException("expired","TimeoutError");}})("task",profiles)).reason,"timeout");
});
test("real abort signal bounds a hung request",async()=>{
 const route=createRouter(parseConfig({profiles,timeoutMs:100}),{credential,fetch:async(_url,{signal})=>new Promise((_,reject)=>signal.addEventListener("abort",()=>reject(signal.reason),{once:true}))});
 const keepAlive=setTimeout(()=>{},500);
 try{assert.equal((await route("task",profiles)).reason,"timeout");}finally{clearTimeout(keepAlive);}
});
test("redacts common secrets, bounds prompts, refuses redirects",async()=>{
 let init;
 const route=createRouter(parseConfig({profiles,maxPromptChars:100}),{credential,fetch:async(_,options)=>{init=options;return response();}});
 await route("api_key=abcdef secret='secret value' Bearer abcdef "+"x".repeat(200),profiles);
 const state=JSON.parse(init.body).state;
 assert.ok(state.length<=100);assert.ok(!state.includes("abcdef"));assert.equal(init.redirect,"error");
 assert.ok(!redact("sk-abcdefghijklmnopqrstuvwxyz").includes("abcdefghijkl"));
});
test("rate limits trigger cooldown without a second service call",async()=>{
 let n=0;const route=createRouter(config,{credential,fetch:async()=>{n++;return new Response("",{status:429});}});
 assert.equal((await route("task",profiles)).reason,"service_http_429");
 assert.equal((await route("task",profiles)).reason,"service_cooldown");assert.equal(n,1);
});
test("oversized service responses rejected",async()=>{
 const route=createRouter(config,{credential,fetch:async()=>new Response("x".repeat(70000))});
 assert.equal((await route("task",profiles)).reason,"response_too_large");
});
const stores=new Map();
function stateStore(name=randomUUID()){
 const values=stores.get(name)??new Map();stores.set(name,values);
 return {async register(key,value){values.delete(key);values.set(key,{key,value,createdAt:Date.now()});},async lookup(key){return values.get(key)?.value;},async entries(){return [...values.values()];},async clear(){values.clear();}};
}
function harness(mode="observe",historyName=randomUUID(),initialProfiles=[]){
 const hooks={},actions={},services=[];
 const hostConfig={agents:{defaults:{models:{"openai/gpt-6-astra":{},"ollama/kimi-k3:cloud":{}},modelPolicy:{allow:["openai/*","ollama/*"]}}}};
 plugin.register({id:"jev-router",config:hostConfig,
  pluginConfig:{mode,profiles:initialProfiles,jevKey:"synthetic-test-only"},runtime:{state:{openKeyedStore:options=>stateStore(historyName+":"+options.namespace)}},registerService:s=>services.push(s),
  session:{controls:{registerSessionAction:a=>{actions[a.id]=a;}}},
  on:(name,fn)=>{hooks[name]=fn;},registerSessionAction:a=>{actions[a.id]=a;},registerTool:()=>{},
 });
 return {hooks,actions,services,hostConfig};
}
test("plugin operations enforce scopes and report native-hook gaps",async()=>{
 const {hooks,actions}=harness();
 assert.deepEqual(actions.snapshot.requiredScopes,["operator.read"]);
 assert.deepEqual(actions.preview.requiredScopes,["operator.write"]);
 assert.deepEqual(actions.save_preferences.requiredScopes,["operator.admin"]);
 assert.deepEqual(actions.configure_credential.requiredScopes,["operator.admin"]);
 await hooks.llm_input({runId:"native",provider:"openai",model:"gpt-6-astra"});
 const report=await actions.snapshot.handler({payload:{}});
 assert.equal(report.ok,true);assert.equal(report.result.records[0].status,"observed_only");
 assert.equal(report.result.gatewayModels.length,2);
 assert.ok(!JSON.stringify(report).includes('"prompt":'));
});
test("no candidates never changes model or thinking",async()=>{
 const {hooks,actions}=harness("route");
 assert.equal(await hooks.before_model_resolve({prompt:"hello"},{runId:"test"}),undefined);
 const report=await actions.snapshot.handler({payload:{}});
 assert.equal(report.result.records[0].status,"kept_current");
});
test("history bounded and actual effort/usage observed",async()=>{
 const {hooks,actions}=harness();
 for(let i=0;i<205;i++)await hooks.llm_input({runId:String(i),provider:"openai",model:"gpt-6-astra"});
 await hooks.llm_output({runId:"204",provider:"openai",model:"gpt-6-astra",reasoningEffort:"low",usage:{total:500}});
 const {result}=await actions.snapshot.handler({payload:{}});
 assert.equal(result.records.length,200);assert.equal(result.records[0].observedThinking,"low");assert.equal(result.records[0].tokens,500);
});
test("history survives a new store instance and can be cleared",async()=>{
 const name=randomUUID();const first=new HistoryStore(stateStore(name));
 await first.put({id:"run-1",at:new Date().toISOString(),status:"override_requested",reason:"jev_choice",latencyMs:12,selectedModel:"openai/gpt-6-astra"});
 const second=new HistoryStore(stateStore(name));
 assert.equal((await second.list())[0].selectedModel,"openai/gpt-6-astra");
 await second.clear();assert.equal((await first.list()).length,0);
});
test("local archive history fallback persists across instances",async()=>{
 const path=join(tmpdir(),`jev-router-file-${randomUUID()}.jsonl`);
 const first=new HistoryStore(fileHistoryStore(path),"Local file");
 await first.put({id:"file-run",at:new Date().toISOString(),status:"preview",reason:"jev_choice",latencyMs:4});
 const second=new HistoryStore(fileHistoryStore(path),"Local file");
 assert.equal((await second.list())[0].id,"file-run");assert.equal(second.backend,"Local file");
 await second.clear();assert.equal((await first.list()).length,0);
});
test("routing preferences persist without mutating or reloading Gateway config",async()=>{
 const name=randomUUID();const first=harness("observe",name,[profiles[0]]);const before=JSON.stringify(first.hostConfig);
 const saved=await first.actions.save_preferences.handler({payload:{profiles:[],optimization:"quality",continuity:false},agentId:"coder"});
 assert.equal(saved.ok,true);assert.equal(JSON.stringify(first.hostConfig),before);
 const second=harness("observe",name,[profiles[0]]);
 const snapshot=(await second.actions.snapshot.handler({payload:{},agentId:"coder"})).result;
 assert.deepEqual(snapshot.profiles,[]);
 assert.equal(snapshot.optimization,"quality");
 assert.equal(snapshot.continuity,false);
});
test("local archive preferences persist atomically",async()=>{
 const path=join(tmpdir(),`jev-router-preferences-${randomUUID()}.json`);
 await filePreferenceStore(path).save({profiles:[profiles[0]]});
 assert.deepEqual((await filePreferenceStore(path).load()).profiles,[profiles[0]]);
});
test("observed telemetry merges with a persisted routing choice",async()=>{
 const name=randomUUID();const first=harness("observe",name);
 await first.hooks.before_model_resolve({prompt:"hello"},{runId:"shared"});
 const second=harness("observe",name);
 await second.hooks.llm_input({runId:"shared",provider:"openai",model:"gpt-6-astra"});
 const report=await second.actions.snapshot.handler({payload:{}});
 assert.equal(report.result.records[0].id,"shared");
 assert.equal(report.result.records[0].observedModel,"openai/gpt-6-astra");
});
test("live hooks keep duplicate-model profile identity without an extra Jev call",async t=>{
 t.mock.method(hostAuth,"readStore",()=>({version:1,profiles:{"openai:test":{type:"api_key",provider:"openai",key:"synthetic"}}}));
 let calls=0;t.mock.method(globalThis,"fetch",async()=>{calls++;return response("second");});
 const sameModel=[{...profiles[1],id:"first",thinking:"low"},{...profiles[1],id:"second"}];
 const {hooks,actions}=harness("route",randomUUID(),sameModel);
 await hooks.before_model_resolve({prompt:"Investigate a defect"},{runId:"first",sessionKey:"session",agentId:"coder"});
 await hooks.llm_input({runId:"first",provider:"openai",model:"gpt-6-astra"});
 await hooks.agent_end({runId:"first",success:true},{sessionKey:"session",agentId:"coder"});
 await hooks.before_model_resolve({prompt:"continue"},{runId:"second",sessionKey:"session",agentId:"coder"});
 assert.equal(calls,1);
 const snapshot=(await actions.snapshot.handler({payload:{}})).result;
 const row=snapshot.records.find(row=>row.id==="second");
 assert.equal(row.selectedProfile,"second");assert.equal(row.selectedThinking,"high");assert.equal(row.reason,"session_continuation");
});
test("delayed old classification cannot override or own a newer session route",async t=>{
 t.mock.method(hostAuth,"readStore",()=>({version:1,profiles:{"openai:test":{type:"api_key",provider:"openai",key:"synthetic"}}}));
 let resolveOld,started;const pending=new Promise(resolve=>{started=resolve;});let calls=0;
 t.mock.method(globalThis,"fetch",async()=>{calls++;if(calls===1){started();return new Promise(resolve=>{resolveOld=resolve;});}return response("complex");});
 const {hooks,actions}=harness("route",randomUUID(),[profiles[1]]);
 const old=hooks.before_model_resolve({prompt:"old task"},{runId:"old",sessionKey:"session"});
 await pending;
 const newer=await hooks.before_model_resolve({prompt:"new task"},{runId:"new",sessionKey:"session"});
 assert.equal(newer.modelOverride,"gpt-6-astra");
 resolveOld(response("complex"));assert.equal(await old,undefined);
 await hooks.llm_input({runId:"new",provider:"openai",model:"gpt-6-astra"});
 await hooks.agent_end({runId:"new",success:true},{});
 await hooks.agent_end({runId:"old",success:false},{});
 await hooks.before_model_resolve({prompt:"continue"},{runId:"next",sessionKey:"session"});
 assert.equal(calls,2);
 const report=(await actions.snapshot.handler({payload:{}})).result;
 assert.equal(report.records.find(row=>row.id==="old").reason,"routing_context_changed");
});
test("concurrent preference and credential saves preserve both updates and host config",async()=>{
 const name=randomUUID(),first=harness("observe",name),before=JSON.stringify(first.hostConfig);
 const results=await Promise.all([
  first.actions.save_preferences.handler({payload:{profiles:[],optimization:"economy",continuity:false}}),
  first.actions.configure_credential.handler({payload:{}}),
 ]);
 assert.ok(results.every(result=>result.ok));
 const saved=await stateStore(name+":preferences").lookup("preferences");
 assert.equal(saved.optimization,"economy");assert.equal(saved.continuity,false);assert.equal(saved.jevKey.source,"store");
 assert.equal(JSON.stringify(first.hostConfig),before);
});
