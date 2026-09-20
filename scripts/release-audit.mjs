import {fileURLToPath} from "node:url";
import fs from "node:fs/promises";
import {syncBuiltinESMExports} from "node:module";
import {mock} from "node:test";
const root=fileURLToPath(new URL("../",import.meta.url)).replace(/\/$/,"");
const originalRead=fs.readFile;
mock.method(fs,"readFile",async (path,...args)=>String(path).endsWith("/credentials/typesafe_api_key") ? "synthetic-audit-key" : originalRead(path,...args));
syncBuiltinESMExports();
globalThis.fetch=async()=>new Response(JSON.stringify({answers:{route:{choice:"deep",confidence:.97}}}));
const {default:plugin}=await import((process.argv[2] ?? root)+"/dist/index.js");
const {redact}=await import(root+"/dist/router.js");
const {hostAuth}=await import(root+"/dist/readiness.js");
mock.method(hostAuth,"readStore",()=>({version:1,profiles:{"openai:test":{type:"api_key",provider:"openai",key:"synthetic-audit-only"}}}));
const profiles=[{id:"deep",model:"openai/gpt-6-astra",thinking:"high",description:"Complex coding",input:["text"]}];
const warnings=[];
function host(mode){
 const hooks={},actions={};
 const values=new Map();
 const store={async register(key,value){values.delete(key);values.set(key,{key,value,createdAt:Date.now()});},async lookup(key){return values.get(key)?.value;},async entries(){return [...values.values()];},async clear(){values.clear();}};
 const config={agents:{defaults:{modelPolicy:{allow:["openai/*"]}},entries:{restricted:{modelPolicy:{allow:["ollama/*"]}}}}};
 plugin.register({id:"jev-router",config,pluginConfig:{mode,profiles},
 logger:{warn(message){warnings.push(String(message));}},
 runtime:{state:{openKeyedStore:()=>store}},
 session:{controls:{registerSessionAction(a){actions[a.id]=a;}}},
 registerService(){},on(n,f){hooks[n]=f;},registerSessionAction(a){actions[a.id]=a;},registerTool(){}});
 return {hooks,actions,config};
}
const checks=[];
function check(name,pass){checks.push({name,pass});}
const active=host("route");
check("disabled custom plugin UI emits an actionable startup warning",warnings.some(message=>message.includes("gateway.controlUi.experimental.customPlugins=true")));
const original=JSON.stringify(active.config);
const selection=await active.hooks.before_model_resolve({prompt:"Debug a complex concurrency issue"},{runId:"audit",agentId:"coder"});
check("route mode returns exact provider/model override",selection?.providerOverride==="openai"&&selection?.modelOverride==="gpt-6-astra");
check("route mode does not invent unsupported thinking override",Object.keys(selection??{}).sort().join(",")==="modelOverride,providerOverride");
check("host configuration remains unchanged",JSON.stringify(active.config)===original);
check("same run fallback is never rerouted",await active.hooks.before_model_resolve({prompt:"complex task"},{runId:"audit",agentId:"coder"})===undefined);
const passive=host("observe");
check("observation mode does not override",await passive.hooks.before_model_resolve({prompt:"complex task"},{runId:"observe"})===undefined);
check("agent allowlist intersection respected by routing hook",await active.hooks.before_model_resolve({prompt:"complex task"},{runId:"restricted",agentId:"restricted"})===undefined);
await active.hooks.llm_input({runId:"audit",provider:"openai",model:"gpt-6-astra"});
await active.hooks.llm_output({runId:"audit",provider:"ollama",model:"kimi-k3:cloud",reasoningEffort:"low",usage:{total:123}});
let snapshot=(await active.actions.snapshot.handler({payload:{}})).result;
const fallback={...snapshot.records.find(r=>r.id==="audit")};
check("fallback telemetry stops reporting model_verified",fallback.status!=="model_verified");
const preview=await active.actions.preview.handler({payload:{prompt:"complex task"},agentId:"restricted"});
check("session-action preview respects requested agent allowlist",!preview.result?.selectedModel);
check("common JSON credential redaction",!redact('{"api_key":"synthetic-secret-value"}').includes("synthetic-secret-value"));
check("snapshot excludes synthetic prompt content",!JSON.stringify(snapshot).includes("complex task"));
await active.hooks.llm_input({runId:"audit",provider:"openai",model:"gpt-6-astra"});
snapshot=(await active.actions.snapshot.handler({payload:{}})).result;
let row=snapshot.records.find(r=>r.id==="audit");
check("recovered model is reverified",row.status==="model_verified");
check("model change clears stale thinking and usage",row.observedThinking===undefined && row.tokens===undefined);
await active.hooks.agent_end({runId:"audit",success:false},{});
await active.hooks.llm_output({runId:"audit",provider:"openai",model:"gpt-6-astra"});
snapshot=(await active.actions.snapshot.handler({payload:{}})).result;
check("late telemetry preserves run failure",snapshot.records.find(r=>r.id==="audit").status==="run_failed");
console.log(JSON.stringify({checks,observedFallbackStatus:fallback.status,observedFallbackModel:fallback.observedModel},null,2));
mock.restoreAll();syncBuiltinESMExports();

process.exitCode=checks.every(check=>check.pass) ? 0 : 1;
