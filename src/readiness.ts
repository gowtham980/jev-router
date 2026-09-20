import {
  ensureAuthProfileStore, isProfileInCooldown, resolveAuthProfileOrder,
  resolveAgentDir, resolveDefaultAgentId,
} from "openclaw/plugin-sdk/agent-runtime";
import { modelAllowed, type Profile } from "./router.js";

type HostConfig = NonNullable<Parameters<typeof resolveAuthProfileOrder>[0]["cfg"]>;
type AuthStore = ReturnType<typeof ensureAuthProfileStore>;
type ModelProbe = {id:string;model:string};

// Only read host-owned credential state. No refresh, writes, keychain prompts or secrets in results.
export const hostAuth = {
  readStore(cfg: HostConfig, agentId?: string): AuthStore {
    return ensureAuthProfileStore(resolveAgentDir(cfg, agentId ?? resolveDefaultAgentId(cfg)), {
      config: cfg, readOnly: true, syncExternalCli: false, allowKeychainPrompt: false,
      externalCli: {mode:"none"},
    });
  },
};
export function filterReadyProfiles<T extends ModelProbe>(profiles: T[], cfg: HostConfig, store: AuthStore, now=Date.now()) {
  return profiles.filter(profile => {
    const slash=profile.model.indexOf("/");
    const provider=profile.model.slice(0,slash), model=profile.model.slice(slash+1);
    const ids=resolveAuthProfileOrder({cfg,store,provider,forModel:model,readinessMode:"execution"});
    return ids.some(id=>!isProfileInCooldown(store,id,now,model));
  });
}
export function readyProfiles<T extends ModelProbe>(profiles: T[], cfg: HostConfig, agentId?:string) {
  if (!profiles.length) return profiles;
  try { return filterReadyProfiles(profiles,cfg,hostAuth.readStore(cfg,agentId)); }
  catch { return []; } // Unknown readiness must not override the host's current selection.
}

export function profileStatuses(
  profiles: Profile[], defaultAllowed: string[] | undefined, agentAllowed: string[] | undefined,
  authReady: Profile[], requiredInput="text",
) {
  const readyIds=new Set(authReady.map(profile=>profile.id));
  return profiles.map(profile => {
    let reason="Eligible for text prompts";
    if (!modelAllowed(profile.model,defaultAllowed)) reason="Blocked by the Gateway model policy";
    else if (!modelAllowed(profile.model,agentAllowed)) reason="Blocked by this agent's model policy";
    else if (!profile.input.includes(requiredInput)) reason=`Does not support ${requiredInput} input`;
    else if (!readyIds.has(profile.id)) reason="No usable credential or temporarily unavailable";
    const ready=reason==="Eligible for text prompts";
    return {...profile,ready,reason};
  });
}

// A retry/fallback is a host decision, not another opportunity to pick the failed model.
export function oncePerRun(limit=2000) {
  const seen=new Set<string>();
  return (runId?:string) => {
    if(!runId || seen.has(runId)) return false;
    seen.add(runId);
    while(seen.size>limit) seen.delete(seen.values().next().value!);
    return true;
  };
}
