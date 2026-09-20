import { buildJsonPluginConfigSchema } from "openclaw/plugin-sdk/plugin-entry";
import { buildModelsProviderData } from "openclaw/plugin-sdk/models-provider-runtime";
import { configSchema } from "./schema.js";
import { randomUUID } from "node:crypto";
import { defineFeaturePlugin } from "openclaw/plugin-sdk/feature-plugin";
import { contract } from "./contract.js";
import { candidates, continuationDecision, createRouter, credential, parseConfig, type Decision } from "./router.js";
import { Continuity } from "./continuity.js";
import { fileHistoryStore, HistoryStore, type RecordRow } from "./history.js";
import { filePreferenceStore, keyedPreferenceStore, type PreferenceStore, type Preferences } from "./preferences.js";

import { profileStatuses, readyProfiles, oncePerRun } from "./readiness.js";

const feature = defineFeaturePlugin({
  contract, name:"Jev Router",
  description:"Provider-neutral Jev routing with honest runtime telemetry.",
  setup(api, events) {
    const config = parseConfig(api.pluginConfig);
    if (api.config.gateway?.controlUi?.experimental?.customPlugins !== true) {
      api.logger?.warn("Jev Router dashboard is hidden until gateway.controlUi.experimental.customPlugins=true; restart the Gateway after enabling it.");
    }
    let activeProfiles=config.profiles;
    let activeOptimization=config.optimization;
    let activeContinuity=config.continuity;
    let activeJevKey=config.jevKey;
    let preferences:PreferenceStore;
    try {
      preferences=keyedPreferenceStore(api.runtime.state.openKeyedStore<Preferences>({namespace:"preferences",maxEntries:1,overflowPolicy:"evict-oldest"}));
    } catch {
      preferences=filePreferenceStore();
    }
    const loaded=preferences.load().then(value=>{
      if(!value)return;
      const saved=parseConfig({...config,...(value.profiles?{profiles:value.profiles}:{}),...(value.optimization?{optimization:value.optimization}:{}),...(value.continuity!==undefined?{continuity:value.continuity}:{})});
      activeProfiles=saved.profiles;
      activeOptimization=saved.optimization;
      activeContinuity=saved.continuity;
      if(value.jevKey!==undefined)activeJevKey=parseConfig({...config,jevKey:value.jevKey}).jevKey;
    }).catch(()=>{/* keep validated plugin configuration */});
    const decide = createRouter(config,{credential:()=>credential(api.config,activeJevKey),optimization:()=>activeOptimization});
    const firstAttempt = oncePerRun();
    const rows = new Map<string,RecordRow>();
    const continuity=new Continuity();
    let preferenceRevision=0;
    let history:HistoryStore;
    try {
      history=new HistoryStore(api.runtime.state.openKeyedStore<RecordRow>({namespace:"routing-history",maxEntries:200,overflowPolicy:"evict-oldest"}));
    } catch {
      history=new HistoryStore(fileHistoryStore(),"Local file");
    }
    let live = false;
    api.registerService({ id:"jev-router-events", start() { live=true; }, stop() { live=false; } });
    const publish = () => { if (live) { try { events.emit("changed",{}); } catch { /* telemetry must not interrupt inference */ } } };
    const put = async (row:RecordRow) => {
      rows.set(row.id,row);
      while(rows.size>200) rows.delete(rows.keys().next().value!);
      try { await history.put(row); } catch { /* telemetry must not interrupt inference */ }
      publish(); return row;
    };
    const make = (d:Decision,id:string,status:string):RecordRow => ({
      id, at:new Date().toISOString(), status, reason:d.reason, latencyMs:d.latencyMs,
      ...(d.profile ? {selectedProfile:d.profile} : {}),
      ...(d.model ? {selectedModel:d.model} : {}), ...(d.thinking ? {selectedThinking:d.thinking} : {}),
      ...(d.confidence !== undefined ? {confidence:d.confidence} : {}),
    });
    const eligible = async (agentId?:string,attachments?:{kind:string}[]) => {
      await loaded;
      const defaults = api.config.agents?.defaults?.modelPolicy?.allow;
      const entries = api.config.agents?.entries;
      const agent = agentId && entries ? entries[agentId] : undefined;
      const own = agent && typeof agent === "object" && "modelPolicy" in agent
        ? (agent.modelPolicy as {allow?:string[]})?.allow : undefined;
      // Intersect policies; never broaden the host's permissions.
      const pool = candidates({...config,profiles:activeProfiles}, defaults,attachments);
      return readyProfiles(candidates({...config,profiles:pool},own,attachments),api.config,agentId);
    };
    api.on("before_model_resolve",async (event,ctx) => {
      // Do not reroute host fallback attempts, including after the first attempt failed.
      if (!firstAttempt(ctx.runId)) return;
      const id = ctx.runId!;
      const sessionKey=ctx.sessionKey?JSON.stringify([ctx.agentId??"",ctx.sessionKey]):undefined;
      const previous=continuity.begin(id,sessionKey);
      await loaded;
      const revision=preferenceRevision;
      const profiles=await eligible(ctx.agentId,event.attachments);
      let decision = activeContinuity&&sessionKey
        ? continuationDecision(event.prompt,profiles,previous)??await decide(event.prompt,profiles)
        : await decide(event.prompt,profiles);
      if(revision!==preferenceRevision || !continuity.owns(id,sessionKey))decision={reason:"routing_context_changed",latencyMs:decision.latencyMs};
      const selected=profiles.find(profile=>profile.id===decision.profile && profile.model===decision.model);
      if(activeContinuity&&selected)continuity.select(id,selected);
      await put(make(decision,id,decision.model ? (config.mode==="route" ? "override_requested" : "recommended") : "kept_current"));
      if(config.mode!=="route" || !decision.model || revision!==preferenceRevision || !continuity.owns(id,sessionKey)) return;
      const slash=decision.model.indexOf("/");
      // No credential changes and no session mutations. Host still enforces policy/auth.
      // 2026.9.5 exposes no thinking override here. Never send a made-up field.
      return {providerOverride:decision.model.slice(0,slash),modelOverride:decision.model.slice(slash+1)};
    },{timeoutMs:config.timeoutMs+1000});
    const observe = async (id:string|undefined, model:string, thinking?:string, tokens?:number) => {
      if (!id) return;
      continuity.observe(id,model);
      const row = rows.get(id) ?? await history.get(id) ?? make({reason:"routing_hook_not_observed",latencyMs:0},id,"observed_only");
      if (row.observedModel !== model) {
        delete row.observedThinking;
        delete row.tokens;
      }
      row.observedModel=model;
      if (thinking) row.observedThinking=thinking;
      if (tokens !== undefined && Number.isFinite(tokens) && tokens >= 0) row.tokens=tokens;
      if (["override_requested", "model_verified", "model_not_applied"].includes(row.status)) {
        row.status=row.selectedModel===model ? "model_verified" : "model_not_applied";
      }
      await put(row);
    };
    api.on("llm_input",(event) => observe(event.runId,event.provider+"/"+event.model));
    api.on("llm_output",(event) => observe(event.runId,event.provider+"/"+event.model,event.reasoningEffort,event.usage?.total));
    api.on("after_tool_call",(event,ctx)=>continuity.failure(event.runId??ctx.runId,event.error,event.toolCallId));
    api.on("model_call_ended",(event,ctx)=>{if(event.outcome==="error"&&!event.failureKind)continuity.failure(event.runId??ctx.runId,event.errorCategory,event.callId);});
    api.on("reply_payload_sending",async (event) => {
      const state=event.usageState;
      if(state?.provider && state.model) await observe(event.runId,state.provider+"/"+state.model,state.reasoningEffort,state.usage?.total);
    });
    api.on("agent_end",async (event,ctx) => {
      const id=event.runId ?? ctx.runId;
      continuity.finish(id,event.success);
      const row=id ? rows.get(id) ?? await history.get(id) : undefined;
      if(row && !event.success) { row.status="run_failed"; await put(row); }
    });
    api.on("session_end",(event,ctx)=>{const key=event.sessionKey??ctx.sessionKey;if(key)continuity.end(JSON.stringify([ctx.agentId??"",key]));});
    const agentConfig = (agentId?:string) => agentId ? api.config.agents?.entries?.[agentId] : undefined;
    const fallbacks = (agentId?:string) => {
      const own=agentConfig(agentId)?.model;
      const defaults=api.config.agents?.defaults?.model;
      const value=own ?? defaults;
      return value && typeof value==="object" && Array.isArray(value.fallbacks) ? value.fallbacks : [];
    };
    type GatewayModel={model:string;provider:string;name:string;input:string[];ready:boolean;configured:boolean};
    let catalogCache:{agentId?:string;expires:number;models:GatewayModel[];warning?:string}|undefined;
    const configuredCatalog=(agentId?:string) => {
      const refs=new Set(Object.keys(api.config.agents?.defaults?.models??{}));
      const add=(value:unknown) => {
        if(typeof value==="string")refs.add(value);
        else if(value && typeof value==="object"){
          const model=value as {primary?:unknown;fallbacks?:unknown};
          if(typeof model.primary==="string")refs.add(model.primary);
          if(Array.isArray(model.fallbacks))for(const item of model.fallbacks)if(typeof item==="string")refs.add(item);
        }
      };
      add(api.config.agents?.defaults?.model);add(api.config.agents?.entries?.[agentId??""]?.model);
      const probes=[...refs].filter(model=>/^[a-z0-9_-]+\/[^\s]+$/.test(model)).map((model,index)=>({id:`fallback_${index}`,model,description:"Gateway model",input:["text"]}));
      const usable=new Set(readyProfiles(probes,api.config,agentId).map(profile=>profile.model));
      const settings=api.config.agents?.defaults?.models??{};
      return probes.map(profile=>{
        const slash=profile.model.indexOf("/"),setting=settings[profile.model] as {alias?:string}|undefined;
        return {model:profile.model,provider:profile.model.slice(0,slash),name:setting?.alias??profile.model.slice(slash+1),
          input:["text"],ready:usable.has(profile.model),configured:activeProfiles.some(item=>item.model===profile.model)};
      }).sort((a,b)=>a.provider.localeCompare(b.provider)||a.name.localeCompare(b.name));
    };
    const discoverModels=async(agentId?:string) => {
      if(catalogCache && catalogCache.agentId===agentId && catalogCache.expires>Date.now()) return catalogCache;
      let data;
      try { data=await buildModelsProviderData(api.config,agentId,{view:"default"}); }
      catch { return catalogCache={agentId,expires:Date.now()+2_000,models:configuredCatalog(agentId),warning:"Gateway catalog is warming up; showing configured models."}; }
      if(!data.byProvider.size)return catalogCache={agentId,expires:Date.now()+2_000,models:configuredCatalog(agentId),warning:"Gateway catalog is warming up; showing configured models."};
      const probes=[...data.byProvider].flatMap(([provider,models])=>[...models].map((model,index)=>({
        id:`m_${provider}_${index}`,model:`${provider}/${model}`,description:"Gateway model",
        input:["text"],
      })));
      const usable=new Set(readyProfiles(probes,api.config,agentId).map(profile=>profile.model));
      const models=probes.map(profile=>{
        const slash=profile.model.indexOf("/");
        return {model:profile.model,provider:profile.model.slice(0,slash),
          name:data.modelNames.get(profile.model)??profile.model.slice(slash+1),
          input:["text"],
          ready:usable.has(profile.model),configured:activeProfiles.some(item=>item.model===profile.model)};
      }).sort((a,b)=>a.provider.localeCompare(b.provider)||a.name.localeCompare(b.name));
      return catalogCache={agentId,expires:Date.now()+30_000,models,...(data.refreshWarning?{warning:data.refreshWarning}:{})};
    };
    let preferenceWrites=Promise.resolve();
    const savePreferences=(patch:Preferences) => {
      const write=preferenceWrites.then(async()=>{
      await loaded;
      const value:Preferences={profiles:activeProfiles,optimization:activeOptimization,continuity:activeContinuity,...(activeJevKey!==undefined?{jevKey:activeJevKey}:{}),...patch};
      await preferences.save(value);
      if(value.profiles)activeProfiles=value.profiles;
      if(value.optimization)activeOptimization=value.optimization;
      if(value.continuity!==undefined)activeContinuity=value.continuity;
      if(value.jevKey!==undefined)activeJevKey=value.jevKey;
      preferenceRevision++;
      continuity.clear();
      });
      preferenceWrites=write.catch(()=>{});
      return write;
    };
    api.session.controls.registerSessionAction({
      id:"save_preferences",description:"Save Jev Router model preferences.",requiredScopes:["operator.admin"],
      schema:{type:"object",additionalProperties:false,required:["profiles"],properties:{
        agentId:{type:"string",maxLength:256},optimization:{type:"string",enum:["quality","balanced","economy"]},continuity:{type:"boolean"},
        profiles:{type:"array",maxItems:40,items:{type:"object"}},
      }},
      handler:async ctx=>{
        const payload=(ctx.payload??{}) as {agentId?:unknown;optimization?:unknown;continuity?:unknown;profiles?:unknown};
        const parsed=parseConfig({...config,profiles:payload.profiles,optimization:payload.optimization??activeOptimization,continuity:payload.continuity??activeContinuity});
        const profiles=parsed.profiles;
        const agentId=typeof payload.agentId==="string" ? payload.agentId : ctx.agentId;
        if(profiles.length){
          const discovered=new Set((await discoverModels(agentId)).models.map(item=>item.model));
          if(profiles.some(profile=>!discovered.has(profile.model)&&!activeProfiles.some(existing=>existing.id===profile.id&&existing.model===profile.model))) return {ok:false,error:"A selected model is not available for this agent.",code:"MODEL_UNAVAILABLE"};
        }
        await savePreferences({profiles,optimization:parsed.optimization,continuity:parsed.continuity});
        catalogCache=undefined;
        publish();
        return {ok:true,result:{saved:true}};
      },
    });
    api.session.controls.registerSessionAction({
      id:"configure_credential",description:"Use the host secret-store Jev credential.",requiredScopes:["operator.admin"],
      schema:{type:"object",additionalProperties:false},
      handler:async()=>{
        await savePreferences({jevKey:{source:"store",provider:"default",id:"JEV_ROUTER_API_KEY"}});
        publish();
        return {ok:true,result:{configured:true}};
      },
    });
    return {
      snapshot: async (input,ctx) => {
        const agentId=input.agentId ?? (ctx.source==="tool" ? ctx.tool.agentId
          : ctx.source==="session-action" ? ctx.action.agentId : undefined);
        const available=await eligible(agentId);
        let catalog:{models:GatewayModel[];warning?:string}={models:[]};
        try { catalog=await discoverModels(agentId); } catch { catalog={models:[],warning:"Gateway model discovery is temporarily unavailable."}; }
        let credentialStatus="configured";
        try { await credential(api.config,activeJevKey); } catch (error) { credentialStatus=(error as Error).message==="credential_missing" ? "missing" : "unreadable"; }
        return { mode:config.mode,optimization:activeOptimization,continuity:activeContinuity,
        limitations:[
          "Thinking selection is advisory: this host has no per-turn thinking override hook.",
          "Locked native sessions skip model routing. Observed-only records are not routing successes.",
          "Known unusable auth profiles are excluded. Unknown readiness keeps the current model; network health is not guaranteed.",
          "Tokens are reported usage, not remaining Pro allowance.",
          "Task continuity stores only the prior route and failure counters in memory; no prompt history is retained.",
        ],
        health:{...(agentId?{agentId}:{}),credential:credentialStatus,readyProfiles:available.length,totalProfiles:activeProfiles.length,
          gatewayModels:catalog.models.length,...(catalog.warning?{catalogWarning:catalog.warning}:{}),
          fallbacks:fallbacks(agentId),history:history.backend},
        profiles: profileStatuses(activeProfiles,api.config.agents?.defaults?.modelPolicy?.allow,
          agentConfig(agentId)?.modelPolicy?.allow,available),
        gatewayModels:[...catalog.models].sort((a,b)=>Number(b.configured)-Number(a.configured)).slice(0,500),
        records:await history.list(),
      };},
      preview: async ({prompt,agentId:requestedAgentId},ctx) => {
        const agentId=requestedAgentId ?? (ctx.source==="tool" ? ctx.tool.agentId
          : ctx.source==="session-action" ? ctx.action.agentId : undefined);
        return put(make(await decide(prompt,await eligible(agentId)),randomUUID(),"preview"));
      },
      clear_history: async () => { rows.clear(); await history.clear(); publish(); return {cleared:true}; },
    };
  },
});

Object.assign(feature.configSchema.jsonSchema!, configSchema);
feature.configSchema.safeParse = buildJsonPluginConfigSchema(configSchema).safeParse;
export default feature;
