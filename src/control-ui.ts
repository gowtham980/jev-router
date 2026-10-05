import { defineControlUiPlugin } from "openclaw/plugin-sdk/control-ui";
import { createFeatureClient } from "openclaw/plugin-sdk/feature-contract";
import { contract } from "./contract.js";
import { summarize, analyzeUsage } from "./insights.js";
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
        const analyticsPanel=document.createElement("div");analyticsPanel.id="jev-analytics";analyticsPanel.className="tab-panel";analyticsPanel.setAttribute("role","tabpanel");
        const logsPanel=document.createElement("div");logsPanel.id="jev-logs";logsPanel.className="tab-panel";logsPanel.setAttribute("role","tabpanel");
        const makeTab=(name:string,label:string,panel:HTMLElement)=>{const button=document.createElement("button");button.type="button";button.setAttribute("role","tab");button.setAttribute("aria-controls",panel.id);const text=document.createElement("span");text.textContent=label;const count=document.createElement("small");button.append(text,count);tabs.append(button);return {name,button,panel,count};};
        const dashboardTabs=[makeTab("overview","Overview",overviewPanel),makeTab("analytics","Analytics",analyticsPanel),makeTab("models","Models",modelsPanel),makeTab("logs","Logs",logsPanel)];
        const showTab=(name:string,focus=false)=>{for(const tab of dashboardTabs){const selected=tab.name===name;tab.button.setAttribute("aria-selected",String(selected));tab.button.tabIndex=selected?0:-1;tab.panel.hidden=!selected;if(selected&&focus)tab.button.focus();}};
        dashboardTabs.forEach((tab,index)=>{tab.button.onclick=()=>showTab(tab.name);tab.button.onkeydown=(event:KeyboardEvent)=>{const key=event.key;if(!["ArrowLeft","ArrowRight","Home","End"].includes(key))return;event.preventDefault();const next=key==="Home"?0:key==="End"?dashboardTabs.length-1:(index+(key==="ArrowRight"?1:-1)+dashboardTabs.length)%dashboardTabs.length;showTab(dashboardTabs[next].name,true);};});
        showTab("overview");

        const cards=document.createElement("div"); cards.className="status-grid";
        const card=(label:string) => {const el=document.createElement("article");el.className="status-card";const name=document.createElement("span");name.textContent=label;const value=document.createElement("strong");value.textContent="—";const note=document.createElement("small");el.append(name,value,note);cards.append(el);return {el,value,note};};
        const routingCard=card("Routing"); const jevCard=card("Jev credential");
        const modelsCard=card("Ready routes"); const gatewayCard=card("Gateway models");
        const fallbackCard=card("Fallbacks"); const historyCard=card("History storage");

        const insights=document.createElement("section");insights.className="panel insights";
        const insightsHead=document.createElement("div");insightsHead.className="panel-head";
        const insightsTitle=document.createElement("h2");insightsTitle.textContent="How routing is doing";
        const insightsScope=document.createElement("p");insightsScope.className="muted";insightsScope.textContent="Gateway-wide, based on up to 200 recent local records. A model match is not a measure of answer quality.";
        const periodLabel=document.createElement("label");periodLabel.textContent="Period";
        const period=document.createElement("select");
        for(const [value,name] of [["all","All recent records"],["day","Last 24 hours"],["week","Last 7 days"]]){const option=document.createElement("option");option.value=value;option.textContent=name;period.append(option);}periodLabel.append(period);
        insightsHead.append(insightsTitle,periodLabel);
        const insightStats=document.createElement("div");insightStats.className="insight-stats";
        const insightModels=document.createElement("div");insightModels.className="insight-models";
        const insightNote=document.createElement("p");insightNote.className="insight-note";
        insights.append(insightsHead,insightsScope,insightStats,insightModels,insightNote);

        const analytics=document.createElement("section");analytics.className="panel analytics";
        const analyticsTitle=document.createElement("h2");analyticsTitle.textContent="Model utilization & outcome";
        const analyticsScope=document.createElement("p");analyticsScope.className="muted";analyticsScope.textContent="Observed models only · latest 200 locally stored records · last 7 days. Feedback is optional and never inferred from a model match.";
        const analyticsStats=document.createElement("div");analyticsStats.className="insight-stats";
        const usageRows=document.createElement("div");usageRows.className="usage-rows";
        const weeklyReview=document.createElement("p");weeklyReview.className="insight-note";
        const estimateTitle=document.createElement("h2");estimateTitle.textContent="Cost estimate settings";
        const estimateHelp=document.createElement("p");estimateHelp.className="muted";estimateHelp.textContent="Optional API prices in USD per million input/output tokens. Subscription plans are not per-token spend. Savings compares the same observed token counts against your chosen baseline; it does not predict what that model would actually consume.";
        const guardrails=document.createElement("div");guardrails.className="analytics-config";
        const billingLabel=document.createElement("label");billingLabel.textContent="Billing setup";const billing=document.createElement("select");for(const [value,name] of [["subscription","Subscription / no per-token bill"],["api","API token pricing"]]){const option=document.createElement("option");option.value=value;option.textContent=name;billing.append(option);}billingLabel.append(billing);
        const thresholdLabel=document.createElement("label");thresholdLabel.textContent="Minimum route confidence";
        const threshold=document.createElement("input");threshold.type="number";threshold.min="0";threshold.max="1";threshold.step="0.01";thresholdLabel.append(threshold);
        const pinLabel=document.createElement("label");pinLabel.textContent="Pin model (Gateway-wide, optional)";const pin=document.createElement("select");pinLabel.append(pin);
        const baselineLabel=document.createElement("label");baselineLabel.textContent="Savings baseline";const baseline=document.createElement("select");baselineLabel.append(baseline);
        guardrails.append(billingLabel,thresholdLabel,pinLabel,baselineLabel);
        const rateRows=document.createElement("div");rateRows.className="rate-rows";
        const saveAnalytics=document.createElement("button");saveAnalytics.className="primary";saveAnalytics.textContent="Save analytics settings";
        const analyticsNotice=document.createElement("output");analyticsNotice.setAttribute("aria-live","polite");
        const analyticsSettings=document.createElement("section");analyticsSettings.className="panel";analyticsSettings.append(estimateTitle,estimateHelp,guardrails,rateRows,saveAnalytics,analyticsNotice);
        analytics.append(analyticsTitle,analyticsScope,analyticsStats,usageRows,weeklyReview);
        let analyticsDirty=false;let rateInputs=new Map<string,{input:HTMLInputElement;output:HTMLInputElement}>();
        const populateAnalytics=(snapshot:Awaited<ReturnType<typeof client.invoke<"snapshot">>>)=>{
          if(analyticsDirty)return;
          threshold.value=String(snapshot.minConfidence);billing.value=snapshot.pricing.billing??"subscription";
          const models=[...new Set(snapshot.profiles.map(profile=>profile.model))];
          const fill=(select:HTMLSelectElement,empty:string,selected?:string)=>{select.replaceChildren();for(const model of ["",...models]){const option=document.createElement("option");option.value=model;option.textContent=model||empty;select.append(option);}select.value=selected&&models.includes(selected)?selected:"";};
          fill(pin,"No pin — Jev decides",snapshot.pinnedModel);fill(baseline,"No baseline",snapshot.pricing.baselineModel);
          rateInputs=new Map();rateRows.replaceChildren();
          for(const model of models){const row=document.createElement("div");row.className="rate-row";const name=document.createElement("code");name.textContent=model;
            const fields:{input:HTMLInputElement;output:HTMLInputElement}={input:document.createElement("input"),output:document.createElement("input")};
            for(const kind of ["input","output"] as const){const label=document.createElement("label");label.textContent=kind==="input"?"Input $ / 1M":"Output $ / 1M";const field=fields[kind];field.type="number";field.min="0";field.max="10000";field.step="any";field.placeholder="—";field.value=snapshot.pricing.rates[model]?.[kind]?.toString()??"";label.append(field);row.append(label);}
            row.prepend(name);rateRows.append(row);rateInputs.set(model,fields);}
        };
        analyticsSettings.addEventListener("input",()=>{analyticsDirty=true;analyticsNotice.textContent="Unsaved analytics settings";});
        analyticsSettings.addEventListener("change",()=>{analyticsDirty=true;analyticsNotice.textContent="Unsaved analytics settings";});
        saveAnalytics.onclick=async()=>{const rates:Record<string,{input:number;output:number}>={};
          for(const [model,fields] of rateInputs){const a=fields.input.value.trim(),b=fields.output.value.trim();if(!a&&!b)continue;
            if(!a||!b||!fields.input.checkValidity()||!fields.output.checkValidity()){analyticsNotice.textContent="Enter both input and output prices for each priced model.";return;}rates[model]={input:Number(a),output:Number(b)};}
          if(!threshold.checkValidity()||!threshold.value){analyticsNotice.textContent="Confidence must be between 0 and 1.";return;}
          saveAnalytics.disabled=true;analyticsNotice.textContent="Saving…";
          try{await invokeAdmin("save_analytics",{minConfidence:Number(threshold.value),pinnedModel:pin.value,pricing:{billing:billing.value,baselineModel:baseline.value,rates}});analyticsDirty=false;analyticsNotice.textContent="Analytics settings saved.";await load();}
          catch{analyticsNotice.textContent="Could not save settings. Check administrator access and try again.";}
          finally{saveAnalytics.disabled=!context.host.connection.canAdmin;}
        };
        if(!context.host.connection.canAdmin)saveAnalytics.disabled=true;

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

        const guide=document.createElement("section");guide.className="panel setup-guide";
        const guideTitle=document.createElement("h2");guideTitle.textContent="Get started";
        const guideSteps=document.createElement("ol");
        const connectStep=document.createElement("li");const modelsStep=document.createElement("li");const routingStep=document.createElement("li");const verifyStep=document.createElement("li");
        guideSteps.append(connectStep,modelsStep,routingStep,verifyStep);
        const guideActions=document.createElement("div");guideActions.className="guide-actions";
        const modelsLink=document.createElement("button");modelsLink.textContent="Choose models";modelsLink.onclick=()=>showTab("models",true);
        const routeButton=document.createElement("button");routeButton.className="primary";routeButton.textContent="Enable routing";
        const routeOutput=document.createElement("output");routeOutput.setAttribute("aria-live","polite");
        const logsLink=document.createElement("button");logsLink.textContent="View Logs";logsLink.onclick=()=>showTab("logs",true);
        guideActions.append(modelsLink,routeButton,logsLink);guide.append(guideTitle,guideSteps,guideActions,routeOutput);
        routeButton.onclick=async()=>{
          const next=routeButton.dataset.mode==="route"?"observe":"route";
          routeButton.disabled=true;routeOutput.textContent=next==="route"?"Enabling routing…":"Pausing routing…";
          try{await invokeAdmin("set_mode",{mode:next,...agentPayload()});routeOutput.textContent=next==="route"?"Routing enabled. Send a real message, then check Logs for the model actually used.":"Routing paused. Jev will observe without switching models.";await load();}
          catch(error){routeOutput.textContent=error instanceof Error?error.message:"Could not change routing mode. Check administrator access and Gateway connection.";}
          finally{routeButton.disabled=!context.host.connection.canAdmin||preferencesDirty;}
        };

        const profileSection=document.createElement("section"); profileSection.className="panel";
        const profileTitle=document.createElement("h2"); profileTitle.textContent="Models Jev can choose from";
        const profileHelp=document.createElement("p");profileHelp.className="pool-help";profileHelp.textContent="Jev chooses only from these configured profiles. Eligibility is shown for text prompts and the selected agent.";
        const profiles=document.createElement("div"); profiles.className="profiles"; profileSection.append(profileTitle,profileHelp,profiles);

        const starterSection=document.createElement("section");starterSection.className="panel starter-setup";
        const starterTitle=document.createElement("h2");starterTitle.textContent="Choose models for your work";
        const starterHelp=document.createElement("p");starterHelp.textContent="Pick a model for each kind of task. Leave any you do not need blank. Each selected model must be different. Jev will use these as starting rules; you can refine them under Advanced.";
        const starterChoices=document.createElement("div");starterChoices.className="starter-choices";
        const starterRoles=[
          {id:"starter_simple",label:"Simple tasks",help:"Formatting, extraction and short factual answers",thinking:"low",description:"Use for straightforward deterministic tasks: formatting, extraction, sorting, and short factual answers. Do not use for coding or multi-step judgment."},
          {id:"starter_everyday",label:"Everyday work",help:"Questions, summaries and routine coding",thinking:"medium",description:"Use for general questions, judgment-heavy summaries, tool-assisted work, routine coding, and moderate multi-step tasks."},
          {id:"starter_difficult",label:"Difficult work",help:"Architecture, debugging and complex reasoning",thinking:"high",description:"Use for difficult architecture, production debugging, security analysis, subtle failure diagnosis, and complex multi-step implementations."},
        ] as const;
        const starterSelects=starterRoles.map(role=>{const label=document.createElement("label");label.textContent=role.label;const select=document.createElement("select");const help=document.createElement("small");help.textContent=role.help;label.append(select,help);starterChoices.append(label);return select;});
        const starterNote=document.createElement("p");starterNote.className="muted";starterNote.textContent="Cost and quality start neutral; edit them in Advanced if you want cost-aware routing. Thinking levels are recommendations only.";
        const saveStarter=document.createElement("button");saveStarter.className="primary";saveStarter.textContent="Save starter setup";
        const enableStarter=document.createElement("button");enableStarter.textContent="Enable automatic selection";
        const starterActions=document.createElement("div");starterActions.className="guide-actions";starterActions.append(saveStarter,enableStarter);
        const starterNotice=document.createElement("output");starterNotice.setAttribute("aria-live","polite");
        starterSection.append(starterTitle,starterHelp,starterChoices,starterNote,starterActions,starterNotice);
        const advancedModels=document.createElement("details");advancedModels.className="advanced-models";
        const advancedSummary=document.createElement("summary");advancedSummary.textContent="Advanced: customize routing rules and cost estimates";
        advancedModels.append(advancedSummary);
        const catalogSection=document.createElement("section");catalogSection.className="panel";
        const catalogHead=document.createElement("div");catalogHead.className="panel-head";
        const catalogText=document.createElement("div");const catalogTitle=document.createElement("h2");catalogTitle.textContent="Gateway model preferences";
        const catalogHelp=document.createElement("p");catalogHelp.textContent="This routing pool applies Gateway-wide; availability is checked separately for each agent. New models start with medium-cost and strong-quality placeholders—adjust these estimates before relying on cost optimization.";
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
        const historyFilters=document.createElement("div");historyFilters.className="history-filters";
        const statusLabel=document.createElement("label");statusLabel.textContent="Result";
        const statusFilter=document.createElement("select");
        for(const [value,name] of [["all","All results"],["model_verified","Model matched"],["kept_current","Kept current"],["run_failed","Run failed"],["observed_only","Observed only"],["other","Other"]]){const option=document.createElement("option");option.value=value;option.textContent=name;statusFilter.append(option);}statusLabel.append(statusFilter);
        const modelLabel=document.createElement("label");modelLabel.textContent="Model";
        const modelFilter=document.createElement("select");modelLabel.append(modelFilter);
        const historyCount=document.createElement("span");historyCount.className="catalog-count";historyCount.setAttribute("role","status");
        historyFilters.append(statusLabel,modelLabel,historyCount);
        const wrapper=document.createElement("div"); wrapper.className="jev-router-table";
        const table=document.createElement("table"); const head=table.createTHead().insertRow();
        const historyColumns=["Time","Result","Jev choice","Actually used","Why","Performance","Details"];
        for(const name of historyColumns){const th=document.createElement("th");th.scope="col";th.textContent=name;head.append(th);}
        const body=table.createTBody();wrapper.append(table);historySection.append(historyHead,historyFilters,wrapper);

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
        let starterDirty=false;let starterAgent:string|undefined;let starterInitialized=false;
        let starterOptimization="balanced";let starterContinuity=true;let starterSavedProfiles:DraftProfile[]=[];
        let starterCatalog:Array<{model:string;name:string;input:string[];ready:boolean}>=[];
        const renderStarter=(snapshot:Awaited<ReturnType<typeof client.invoke<"snapshot">>>)=>{
          const managed=snapshot.profiles.length===0||snapshot.profiles.every(profile=>starterRoles.some(role=>role.id===profile.id));
          starterSection.hidden=!managed;
          if(!starterInitialized){advancedModels.open=!managed;starterInitialized=true;}
          if(!managed||starterDirty&&starterAgent===selectedAgent())return;
          starterDirty=false;starterAgent=selectedAgent();starterOptimization=snapshot.optimization;starterContinuity=snapshot.continuity;
          starterSavedProfiles=snapshot.profiles.map(profile=>({id:profile.id,model:profile.model,description:profile.description,thinking:profile.thinking,input:[...profile.input],cost:profile.cost,quality:profile.quality}));
          starterCatalog=snapshot.gatewayModels.filter(model=>model.ready&&model.input.includes("text"));
          starterRoles.forEach((role,index)=>{
            const select=starterSelects[index];select.replaceChildren();
            const empty=document.createElement("option");empty.value="";empty.textContent="Choose a model (optional)";select.append(empty);
            for(const model of starterCatalog){const option=document.createElement("option");option.value=model.model;option.textContent=`${model.name} · ${model.model}`;select.append(option);}
            const saved=snapshot.profiles.find(profile=>profile.id===role.id);
            if(saved&&!starterCatalog.some(model=>model.model===saved.model)){const option=document.createElement("option");option.value=saved.model;option.textContent=`${saved.model} (unavailable)`;select.append(option);}
            select.value=saved?.model??"";
            select.disabled=!context.host.connection.canAdmin;
          });
          saveStarter.disabled=!context.host.connection.canAdmin||starterCatalog.length===0;
          enableStarter.disabled=!context.host.connection.canAdmin||snapshot.mode==="route"||snapshot.health.credential!=="configured"||snapshot.health.readyProfiles===0||!snapshot.profiles.length;
          enableStarter.hidden=snapshot.mode==="route";
          if(!starterCatalog.length)starterNotice.textContent="No available text models. Configure a model provider in OpenClaw first.";
        };
        starterSelects.forEach(select=>select.onchange=()=>{starterDirty=true;starterNotice.textContent="Unsaved starter choices.";});
        saveStarter.onclick=async()=>{
          if(preferencesDirty){starterNotice.textContent="Discard or save Advanced edits before using starter setup.";return;}
          if(starterAgent!==selectedAgent()){starterNotice.textContent="The selected agent changed. Reload its available models before saving.";return;}
          const chosen=starterSelects.map(select=>select.value).filter(Boolean);
          if(!chosen.length){starterNotice.textContent="Choose at least one model.";return;}
          if(new Set(chosen).size!==chosen.length){starterNotice.textContent="Choose a different model for each selected task type.";return;}
          const profiles=[] as DraftProfile[];
          for(let index=0;index<starterRoles.length;index++){
            const modelId=starterSelects[index].value;if(!modelId)continue;
            const model=starterCatalog.find(item=>item.model===modelId);
            if(!model){starterNotice.textContent="A selected model is unavailable. Choose an available model.";return;}
            const role=starterRoles[index];
            const previous=starterSavedProfiles.find(profile=>profile.id===role.id&&profile.model===modelId);
            profiles.push(previous??{id:role.id,model:modelId,description:role.description,thinking:role.thinking,input:[...model.input],cost:"medium",quality:"strong"});
          }
          saveStarter.disabled=true;starterNotice.textContent="Saving starter setup…";
          try{
            await invokeAdmin("save_preferences",{...agentPayload(),optimization:starterOptimization,continuity:starterContinuity,profiles});
            starterDirty=false;starterNotice.textContent="Starter setup saved. Preview a task, then enable routing on Overview.";
            await load();
          }catch{starterNotice.textContent="Could not save starter setup. Check administrator access and Gateway connection.";}
          finally{saveStarter.disabled=false;}
        };
        enableStarter.onclick=async()=>{
          if(starterDirty||preferencesDirty){starterNotice.textContent="Save or discard your model edits before enabling automatic selection.";return;}
          if(starterAgent!==selectedAgent()){starterNotice.textContent="The selected agent changed. Reload its models before enabling routing.";return;}
          enableStarter.disabled=true;starterNotice.textContent="Enabling automatic selection…";
          try{await invokeAdmin("set_mode",{mode:"route",...agentPayload()});starterNotice.textContent="Automatic selection enabled. Send a real message, then check Logs for the model used.";await load();}
          catch(error){starterNotice.textContent=error instanceof Error?error.message:"Could not enable routing. Check Jev connection and model eligibility.";}
          finally{enableStarter.disabled=false;}
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
            const purposeLabel=document.createElement("label");purposeLabel.textContent="Suggested use (updates description and recommended thinking only)";
            const purpose=document.createElement("select");
            for(const [value,text] of [["routine","Routine"],["balanced","Balanced"],["deep","Deep reasoning"]]){const option=document.createElement("option");option.value=value;option.textContent=text;purpose.append(option);}
            purpose.value=tier(choice.thinking);purpose.disabled=!checkbox.checked;purposeLabel.append(purpose);
            const estimates=document.createElement("div");estimates.className="model-estimates";
            const costLabel=document.createElement("label");costLabel.textContent=existing?"Relative usage cost":"Relative usage cost (estimate)";
            const cost=document.createElement("select");for(const [value,text] of [["low","Low"],["medium","Medium"],["high","High"]]){const option=document.createElement("option");option.value=value;option.textContent=text;cost.append(option);}cost.value=choice.cost;cost.disabled=!checkbox.checked;costLabel.append(cost);
            const qualityLabel=document.createElement("label");qualityLabel.textContent=existing?"Expected output quality":"Expected output quality (estimate)";
            const quality=document.createElement("select");for(const [value,text] of [["standard","Standard"],["strong","Strong"],["best","Best available"]]){const option=document.createElement("option");option.value=value;option.textContent=text;quality.append(option);}quality.value=choice.quality;quality.disabled=!checkbox.checked;qualityLabel.append(quality);
            estimates.append(costLabel,qualityLabel);
            const descriptionLabel=document.createElement("label");descriptionLabel.textContent="When Jev should use it";
            const description=document.createElement("textarea");description.maxLength=500;description.value=choice.description;description.disabled=!checkbox.checked;descriptionLabel.append(description);
            const row={el,searchText:`${model.name} ${model.model} ${"provider" in model?model.provider:""} ${existing?.id??""}`.toLowerCase(),enabled:Boolean(existing),ready:model.ready};catalogRows.push(row);
            const changed=()=>{markDirty();estimateWarning();applyCatalogFilter();};
            checkbox.onchange=()=>{purpose.disabled=!checkbox.checked;cost.disabled=!checkbox.checked;quality.disabled=!checkbox.checked;description.disabled=!checkbox.checked;config.hidden=!checkbox.checked;row.enabled=checkbox.checked;el.classList.toggle("selected",checkbox.checked);if(checkbox.checked)profileDrafts.set(choice.id,choice);else profileDrafts.delete(choice.id);changed();};
            purpose.onchange=()=>{const oldSuggestion=preset(tier(choice.thinking),model.name).description;const suggested=preset(purpose.value,model.name);choice={...choice,thinking:suggested.thinking,description:description.value===oldSuggestion?suggested.description:description.value};description.value=choice.description;if(checkbox.checked)profileDrafts.set(choice.id,choice);changed();};
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
        type Snapshot=Awaited<ReturnType<typeof client.invoke<"snapshot">>>;
        let latestSnapshot:Snapshot|undefined;
        let expandedRecord:string|undefined;
        const renderHistory=(records:Snapshot["records"])=>{
          const previous=modelFilter.value;
          const models=[...new Set(records.flatMap(row=>[row.selectedModel,row.observedModel].filter((model):model is string=>Boolean(model))))].sort();
          modelFilter.replaceChildren();
          for(const [value,name] of [["all","All models"],...models.map(model=>[model,model])]){const option=document.createElement("option");option.value=value;option.textContent=name;modelFilter.append(option);}
          modelFilter.value=models.includes(previous)?previous:"all";
          const filtered=records.filter(row=>(statusFilter.value==="all"||statusFilter.value===row.status||(statusFilter.value==="other"&&!["model_verified","kept_current","run_failed","observed_only"].includes(row.status)))&&(modelFilter.value==="all"||row.selectedModel===modelFilter.value||row.observedModel===modelFilter.value));
          historyCount.textContent=`${filtered.length} of ${records.length} shown`;
          body.replaceChildren();
          if(!filtered.length){const cell=body.insertRow().insertCell();cell.colSpan=7;cell.className="empty";cell.textContent=records.length?"No records match these filters.":"No decisions yet. Send a message or preview a task to create the first entry.";}
          for(const row of filtered){
            const tr=body.insertRow();
            const choice=row.selectedModel?`${row.selectedProfile?row.selectedProfile+" · ":""}${row.selectedModel} · ${row.selectedThinking??"current"} (recommended)`:"—";
            const actual=row.observedModel?`${row.observedModel} · ${row.observedThinking??"thinking not reported"}`:"Not observed";
            [new Date(row.at).toLocaleString(),labels[row.status]??row.status,choice,actual,row.reason.replaceAll("_"," "),`${row.latencyMs} ms${row.tokens===undefined?"":` · ${row.tokens} reported tokens`}`].forEach((value,index)=>{const cell=tr.insertCell();cell.setAttribute("data-label",historyColumns[index]);cell.textContent=String(value);});
            const detailCell=tr.insertCell();detailCell.setAttribute("data-label","Details");
            const detail=document.createElement("details");detail.className="run-details";detail.open=expandedRecord===row.id;
            const summary=document.createElement("summary");summary.textContent="View run";
            detail.ontoggle=()=>{if(detail.open)expandedRecord=row.id;else if(expandedRecord===row.id)expandedRecord=undefined;};
            const steps=document.createElement("ol");
            const lines=[row.selectedModel?`Jev recommended ${row.selectedModel} (${row.confidence===undefined?"continuity choice":Math.round(row.confidence*100)+"% classifier confidence"}).`:`Jev kept the current model: ${row.reason.replaceAll("_"," ")}.`,row.observedModel?`OpenClaw used ${row.observedModel}.`:"The model used was not observed.",row.status==="observed_only"?"No routing prompt was observed.":row.promptTruncated?"Routing used the start and end of a long prompt; the middle was omitted.":"Routing used the current prompt only; earlier conversation was not supplied.",row.completed===true?"The host run completed; answer quality is not established.":row.status==="run_failed"?(row.failureCategory?`The run failed. A model call reported ${row.failureCategory}; check OpenClaw logs for the full cause.`:"The run failed. Jev has no failure category for this run; check OpenClaw logs."):row.status==="model_verified"?"The models matched. This does not establish answer quality.":row.status==="observed_only"?"No routing decision was observed for this run.":"No task-quality result is recorded."];
            for(const line of lines){const item=document.createElement("li");item.textContent=line;steps.append(item);}
            if(row.status!=="preview"&&row.status!=="recommended"){
              const feedback=document.createElement("div");feedback.className="feedback";const label=document.createElement("span");label.textContent="Your outcome: "+(row.feedback??"not rated");feedback.append(label);
              for(const [value,name] of [["good","Good result"],["stronger","Needed stronger"],["cheaper","Could be cheaper"]] as const){const button=document.createElement("button");button.type="button";button.textContent=name;button.setAttribute("aria-pressed",String(row.feedback===value));button.onclick=async()=>{button.disabled=true;try{await client.invoke("rate_run",{id:row.id,feedback:value},options());await load();}catch{label.textContent="Could not save feedback. Try again.";}finally{button.disabled=false;}};feedback.append(button);}detail.append(feedback);}
            detail.prepend(summary,steps);detailCell.append(detail);
          }
        };
        statusFilter.onchange=()=>{if(latestSnapshot)renderHistory(latestSnapshot.records);};
        modelFilter.onchange=()=>{if(latestSnapshot)renderHistory(latestSnapshot.records);};
        period.onchange=()=>{if(latestSnapshot)render(latestSnapshot);};
          const metric=(label:string,value:string,note:string)=>{const el=document.createElement("article");const name=document.createElement("span");name.textContent=label;const number=document.createElement("strong");number.textContent=value;const help=document.createElement("small");help.textContent=note;el.append(name,number,help);return el;};
        const render=(snapshot:Snapshot) => {
          populateAnalytics(snapshot);
          const weekly=analyzeUsage(snapshot.records,snapshot.pricing,Date.now()-7*86400000);
          const reviewed=weekly.rated;
          analyticsStats.replaceChildren(metric("Observed runs",String([...weekly.models.values()].reduce((n,item)=>n+item.runs,0)),"Last 7 days"),metric("Rated outcomes",String(reviewed),"Only your explicit feedback"),metric("Estimated savings",weekly.compared?("$"+weekly.savings.toFixed(3)):"—",weekly.compared?weekly.compared+" comparable runs; negative means higher estimated cost":billing.value==="subscription"?"Subscription mode — no savings claim":"Set prices and a baseline; split tokens required"),metric("Host completed",[...weekly.models.values()].reduce((n,item)=>n+item.completedRuns,0)+"/"+[...weekly.models.values()].reduce((n,item)=>n+item.completedRuns+item.failedRuns,0),"Known run outcomes; not answer quality"),metric("Cost coverage",weekly.compared+"/"+weekly.total,"Comparable / all runs"));
          usageRows.replaceChildren();
          for(const [model,item] of [...weekly.models].sort((a,b)=>b[1].runs-a[1].runs)){const row=document.createElement("article");row.className="usage-row";const head=document.createElement("div");const name=document.createElement("strong");name.textContent=model;const share=document.createElement("span");share.textContent=item.runs+" run"+(item.runs===1?"":"s")+" · "+(weekly.total?Math.round(item.runs/weekly.total*100):0)+"% of records";head.append(name,share);
            const bar=document.createElement("div");bar.className="usage-bar";const fill=document.createElement("span");fill.style.width=(weekly.total?Math.max(2,item.runs/weekly.total*100):0)+"%";bar.append(fill);
            const meta=document.createElement("small");meta.textContent="Host completed: "+item.completedRuns+"/"+(item.completedRuns+item.failedRuns)+" known · Feedback: "+item.good+" good · "+item.stronger+" needed stronger · "+item.cheaper+" could be cheaper · "+(item.pricedRuns?("$"+item.estimatedCost.toFixed(3)+" estimated API cost across "+item.pricedRuns+" runs"):"cost unavailable");row.append(head,bar,meta);usageRows.append(row);}
          if(!weekly.models.size){const empty=document.createElement("p");empty.className="muted";empty.textContent="No observed model runs in the last 7 days.";usageRows.append(empty);}
          const stronger=[...weekly.models].filter(([,item])=>item.stronger>0).sort((a,b)=>b[1].stronger-a[1].stronger)[0];
          const cheap=[...weekly.models].filter(([,item])=>item.cheaper>0).sort((a,b)=>b[1].cheaper-a[1].cheaper)[0];
          weeklyReview.textContent=stronger?stronger[0]+" has "+stronger[1].stronger+" “needed stronger” rating"+(stronger[1].stronger===1?"":"s")+" this week. Review its profile or guardrail.":cheap?cheap[0]+" has "+cheap[1].cheaper+" “could be cheaper” rating"+(cheap[1].cheaper===1?"":"s")+" this week. Consider a lower-cost route.":reviewed?"No quality or cost concerns marked this week. Continue rating runs to spot patterns.":"No rated outcomes yet. Rate runs in Logs to start a weekly review.";
          latestSnapshot=snapshot;
          status.textContent=`Live · ${snapshot.health.agentId??"default agent"}`;
          dashboardTabs[2].count.textContent=String(snapshot.health.gatewayModels);dashboardTabs[3].count.textContent=String(snapshot.records.length);
          const credentialReady=snapshot.health.credential==="configured";
          const routingReady=credentialReady&&snapshot.health.readyProfiles>0&&snapshot.health.gatewayModels>0;
          healthBanner.classList.toggle("warning",!routingReady||snapshot.mode!=="route");
          healthIcon.textContent=routingReady&&snapshot.mode==="route"?"✓":"!";
          connectStep.textContent=credentialReady?"✓ Jev credential connected":"Connect a Jev credential below";
          modelsStep.textContent=snapshot.health.readyProfiles>0?`✓ ${snapshot.health.readyProfiles} eligible model${snapshot.health.readyProfiles===1?"":"s"}`:"Choose and save at least one eligible model";
          routingStep.textContent=snapshot.mode==="route"?"✓ Routing enabled":"Preview a task, then enable routing";
          verifyStep.textContent=snapshot.records.some(row=>row.status==="model_verified")?"✓ A selected model matched the model used":"Send a real message and check Logs for the model actually used";
          routeButton.dataset.mode=snapshot.mode;
          routeButton.textContent=snapshot.mode==="route"?"Pause routing":"Enable routing";
          routeButton.disabled=!context.host.connection.canAdmin||preferencesDirty||(snapshot.mode!=="route"&&!routingReady);
          modelsLink.hidden=snapshot.health.readyProfiles>0;
          logsLink.hidden=snapshot.mode!=="route";
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
          const since=period.value==="day"?Date.now()-86400000:period.value==="week"?Date.now()-604800000:0;
          const report=summarize(snapshot.records,snapshot.profiles,since);
          insightStats.replaceChildren(metric("Model matched",String(report.matched),"Recommended and observed models agree"),metric("Kept current",String(report.kept),"No model change requested"),metric("Run failed",String(report.failed),"Cause may require OpenClaw logs"),metric("Typical routing delay",report.medianLatency===undefined?"—":`${report.medianLatency} ms`,"Median of recorded routing decisions"));
          insightModels.replaceChildren(...snapshot.profiles.map(profile=>metric(profile.id,String(report.selected.get(profile.id)??0),profile.model+" · Gateway-wide selections")));
          insightNote.textContent=!report.total?"No run records in this period. Try a wider period.":report.lowConfidence?`${report.lowConfidence} decision${report.lowConfidence===1?"":"s"} had low classifier confidence; Jev kept the current model unless the run later failed. ${report.observedOnly} observed-only run${report.observedOnly===1?"":"s"} did not prove routing.`:report.observedOnly?`${report.observedOnly} observed-only run${report.observedOnly===1?"":"s"} did not prove routing.`:"These counts describe routing, not answer quality or cost.";
          insightsScope.textContent=`${report.total} run record${report.total===1?"":"s"} Gateway-wide in this view · latest 200 stored locally at most. Matches do not measure answer quality.`;
          if(snapshot.profiles.length)profiles.replaceChildren(...snapshot.profiles.map(profile=>{const el=document.createElement("article");el.className="profile"+(profile.ready?"":" unavailable");const top=document.createElement("div");top.className="profile-head";const name=document.createElement("strong");name.textContent=profile.id;const badge=document.createElement("small");badge.textContent=profile.ready?"Eligible":"Excluded";top.append(name,badge);const model=document.createElement("code");model.textContent=profile.model;const description=document.createElement("p");description.textContent=profile.description;const meta=document.createElement("span");meta.className="profile-meta";meta.textContent=`Cost: ${profile.cost} · Quality: ${profile.quality} · Inputs: ${profile.input.join(", ")} · Thinking: ${profile.thinking??"unchanged"}`;const usage=document.createElement("span");usage.className="profile-usage";const picks=report.selected.get(profile.id)??0;usage.textContent=`${picks} selection${picks===1?"":"s"} Gateway-wide in this period${picks===0?" · no conclusion yet":""}`;const reason=document.createElement("span");reason.className="profile-reason";reason.textContent=profile.reason;el.append(top,model,description,meta,usage,reason);return el;}));
          else{const empty=document.createElement("div");empty.className="empty-state";const emptyTitle=document.createElement("strong");emptyTitle.textContent="No routing profiles yet";const emptyNote=document.createElement("p");emptyNote.textContent="Choose models in Gateway model preferences below.";empty.append(emptyTitle,emptyNote);profiles.replaceChildren(empty);}
          renderStarter(snapshot);
          renderCatalog(snapshot);
          limitations.replaceChildren(...snapshot.limitations.map(text=>{const li=document.createElement("li");li.textContent=text;return li;}));
          renderHistory(snapshot.records);
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
        overviewPanel.append(healthBanner,insights,guide,cards,setupSection,workspace,details);analyticsPanel.append(analytics,analyticsSettings);advancedModels.append(catalogSection);modelsPanel.append(starterSection,advancedModels);logsPanel.append(historySection);
        section.append(tabs,overviewPanel,analyticsPanel,modelsPanel,logsPanel);container.append(section);
        return {dispose(){stop();globalThis.clearInterval(timer);section.remove();}};
      },
    });
  },
});
