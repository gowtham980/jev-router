import test from "node:test";
import assert from "node:assert/strict";
import plugin from "../dist/index.js";
import {emptyExclusions,changeExclusion,exclusionReason} from "../dist/exclusions.js";
function harness(initial={}) {
 const hooks=new Map(),actions=new Map(),stores=new Map();let saved=structuredClone(initial),fail=false;
 const pref={lookup:async()=>saved,register:async(_key,value)=>{if(fail)throw Error("disk unavailable");saved=structuredClone(value);}};
 const api={id:"jev-router",pluginConfig:{mode:"route",profiles:[]},config:{},logger:{warn(){}},
 runtime:{state:{openKeyedStore({namespace}){if(namespace==="preferences")return pref;const map=new Map();stores.set(namespace,map);return {lookup:async k=>map.get(k),register:async(k,v)=>map.set(k,v),entries:async()=>[...map].map(([key,value])=>({key,value})),clear:async()=>map.clear()};}}},
 registerService(){},on(name,fn){hooks.set(name,fn);},registerTool(){},registerSessionAction(action){actions.set(action.id,action);},
 session:{controls:{registerSessionAction(action){actions.set(action.id,action);}}}};
 plugin.register(api);
 return {hooks,actions,stores,get saved(){return saved;},fail(){fail=true;},set:(scope,target,disabled)=>actions.get("set_routing_exclusion").handler({payload:{scope,target,disabled}})};
}
test("exact exclusions do not spread to other agents, sessions or children",()=>{
 let p=changeExclusion(emptyExclusions(),"session","agent:main:chat:a",true);
 assert.equal(exclusionReason(p,"main","agent:main:chat:a"),"session_routing_disabled");
 assert.equal(exclusionReason(p,"main","agent:main:chat:b"),undefined);
 assert.equal(exclusionReason(p,"main","agent:main:chat:a:child"),undefined);
 p=changeExclusion(p,"agent","coder",true);
 assert.equal(exclusionReason(p,"coder"),"agent_routing_disabled");
 assert.equal(exclusionReason(p,"main"),undefined);
});
test("real registered hook skips classification, pin and overrides; persists across registration",async()=>{
 const h=harness({pinnedModel:"test/model",optimization:"economy"});
 assert.deepEqual(h.actions.get("set_routing_exclusion").requiredScopes,["operator.admin"]);
 assert.equal((await h.set("agent","coder",true)).ok,true);
 assert.equal(h.saved.pinnedModel,"test/model");assert.equal(h.saved.optimization,"economy");
 const restored=harness(h.saved);
 const result=await restored.hooks.get("before_model_resolve")({prompt:"private prompt"},{agentId:"coder",sessionKey:"agent:coder:test",runId:"excluded"});
 assert.equal(result,undefined);
 assert.equal(restored.stores.get("routing-history").get("excluded").reason,"agent_routing_disabled");
 assert.equal(restored.stores.get("routing-history").get("excluded").selectedModel,undefined);
});
test("concurrent scoped changes merge and other preference saves preserve exclusions",async()=>{
 const h=harness();
 await Promise.all([h.set("agent","main",true),h.set("session","agent:coder:test",true)]);
 assert.deepEqual(h.saved.exclusions,{agents:["main"],sessions:["agent:coder:test"]});
 await h.actions.get("set_mode").handler({payload:{mode:"observe"}});
 assert.deepEqual(h.saved.exclusions.agents,["main"]);
 await h.set("agent","main",false);
 assert.deepEqual(h.saved.exclusions,{agents:[],sessions:["agent:coder:test"]});
 await h.hooks.get("before_model_resolve")({prompt:"test"},{agentId:"coder",sessionKey:"agent:coder:test",runId:"session"});
 assert.equal(h.stores.get("routing-history").get("session").reason,"session_routing_disabled");
});
test("invalid target and failed persistence do not change live exclusions",async()=>{
 const h=harness();assert.equal((await h.set("agent"," ",true)).ok,false);
 h.fail();assert.equal((await h.set("agent","main",true)).ok,false);
 assert.equal(h.saved.exclusions,undefined);
});
