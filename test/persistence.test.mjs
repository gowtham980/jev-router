import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,rm,stat} from "node:fs/promises";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {fileHistoryStore} from "../dist/history.js";
import {filePreferenceStore} from "../dist/preferences.js";

test("concurrent archive writes survive compaction; clear is ordered with appends",async()=>{
 const directory=await mkdtemp(join(tmpdir(),"jev-persistence-test-"));
 try {
  const path=join(directory,"history.jsonl"),store=fileHistoryStore(path);
  // Cross the compaction threshold while later appends are still queued.
  await Promise.all(Array.from({length:125},(_,i)=>store.register(String(i),{
   id:String(i),at:new Date().toISOString(),status:"preview",reason:"synthetic".repeat(1100),latencyMs:0,
  })));
  assert.equal((await store.entries()).length,125);
  assert.equal((await store.lookup("124")).id,"124");
  assert.equal((await stat(path)).mode&0o777,0o600);
  const clear=store.clear();
  const append=store.register("after-clear",{id:"after-clear",at:new Date().toISOString(),status:"preview",reason:"synthetic",latencyMs:0});
  await Promise.all([clear,append]);
  assert.deepEqual((await store.entries()).map(entry=>entry.key),["after-clear"]);
 } finally {await rm(directory,{recursive:true,force:true});}
});
test("concurrent atomic preference replacement never leaves partial JSON",async()=>{
 const directory=await mkdtemp(join(tmpdir(),"jev-preferences-test-"));
 try {
  const path=join(directory,"preferences.json"),store=filePreferenceStore(path);
  await Promise.all(Array.from({length:20},(_,i)=>store.save({profiles:[],optimization:i%2?"quality":"economy"})));
  assert.ok(["quality","economy"].includes((await store.load()).optimization));
  assert.equal((await stat(path)).mode&0o777,0o600);
 } finally {await rm(directory,{recursive:true,force:true});}
});
