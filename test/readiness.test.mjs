import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,writeFile,readFile,readdir,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {filterReadyProfiles,profileStatuses,readyProfiles,hostAuth,oncePerRun} from "../dist/readiness.js";
const profiles=["openai/a","openai/b"].map((model,i)=>({id:"p"+i,model,description:"test",input:["text"]}));
const store=()=>({version:1,profiles:{"openai:test":{type:"api_key",provider:"openai",key:"synthetic-test-only"}}});
test("healthy stored credentials eligible; missing credentials excluded",()=>{
 assert.equal(filterReadyProfiles(profiles,{},store()).length,2);
 assert.equal(filterReadyProfiles(profiles,{}, {version:1,profiles:{}}).length,0);
});
test("provider cooldown excludes all candidates but model cooldown only excludes affected model",()=>{
 const s=store();s.usageStats={"openai:test":{cooldownUntil:Date.now()+60000,cooldownReason:"rate_limit"}};
 assert.equal(filterReadyProfiles(profiles,{},s).length,0);
 s.usageStats["openai:test"].cooldownModel="a";
 assert.deepEqual(filterReadyProfiles(profiles,{},s).map(x=>x.model),["openai/b"]);
});
test("disabled and quota-blocked profiles are excluded; another healthy profile can serve",()=>{
 for(const stats of [{disabledUntil:Date.now()+60000,disabledReason:"auth"},
 {blockedUntil:Date.now()+60000,blockedReason:"subscription_limit",blockedSource:"provider"}]){
 const s=store();s.usageStats={"openai:test":stats};
 assert.equal(filterReadyProfiles(profiles,{},s).length,0);
 s.profiles["openai:other"]={type:"api_key",provider:"openai",key:"synthetic-other"};
 assert.equal(filterReadyProfiles(profiles,{},s).length,2);
 }
});
test("readiness errors never route to an unverified model",async t=>{
 t.mock.method(hostAuth,"readStore",async()=>{throw Error("unavailable");});
 assert.deepEqual(await readyProfiles(profiles,{}),[]);
});
test("readiness waits for auth-store preparation before selecting a model",async t=>{
 let release;
 t.mock.method(hostAuth,"readStore",()=>new Promise(resolve=>{release=()=>resolve(store());}));
 const selection=readyProfiles(profiles,{});
 let settled=false;
 selection.then(()=>{settled=true;});
 await Promise.resolve();
 assert.equal(settled,false);
 release();
 assert.deepEqual((await selection).map(profile=>profile.id),["p0","p1"]);
});
test("fallbacks cannot re-enter classifier; missing run identity cannot route",()=>{
 const first=oncePerRun();
 assert.equal(first(undefined),false);
 assert.equal(first("run-a"),true);
 assert.equal(first("run-a"),false);
 assert.equal(first("run-b"),true);
 assert.equal(first("run-a"),false);
});
test("dashboard explains exactly why configured models are eligible or excluded",()=>{
 const all=[...profiles,{id:"media",model:"openai/media",description:"video",input:["video"]}];
 const status=profileStatuses(all,["openai/*"],["openai/a","openai/media"],[profiles[0]]);
 assert.deepEqual(status.map(x=>[x.id,x.ready,x.reason]),[
  ["p0",true,"Eligible for text prompts"],
  ["p1",false,"Blocked by this agent's model policy"],
  ["media",false,"Does not support text input"],
 ]);
});

test("legacy auth migration remains host-owned and readiness fails closed without writes",async()=>{
 const dir=await mkdtemp(join(tmpdir(),"jev-auth-readonly-"));
 try {
  const file=join(dir,"auth-profiles.json");
  const data=JSON.stringify(store());
  await writeFile(file,data);
  const cfg={agents:{entries:{fixture:{agentDir:dir}}}};
  await assert.rejects(hostAuth.readStore(cfg,"fixture"),error=>error.code==="AUTH_PROFILE_MIGRATION_REQUIRED");
  assert.deepEqual(await readyProfiles(profiles,cfg,"fixture"),[]);
  assert.equal(await readFile(file,"utf8"),data);
  assert.deepEqual(await readdir(dir),["auth-profiles.json"]);
 } finally { await rm(dir,{recursive:true,force:true}); }
});
