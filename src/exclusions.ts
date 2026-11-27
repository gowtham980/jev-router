export type RoutingExclusions = { agents:string[]; sessions:string[] };
export const emptyExclusions = ():RoutingExclusions => ({agents:[],sessions:[]});
export function parseExclusions(value:unknown):RoutingExclusions {
  if(!value || typeof value!=="object")return emptyExclusions();
  const raw=value as Partial<RoutingExclusions>;
  const list=(items:unknown,max:number)=>Array.isArray(items)?[...new Set(items.filter((v):v is string=>typeof v==="string"&&v.length>0&&v.length<=max))].slice(0,1000):[];
  return {agents:list(raw.agents,256),sessions:list(raw.sessions,512)};
}
export function exclusionReason(policy:RoutingExclusions,agentId?:string,sessionKey?:string) {
  if(agentId&&policy.agents.includes(agentId))return "agent_routing_disabled";
  if(sessionKey&&policy.sessions.includes(sessionKey))return "session_routing_disabled";
  return undefined;
}
export function changeExclusion(policy:RoutingExclusions,scope:"agent"|"session",target:string,disabled:boolean):RoutingExclusions {
  if(!target||target!==target.trim()||target.length>(scope==="agent"?256:512))throw Error("Invalid routing target.");
  const key=scope==="agent"?"agents":"sessions";
  const entries=policy[key].filter(item=>item!==target);
  if(disabled)entries.push(target);
  if(entries.length>1000)throw Error("Too many routing exclusions. Remove an exclusion first.");
  return {...policy,[key]:entries};
}
