import { defineControlUiPlugin } from "openclaw/plugin-sdk/control-ui";
import { createFeatureClient } from "openclaw/plugin-sdk/feature-contract";
import { contract } from "./contract.js";
import "./control-ui.css";

const labels:Record<string,string>={
  preview:"Preview",recommended:"Recommended",override_requested:"Routing requested",
  model_verified:"Model matched",model_not_applied:"Different model used",kept_current:"Kept current model",
  observed_only:"Observed",run_failed:"Run failed",
};

export default defineControlUiPlugin({
  id:contract.pluginId,
  activate(host) {
    host.ui.registerNavigation({id:"routes",label:"Jev Router",page:{id:"routes"},icon:"activity"});
    host.ui.registerPage({
      id:"routes",label:"Jev Router",
      mount(container,context) {
        const client=createFeatureClient(contract,context.host);
        const section=document.createElement("section"); section.className="jev-router";
        const header=document.createElement("header"); const heading=document.createElement("div");
        const eyebrow=document.createElement("p");eyebrow.className="eyebrow";eyebrow.textContent="Automatic model routing";
        const title=document.createElement("h1");title.textContent="Jev Router";
        const intro=document.createElement("p");intro.className="intro";intro.textContent="Choose the model most likely to produce a strong result at the lowest practical usage cost, while keeping OpenClaw policies and fallbacks in control.";
        const status=document.createElement("span");status.className="live";status.setAttribute("role","status");status.textContent="Connecting…";
        heading.append(eyebrow,title,intro);header.append(heading,status);section.append(header);

        const tabs=document.createElement("nav");tabs.className="dashboard-tabs";tabs.setAttribute("role","tablist");tabs.setAttribute("aria-label","Jev Router sections");
        const overviewPanel=document.createElement("div");overviewPanel.id="jev-overview";overviewPanel.className="tab-panel";overviewPanel.setAttribute("role","tabpanel");
        const modelsPanel=document.createElement("div");modelsPanel.id="jev-models";modelsPanel.className="tab-panel";modelsPanel.setAttribute("role","tabpanel");
        const logsPanel=document.createElement("div");logsPanel.id="jev-logs";logsPanel.className="tab-panel";logsPanel.setAttribute("role","tabpanel");
        const makeTab=(name:string,label:string,panel:HTMLElement)=>{const button=document.createElement("button");button.type="button";button.setAttribute("role","tab");button.setAttribute("aria-controls",panel.id);const text=document.createElement("span");text.textContent=label;const count=document.createElement("small");button.append(text,count);tabs.append(button);return {name,button,panel,count};};
        const dashboardTabs=[makeTab("overview","Overview",overviewPanel),makeTab("models","Models",modelsPanel),makeTab("logs","Logs",logsPanel)];
        const showTab=(name:string,focus=false)=>{for(const tab of dashboardTabs){const selected=tab.name===name;tab.button.setAttribute("aria-selected",String(selected));tab.button.tabIndex=selected?0:-1;tab.panel.hidden=!selected;if(selected&&focus)tab.button.focus();}};
        dashboardTabs.forEach((tab,index)=>{tab.button.onclick=()=>showTab(tab.name);tab.button.onkeydown=(event:KeyboardEvent)=>{const key=event.key;if(!["ArrowLeft","ArrowRight","Home","End"].includes(key))return;event.preventDefault();const next=key==="Home"?0:key==="End"?dashboardTabs.length-1:(index+(key==="ArrowRight"?1:-1)+dashboardTabs.length)%dashboardTabs.length;showTab(dashboardTabs[next].name,true);};});
        showTab("overview");

        const cards=document.createElement("div"); cards.className="status-grid";
        const card=(label:string) => {const el=document.createElement("article");el.className="status-card";const name=document.createElement("span");name.textContent=label;const value=document.createElement("strong");value.textContent="—";const note=document.createElement("small");el.append(name,value,note);cards.append(el);return {el,value,note};};
        const routingCard=card("Routing"); const jevCard=card("Jev credential");
        const modelsCard=card("Ready routes"); const gatewayCard=card("Gateway models");
        const fallbackCard=card("Fallbacks"); const historyCard=card("History storage");

        const healthBanner=document.createElement("article");healthBanner.className="health-banner";healthBanner.setAttribute("role","status");
        const healthIcon=document.createElement("span");healthIcon.className="health-icon";healthIcon.setAttribute("aria-hidden","true");healthIcon.textContent="✓";
        const healthCopy=document.createElement("div");const healthTitle=document.createElement("strong");const healthNote=document.createElement("p");healthCopy.append(healthTitle,healthNote);healthBanner.append(healthIcon,healthCopy);

        const setupSection=document.createElement("details");setupSection.className="panel setup-panel";
        const setupSummary=document.createElement("summary");const setupTitle=document.createElement("span");setupTitle.textContent="Jev connection";const setupState=document.createElement("small");setupState.textContent="Checking…";setupSummary.append(setupTitle,setupState);
        const setupBody=document.createElement("div");setupBody.className="setup-body";
        const setupHelp=document.createElement("p");setupHelp.textContent="The key is written directly to OpenClaw's secret store and restricted to Jev endpoints. It is never stored in routing history or plugin configuration.";
        const keyLabel=document.createElement("label");keyLabel.textContent="Jev API key";
        const keyInput=document.createElement("input");keyInput.type="password";keyInput.autocomplete="new-password";keyInput.maxLength=4096;keyInput.placeholder="Paste key to connect or replace";
        keyLabel.append(keyInput);
        const keyButton=document.createElement("button");keyButton.className="primary";keyButton.textContent="Save key securely";
        const keyOutput=document.createElement("output");keyOutput.setAttribute("aria-live","polite");
        keyButton.onclick=async()=>{
          const value=keyInput.value.trim();
          if(!value){keyOutput.textContent="Enter a Jev key first.";keyInput.focus();return;}
          keyButton.disabled=true;keyOutput.textContent="Saving…";
          try{
            await context.host.request("secrets.store.set",{name:"JEV_ROUTER_API_KEY",value,kind:"secret",allowedHosts:["api.typesafe.ai","openrouter.ai"]});
            keyInput.value="";
            await invokeAdmin("configure_credential",{});
            keyOutput.textContent="Jev connected. Reloading routing configuration…";
            await load();
          }catch{keyOutput.textContent="Could not save the key. Administrator access and the Gateway secret store are required.";}
          finally{keyInput.value="";keyButton.disabled=false;}
        };
        setupBody.append(setupHelp,keyLabel,keyButton,keyOutput);setupSection.append(setupSummary,setupBody);

        const profileSection=document.createElement("section"); profileSection.className="panel";
        const profileTitle=document.createElement("h2"); profileTitle.textContent="Models Jev can choose from";
        const profileHelp=document.createElement("p");profileHelp.className="pool-help";profileHelp.textContent="Jev chooses only from these configured profiles. Eligibility is shown for text prompts and the selected agent.";
        const profiles=document.createElement("div"); profiles.className="profiles"; profileSection.append(profileTitle,profileHelp,profiles);

        const catalogSection=document.createElement("section");catalogSection.className="panel";
        const catalogHead=document.createElement("div");catalogHead.className="panel-head";
        const catalogText=document.createElement("div");const catalogTitle=document.createElement("h2");catalogTitle.textContent="Gateway model preferences";
        const catalogHelp=document.createElement("p");catalogHelp.textContent="This routing pool applies Gateway-wide; availability is checked separately for each agent. Enable models and provide your relative cost and quality estimates.";
        catalogText.append(catalogTitle,catalogHelp);
        const saveProfiles=document.createElement("button");saveProfiles.className="primary";saveProfiles.textContent="Save routing pool";
        const discardProfiles=document.createElement("button");discardProfiles.textContent="Discard edits";
        catalogHead.append(catalogText);
        const catalogNotice=document.createElement("output");catalogNotice.setAttribute("aria-live","polite");
        const policy=document.createElement("div");policy.className="routing-policy";
        const optimizationLabel=document.createElement("label");optimizationLabel.textContent="Optimization goal";
        const optimization=document.createElement("select");
        for(const [value,text] of [["balanced","Balanced — strong output with fewer retries"],["quality","Quality first — cost breaks close ties"],["economy","Economy first — upgrade only when necessary"]]){const option=document.createElement("option");option.value=value;option.textContent=text;optimization.append(option);}
        optimizationLabel.append(optimization);
        const policyNote=document.createElement("p");policyNote.className="muted";
        const continuityLabel=document.createElement("label");continuityLabel.className="model-toggle";
        const continuity=document.createElement("input");continuity.type="checkbox";continuity.checked=true;
        const continuityText=document.createElement("span");continuityText.textContent="Keep the model for short task follow-ups";continuityLabel.append(continuity,continuityText);
        const continuityNote=document.createElement("p");continuityNote.className="muted";continuityNote.textContent="Reuses a verified route for explicit short follow-ups for up to two hours. Repeated argument/format failures may upgrade an unsuccessful task’s next follow-up. Network and permission failures do not trigger upgrades. No prompt history is stored.";
        policy.append(optimizationLabel,policyNote,continuityLabel,continuityNote);
        const catalogTools=document.createElement("div");catalogTools.className="catalog-tools";
        const searchLabel=document.createElement("label");searchLabel.textContent="Find a model";
        const search=document.createElement("input");search.type="search";search.placeholder="Search model, provider, or profile";searchLabel.append(search);
        const filterLabel=document.createElement("label");filterLabel.textContent="Show";
        const filter=document.createElement("select");
        for(const [value,text] of [["all","All models"],["selected","Selected only"],["available","Available"],["unavailable","Unavailable"]]){const option=document.createElement("option");option.value=value;option.textContent=text;filter.append(option);}filter.value="all";filterLabel.append(filter);
        const catalogCount=document.createElement("span");catalogCount.className="catalog-count";catalogCount.setAttribute("role","status");catalogTools.append(searchLabel,filterLabel,catalogCount);
        const gatewayModels=document.createElement("div");gatewayModels.className="gateway-models";
        const estimatesNotice=document.createElement("p");estimatesNotice.className="muted";estimatesNotice.setAttribute("role","status");
        const catalogActions=document.createElement("div");catalogActions.className="catalog-actions";
        const dirtyLabel=document.createElement("span");dirtyLabel.textContent="Preferences saved";catalogActions.append(dirtyLabel,discardProfiles,saveProfiles);
        catalogSection.append(catalogHead,policy,catalogNotice,estimatesNotice,catalogTools,gatewayModels,catalogActions);

        const preview=document.createElement("section"); preview.className="panel";
        const previewTitle=document.createElement("h2"); previewTitle.textContent="Try a route";
        const previewHelp=document.createElement("p"); previewHelp.textContent="See what Jev would choose. This does not run the task or change your session.";
        const label=document.createElement("label"); label.textContent="Task description";
        const input=document.createElement("textarea"); input.maxLength=16000; input.placeholder="Example: Debug a race condition in a Django payment workflow"; label.append(input);
        const privacy=document.createElement("p"); privacy.className="muted"; privacy.textContent="A bounded, best-effort-redacted excerpt is sent to your configured Jev service. Do not paste secrets.";
        const previewButton=document.createElement("button"); previewButton.className="primary"; previewButton.textContent="Preview choice";
        const output=document.createElement("output"); output.setAttribute("aria-live","polite");
        previewButton.onclick=async()=>{
          if(!input.value.trim()) {output.textContent="Describe a task first.";input.focus();return;}
          previewButton.disabled=true; output.textContent="Checking…";
          try{
            const row=await client.invoke("preview",{prompt:input.value,...agentPayload()},options());
            output.textContent=row.selectedModel
              ? `${row.selectedModel} · ${row.selectedThinking??"current"} thinking (recommended only) · ${Math.round((row.confidence??0)*100)}% classifier confidence`
              : `Keep the current model · ${row.reason.replaceAll("_"," ")}`;
          }catch{output.textContent="Preview unavailable. Check the Jev credential and Gateway connection.";}
          finally{if(!context.signal.aborted) previewButton.disabled=false;}
        };
        output.className="preview-result";preview.append(previewTitle,previewHelp,label,privacy,previewButton,output);

        const historySection=document.createElement("section"); historySection.className="panel";
        const historyHead=document.createElement("div"); historyHead.className="panel-head";
        const historyText=document.createElement("div"); const historyTitle=document.createElement("h2");historyTitle.textContent="Decision history";const historyNote=document.createElement("p");historyNote.textContent="Latest 200 decisions, stored locally. Prompts and credentials are never stored.";historyText.append(historyTitle,historyNote);
        const actions=document.createElement("div"); actions.className="actions";
        const refresh=document.createElement("button"); refresh.textContent="Refresh";
        const clear=document.createElement("button"); clear.className="danger"; clear.textContent="Clear history";
        actions.append(refresh,clear); historyHead.append(historyText,actions);
        const wrapper=document.createElement("div"); wrapper.className="jev-router-table";
        const table=document.createElement("table"); const head=table.createTHead().insertRow();
        const historyColumns=["Time","Result","Jev choice","Actually used","Why","Performance"];
        for(const name of historyColumns){const th=document.createElement("th");th.scope="col";th.textContent=name;head.append(th);}
        const body=table.createTBody();wrapper.append(table);historySection.append(historyHead,wrapper);

        const details=document.createElement("details"); details.className="panel limitations";
        const summary=document.createElement("summary");summary.textContent="Current limitations";
        const limitations=document.createElement("ul");details.append(summary,limitations);

        type DraftProfile={id:string;model:string;description:string;thinking?:string;input:string[];cost:string;quality:string};
        let confirming=false; let loading=false; let preferencesDirty=false;let editVersion=0;let draftAgent:string|undefined;
        const profileDrafts=new Map<string,DraftProfile>();
        let catalogRows:Array<{el:HTMLElement;searchText:string;enabled:boolean;ready:boolean}>=[];
        const updateCatalogState=()=>{
          catalogActions.classList.toggle("dirty",preferencesDirty);
          dirtyLabel.textContent=preferencesDirty?"Unsaved changes":"Preferences saved";
          discardProfiles.disabled=!preferencesDirty;
        };
        const applyCatalogFilter=()=>{
          const term=search.value.trim().toLowerCase();let visible=0;
          for(const row of catalogRows){
            const matchesText=!term||row.searchText.includes(term);
            const matchesFilter=filter.value==="all"||(filter.value==="selected"&&row.enabled)||(filter.value==="available"&&row.ready)||(filter.value==="unavailable"&&!row.ready);
            row.el.hidden=!(matchesText&&matchesFilter);if(!row.el.hidden)visible++;
          }
          catalogCount.textContent=`${visible} of ${catalogRows.length} shown · ${profileDrafts.size} selected`;
        };
        const markDirty=()=>{preferencesDirty=true;editVersion++;catalogNotice.textContent="Unsaved routing preferences.";updateCatalogState();};
        search.oninput=applyCatalogFilter;filter.onchange=applyCatalogFilter;updateCatalogState();
        const estimateWarning=()=>{
          const values=[...profileDrafts.values()];
          estimatesNotice.textContent=values.length>1 && new Set(values.map(p=>`${p.cost}/${p.quality}`)).size===1
            ? "All enabled profiles have identical cost and quality ratings. Jev can still use their descriptions, but these ratings cannot help it balance cost against quality. Adjust them using your own evaluations."
            : "Cost and quality are your estimates—not measured prices or guaranteed results.";
        };
        const selectedAgent=()=>context.host.agents.selectedId ?? context.host.agents.defaultId ?? undefined;
        const agentPayload=()=>{const agentId=selectedAgent();return agentId?{agentId}:{};};
        const options=()=>{
          const agentId=selectedAgent(),sessionKey=context.host.sessions.selectedKey;
          return {...(agentId?{agentId}:{}),...(sessionKey?{sessionKey}:{})};
        };
        const invokeAdmin=async(actionId:string,payload:Record<string,unknown>)=>{
          const response=await context.host.request<{ok?:true;result?:unknown;error?:string}>("plugins.sessionAction",{
            pluginId:contract.pluginId,actionId,payload,...options(),
          });
          if(response?.ok!==true) throw Error(response?.error??"Action failed");
          return response.result;
        };
        const policyCopy=()=>policyNote.textContent=optimization.value==="quality"
          ? "Asks Jev to prioritize reliable output, using lower cost to break close ties."
          : optimization.value==="economy"
            ? "Asks Jev to prefer lower-cost models unless they are unlikely to complete the task correctly."
            : "Asks Jev to balance quality and cost, accounting for likely retries. Savings and answer quality are not measured automatically.";
        optimization.onchange=()=>{markDirty();policyCopy();};
        continuity.onchange=markDirty;
        policyCopy();
        const tier=(thinking?:string)=>thinking==="high"||thinking==="xhigh"||thinking==="max"?"deep":thinking==="medium"||thinking==="adaptive"?"balanced":"routine";
        const preset=(kind:string,name:string)=>kind==="deep"
          ? {thinking:"high",description:`${name} for difficult debugging, architecture and complex multi-step work requiring intensive reasoning.`}
          : kind==="balanced"
            ? {thinking:"medium",description:`${name} for general-purpose work, moderate coding and tasks requiring balanced reasoning.`}
            : {thinking:"low",description:`${name} for simple questions, formatting, summaries and routine coding.`};
        const renderCatalog=(snapshot:Awaited<ReturnType<typeof client.invoke<"snapshot">>>) => {
          if(preferencesDirty)return;
          draftAgent=selectedAgent();
          profileDrafts.clear();
          optimization.value=snapshot.optimization;continuity.checked=snapshot.continuity;policyCopy();
          for(const profile of snapshot.profiles) profileDrafts.set(profile.id,{id:profile.id,model:profile.model,description:profile.description,...(profile.thinking?{thinking:profile.thinking}:{}),input:[...profile.input],cost:profile.cost,quality:profile.quality});
          const used=new Set([...profileDrafts.values()].map(profile=>profile.id));
          const makeId=(model:string)=>{
            const base=("model_"+model.toLowerCase().replace(/[^a-z0-9]+/g,"_").replace(/_+$/,"")).slice(0,44);
            let id=base||"model",suffix=2;
            while(used.has(id)) id=(base.slice(0,44-String(suffix).length)+"_"+suffix++);
            used.add(id);return id;
          };
          const catalog=new Map(snapshot.gatewayModels.map(model=>[model.model,model]));
          const entries=[...snapshot.profiles.map(profile=>({model:catalog.get(profile.model)??{model:profile.model,name:profile.model,input:profile.input,ready:false},existing:profileDrafts.get(profile.id)})),
            ...snapshot.gatewayModels.filter(model=>!snapshot.profiles.some(profile=>profile.model===model.model)).map(model=>({model,existing:undefined}))];
          catalogRows=[];
          gatewayModels.replaceChildren(...entries.map(({model,existing})=>{
            let choice=existing??{id:makeId(model.model),model:model.model,...preset("routine",model.name),input:[...model.input],cost:"medium",quality:"strong"};
            const el=document.createElement("article");el.className="gateway-model"+(model.ready?"":" unavailable")+(existing?" selected":"");
            const top=document.createElement("div");top.className="profile-head";
            const checkLabel=document.createElement("label");checkLabel.className="model-toggle";
            const checkbox=document.createElement("input");checkbox.type="checkbox";checkbox.checked=Boolean(existing);checkbox.disabled=!model.ready&&!existing;
            const name=document.createElement("strong");name.textContent=existing?`${model.name} · ${existing.id}`:model.name;checkLabel.append(checkbox,name);
            const badge=document.createElement("small");badge.textContent=model.ready?"Authorized":"Unavailable · preserved";top.append(checkLabel,badge);
            const ref=document.createElement("code");ref.textContent=model.model;
            const meta=document.createElement("span");meta.className="profile-meta";meta.textContent=`Inputs: ${model.input.join(", ")} · capability details remain Gateway-owned`;
            const config=document.createElement("div");config.className="model-config";config.hidden=!existing;
            const purposeLabel=document.createElement("label");purposeLabel.textContent="Purpose";
            const purpose=document.createElement("select");
            for(const [value,text] of [["routine","Routine"],["balanced","Balanced"],["deep","Deep reasoning"]]){const option=document.createElement("option");option.value=value;option.textContent=text;purpose.append(option);}
            purpose.value=tier(choice.thinking);purpose.disabled=!checkbox.checked;purposeLabel.append(purpose);
            const estimates=document.createElement("div");estimates.className="model-estimates";
            const costLabel=document.createElement("label");costLabel.textContent="Relative usage cost";
            const cost=document.createElement("select");for(const [value,text] of [["low","Low"],["medium","Medium"],["high","High"]]){const option=document.createElement("option");option.value=value;option.textContent=text;cost.append(option);}cost.value=choice.cost;cost.disabled=!checkbox.checked;costLabel.append(cost);
            const qualityLabel=document.createElement("label");qualityLabel.textContent="Expected output quality";
            const quality=document.createElement("select");for(const [value,text] of [["standard","Standard"],["strong","Strong"],["best","Best available"]]){const option=document.createElement("option");option.value=value;option.textContent=text;quality.append(option);}quality.value=choice.quality;quality.disabled=!checkbox.checked;qualityLabel.append(quality);
            estimates.append(costLabel,qualityLabel);
            const descriptionLabel=document.createElement("label");descriptionLabel.textContent="When Jev should use it";
            const description=document.createElement("textarea");description.maxLength=500;description.value=choice.description;description.disabled=!checkbox.checked;descriptionLabel.append(description);
            const row={el,searchText:`${model.name} ${model.model} ${"provider" in model?model.provider:""} ${existing?.id??""}`.toLowerCase(),enabled:Boolean(existing),ready:model.ready};catalogRows.push(row);
            const changed=()=>{markDirty();estimateWarning();applyCatalogFilter();};
            checkbox.onchange=()=>{purpose.disabled=!checkbox.checked;cost.disabled=!checkbox.checked;quality.disabled=!checkbox.checked;description.disabled=!checkbox.checked;config.hidden=!checkbox.checked;row.enabled=checkbox.checked;el.classList.toggle("selected",checkbox.checked);if(checkbox.checked)profileDrafts.set(choice.id,choice);else profileDrafts.delete(choice.id);changed();};
            purpose.onchange=()=>{choice={...choice,...preset(purpose.value,model.name)};description.value=choice.description;if(checkbox.checked)profileDrafts.set(choice.id,choice);changed();};
            cost.onchange=()=>{choice={...choice,cost:cost.value};if(checkbox.checked)profileDrafts.set(choice.id,choice);changed();};
            quality.onchange=()=>{choice={...choice,quality:quality.value};if(checkbox.checked)profileDrafts.set(choice.id,choice);changed();};
            description.oninput=()=>{choice={...choice,description:description.value};if(checkbox.checked)profileDrafts.set(choice.id,choice);changed();};
            config.append(purposeLabel,estimates,descriptionLabel);el.append(top,ref,meta,config);return el;
          }));
          catalogNotice.textContent=snapshot.health.catalogWarning??`${snapshot.health.gatewayModels} models discovered from this Gateway.${snapshot.health.gatewayModels>snapshot.gatewayModels.length?" Showing the first 500, plus saved profiles.":""}`;
          estimateWarning();
          applyCatalogFilter();updateCatalogState();
        };
        saveProfiles.onclick=async()=>{
          if(!context.host.connection.canAdmin){catalogNotice.textContent="Administrator access is required to change routing preferences.";return;}
          if(draftAgent!==selectedAgent()){catalogNotice.textContent="The selected agent changed. Discard edits to reload its available models before saving.";return;}
          const selected=[...profileDrafts.values()];
          if(selected.length>40){catalogNotice.textContent="Choose up to 40 routing profiles.";return;}
          if(selected.some(profile=>!profile.description.trim())){catalogNotice.textContent="Every selected model needs a routing description.";return;}
          saveProfiles.disabled=true;catalogNotice.textContent="Saving…";
          const savingVersion=editVersion;
          try{
            await invokeAdmin("save_preferences",{...agentPayload(),optimization:optimization.value,continuity:continuity.checked,profiles:selected});
            if(editVersion===savingVersion)preferencesDirty=false;
            updateCatalogState();catalogNotice.textContent=preferencesDirty?"Saved. Your newer edits are still unsaved.":"Routing preferences saved. Reloading…";await load();
          }catch{catalogNotice.textContent="Could not save routing preferences. Refresh and try again.";}
          finally{saveProfiles.disabled=false;}
        };
        if(!context.host.connection.canAdmin){keyButton.disabled=true;saveProfiles.disabled=true;keyOutput.textContent="Administrator access is required for setup changes.";}
        const setCard=(card:{el:HTMLElement,value:HTMLElement,note:HTMLElement},value:string,note:string,ok=true)=>{card.value.textContent=value;card.note.textContent=note;card.el.classList.toggle("warning",!ok);};
        const render=(snapshot:Awaited<ReturnType<typeof client.invoke<"snapshot">>>) => {
          status.textContent=`Live · ${snapshot.health.agentId??"default agent"}`;
          dashboardTabs[1].count.textContent=String(snapshot.health.gatewayModels);dashboardTabs[2].count.textContent=String(snapshot.records.length);
          const credentialReady=snapshot.health.credential==="configured";
          const routingReady=credentialReady&&snapshot.health.readyProfiles>0&&snapshot.health.gatewayModels>0;
          healthBanner.classList.toggle("warning",!routingReady||snapshot.mode!=="route");
          healthIcon.textContent=routingReady&&snapshot.mode==="route"?"✓":"!";
          if(!credentialReady){healthTitle.textContent="Connect Jev to start routing";healthNote.textContent="Add a credential below, then configure at least one eligible model.";}
          else if(snapshot.health.gatewayModels===0){healthTitle.textContent="No Gateway models discovered";healthNote.textContent="Check provider configuration. Jev will keep the current model until the catalog is available.";}
          else if(snapshot.health.readyProfiles===0){healthTitle.textContent="Routing pool needs attention";healthNote.textContent="Select at least one available model for this agent.";}
          else if(snapshot.mode!=="route"){healthTitle.textContent="Jev is observing, not switching models";healthNote.textContent="Decisions are recorded, but OpenClaw keeps the current model.";}
          else{healthTitle.textContent="Routing is ready";healthNote.textContent=`Jev can choose between ${snapshot.health.readyProfiles} eligible ${snapshot.health.readyProfiles===1?"profile":"profiles"} for this agent.`;}
          setupState.textContent=credentialReady?"Connected":"Action required";setupSection.open=!credentialReady;setupSection.classList.toggle("attention",!credentialReady);
          setCard(routingCard,snapshot.mode==="route"?"On":"Observe only",`${snapshot.optimization[0].toUpperCase()+snapshot.optimization.slice(1)} optimization`,snapshot.mode==="route");
          setCard(jevCard,snapshot.health.credential==="configured"?"Connected":"Needs attention",snapshot.health.credential==="configured"?"Credential found":snapshot.health.credential,snapshot.health.credential==="configured");
          setCard(modelsCard,`${snapshot.health.readyProfiles} of ${snapshot.health.totalProfiles}`,snapshot.health.readyProfiles?"Available to this agent":"No eligible model",snapshot.health.readyProfiles>0);
          setCard(gatewayCard,String(snapshot.health.gatewayModels),snapshot.health.catalogWarning??"Discovered for this agent",snapshot.health.gatewayModels>0);
          setCard(fallbackCard,String(snapshot.health.fallbacks.length),snapshot.health.fallbacks.length?snapshot.health.fallbacks.join(" → "):"No fallback configured",snapshot.health.fallbacks.length>0);
          setCard(historyCard,"Persistent",snapshot.health.history,true);
          if(snapshot.profiles.length)profiles.replaceChildren(...snapshot.profiles.map(profile=>{const el=document.createElement("article");el.className="profile"+(profile.ready?"":" unavailable");const top=document.createElement("div");top.className="profile-head";const name=document.createElement("strong");name.textContent=profile.id;const badge=document.createElement("small");badge.textContent=profile.ready?"Eligible":"Excluded";top.append(name,badge);const model=document.createElement("code");model.textContent=profile.model;const description=document.createElement("p");description.textContent=profile.description;const meta=document.createElement("span");meta.className="profile-meta";meta.textContent=`Cost: ${profile.cost} · Quality: ${profile.quality} · Inputs: ${profile.input.join(", ")} · Thinking: ${profile.thinking??"unchanged"}`;const reason=document.createElement("span");reason.className="profile-reason";reason.textContent=profile.reason;el.append(top,model,description,meta,reason);return el;}));
          else{const empty=document.createElement("div");empty.className="empty-state";const emptyTitle=document.createElement("strong");emptyTitle.textContent="No routing profiles yet";const emptyNote=document.createElement("p");emptyNote.textContent="Choose models in Gateway model preferences below.";empty.append(emptyTitle,emptyNote);profiles.replaceChildren(empty);}
          renderCatalog(snapshot);
          limitations.replaceChildren(...snapshot.limitations.map(text=>{const li=document.createElement("li");li.textContent=text;return li;}));
          body.replaceChildren();
          if(!snapshot.records.length){const cell=body.insertRow().insertCell();cell.colSpan=6;cell.className="empty";cell.textContent="No decisions yet. Send a message or preview a task to create the first entry.";}
          for(const row of snapshot.records){
            const tr=body.insertRow();
            const choice=row.selectedModel?`${row.selectedProfile?row.selectedProfile+" · ":""}${row.selectedModel} · ${row.selectedThinking??"current"} (recommended)`:"—";
            const actual=row.observedModel?`${row.observedModel} · ${row.observedThinking??"not reported"}`:"Not observed";
            [new Date(row.at).toLocaleString(),labels[row.status]??row.status,choice,actual,row.reason.replaceAll("_"," "),`${row.latencyMs} ms${row.tokens===undefined?"":` · ${row.tokens} tokens`}`].forEach((value,index)=>{const cell=tr.insertCell();cell.setAttribute("data-label",historyColumns[index]);cell.textContent=String(value);});
          }
        };
        const load=async()=>{
          if(loading||context.signal.aborted)return;loading=true;
          const agent=selectedAgent();
          try{const snapshot=await client.invoke("snapshot",agentPayload(),options());if(!context.signal.aborted&&agent===selectedAgent())render(snapshot);}
          catch{status.textContent="Disconnected · retrying automatically";}
          finally{loading=false;}
        };
        refresh.onclick=()=>void load();
        discardProfiles.onclick=()=>{preferencesDirty=false;editVersion++;search.value="";filter.value="all";updateCatalogState();void load();};
        clear.onclick=async()=>{
          if(!confirming){confirming=true;clear.textContent="Click again to confirm";setTimeout(()=>{confirming=false;clear.textContent="Clear history";},5000);return;}
          clear.disabled=true;
          try{await client.invoke("clear_history",{},options());await load();}
          finally{confirming=false;clear.disabled=false;clear.textContent="Clear history";}
        };
        const stop=client.watch("snapshot",agentPayload(),{events:["changed"],...options(),onChange:()=>void load(),onError(){status.textContent="Disconnected · retrying automatically";}});
        void load();
        const timer=globalThis.setInterval(()=>void load(),5000);
        const workspace=document.createElement("div");workspace.className="workspace-grid";workspace.append(profileSection,preview);
        overviewPanel.append(healthBanner,cards,setupSection,workspace,details);modelsPanel.append(catalogSection);logsPanel.append(historySection);
        section.append(tabs,overviewPanel,modelsPanel,logsPanel);container.append(section);
        return {dispose(){stop();globalThis.clearInterval(timer);section.remove();}};
      },
    });
  },
});
