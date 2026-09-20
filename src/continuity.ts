import type { Profile, SessionRoute } from "./router.js";

// Explicit argument/structured-output failures can indicate a capability problem.
// Unknown, transport, auth and permission errors are not evidence of poor reasoning.
export function qualityFailure(error: string | undefined) {
  if (!error || /timeout|timed out|network|connection|rate.?limit|quota|auth|permission|denied|abort|cancel|unavailable|\b[45]\d\d\b/i.test(error)) return false;
  return /invalid[_ ]tool[_ ]arguments|tool[_ ]call[_ ]parse[_ ]error|structured[_ ]output[_ ]validation|tool arguments (?:failed|do not match) (?:schema )?validation/i.test(error);
}

type Entry = { runId:string; route?:SessionRoute; confirmed:boolean; finished:boolean; errors:Set<string> };
export class Continuity {
  private sessions=new Map<string,Entry>();
  private runs=new Map<string,string>();
  begin(runId:string,key:string|undefined) {
    if (!key) return;
    const old=this.sessions.get(key);
    const previous=old?.finished && old.confirmed ? old.route : undefined;
    this.sessions.delete(key);
    this.sessions.set(key,{runId,confirmed:false,finished:false,errors:new Set()});
    this.runs.set(runId,key);
    while(this.sessions.size>200)this.sessions.delete(this.sessions.keys().next().value!);
    while(this.runs.size>400)this.runs.delete(this.runs.keys().next().value!);
    return previous;
  }
  private entry(runId:string|undefined) {
    const key=runId?this.runs.get(runId):undefined;
    const entry=key?this.sessions.get(key):undefined;
    return entry?.runId===runId?entry:undefined;
  }
  owns(runId:string,key:string|undefined) { return !key || Boolean(this.entry(runId)); }
  select(runId:string,profile:Profile) {
    const entry=this.entry(runId);
    if(entry&&!entry.finished)entry.route={profile:profile.id,model:profile.model,thinking:profile.thinking,quality:profile.quality,updatedAt:Date.now(),escalate:false};
  }
  observe(runId:string,model:string) {
    const entry=this.entry(runId);
    if(!entry || entry.finished || !entry.route)return;
    if(entry.route.model!==model){entry.route=undefined;entry.confirmed=false;}
    else entry.confirmed=true;
  }
  failure(runId:string|undefined,error:string|undefined,eventId:string|undefined) {
    const entry=this.entry(runId);
    if(!entry || entry.finished || !entry.route || !eventId || !qualityFailure(error))return;
    if(entry.errors.size<2)entry.errors.add(eventId);
    if(entry.errors.size>=2)entry.route.escalate=true;
  }
  finish(runId:string|undefined,success:boolean) {
    const entry=this.entry(runId);
    if(!entry || entry.finished)return;
    entry.finished=true;
    if(entry.route){entry.route.updatedAt=Date.now();if(success)entry.route.escalate=false;}
  }
  end(key:string) {
    this.sessions.delete(key);
    for(const [runId,session] of this.runs)if(session===key)this.runs.delete(runId);
  }
  clear() { this.sessions.clear();this.runs.clear(); }
}
