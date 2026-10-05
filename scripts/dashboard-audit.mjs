import {readFile} from "node:fs/promises";
import assert from "node:assert/strict";
const manifest=JSON.parse(await readFile(new URL("../openclaw.plugin.json",import.meta.url),"utf8"));
const {default:plugin}=await import(new URL("../"+manifest.controlUi.entry,import.meta.url));
const elements=[];
function element(tag){
 const node={tag,children:[],dataset:{},style:{},value:"",append(...items){this.children.push(...items);},prepend(...items){this.children.unshift(...items);},addEventListener(){},checkValidity(){return true;},setAttribute(){},replaceChildren(...items){this.children=items;},remove(){},
  classList:{toggle(){}},focus(){},
  createCaption(){return element("caption");},createTHead(){return element("thead");},
  createTBody(){return element("tbody");},insertRow(){return element("tr");},insertCell(){return element("td");}};
 elements.push(node);return node;
}
globalThis.document={createElement:element};
let page,disposed=0;
const previews=[];
const saves=[];
const modes=[];const analyticsSaves=[];const ratings=[];
let currentMode="observe";
const testProfiles=[
 {id:"routine",model:"openai/gpt-5.6-sol",description:"Routine work",thinking:"low",cost:"medium",quality:"strong",input:["text"],ready:true,reason:"Eligible for text prompts"},
 {id:"deep",model:"openai/gpt-5.6-sol",description:"Deep work",thinking:"high",cost:"medium",quality:"strong",input:["text"],ready:true,reason:"Eligible for text prompts"},
 {id:"offline",model:"custom/offline",description:"Temporarily unavailable",cost:"medium",quality:"strong",input:["text","image"],ready:false,reason:"Unavailable"},
];
let configuredProfiles=testProfiles;
const host={pluginId:"jev-router",signal:new AbortController().signal,connection:{connected:true,canAdmin:true},
 agents:{selectedId:"restricted",defaultId:"main"},
 sessions:{selectedKey:"agent:restricted:test"},
 ui:{registerNavigation(){},registerPage(p){page=p;}},
 subscribe(){return ()=>{disposed++;};},onEvent(){return ()=>{disposed++;};},
 async request(_method,params){
  if(params.actionId==="preview"){previews.push(params);return {ok:true,result:{reason:"no_eligible_profiles"}};}
  if(params.actionId==="save_preferences"){saves.push(params);if(configuredProfiles.length===0)configuredProfiles=params.payload.profiles.map(profile=>({...profile,ready:true,reason:"Eligible for text prompts"}));return {ok:true,result:{saved:true}};}
  if(params.actionId==="save_analytics"){analyticsSaves.push(params);return {ok:true,result:{saved:true}};}
  if(params.actionId==="rate_run"){ratings.push(params);return {ok:true,result:{saved:true}};}
  if(params.actionId==="set_mode"){modes.push(params);currentMode=params.payload.mode;return {ok:true,result:{mode:currentMode}};}
  return {ok:true,result:{mode:currentMode,optimization:"balanced",continuity:true,minConfidence:0.65,pricing:{billing:"subscription",rates:{}},profiles:configuredProfiles,gatewayModels:[{model:"openai/gpt-5.6-sol",provider:"openai",name:"Sol",input:["text"],ready:true,configured:true},{model:"custom/economy",provider:"custom",name:"Economy",input:["text"],ready:true,configured:true}],records:[{id:"failed-run",at:"2026-10-02T12:00:00.000Z",status:"run_failed",reason:"jev_choice",latencyMs:420,selectedProfile:"routine",selectedModel:"openai/gpt-5.6-sol",observedModel:"openai/gpt-5.6-sol",failureCategory:"authentication"},{id:"uncertain-run",at:"2026-10-02T12:01:00.000Z",status:"kept_current",reason:"low_confidence",latencyMs:390,confidence:0.4}],limitations:[],health:{agentId:params.agentId,credential:"configured",readyProfiles:2,totalProfiles:3,gatewayModels:2,fallbacks:[],history:"persistent-local"}}};
 }};
await plugin.activate(host);
const view=page.mount(element("container"),{host,signal:host.signal});
await new Promise(resolve=>setImmediate(resolve));
const overviewPanel=elements.find(x=>x.id==="jev-overview");
const modelsPanel=elements.find(x=>x.id==="jev-models");
const logsPanel=elements.find(x=>x.id==="jev-logs");
const overviewTab=elements.find(x=>x.tag==="button"&&x.children.some?.(x=>x.textContent==="Overview"));
const logsTab=elements.find(x=>x.tag==="button"&&x.children.some?.(x=>x.textContent==="Logs"));
assert.equal(elements.find(x=>x.className==="panel starter-setup").hidden,true,"existing custom profiles should keep the advanced editor");
assert.equal(overviewPanel.hidden,false);assert.equal(modelsPanel.hidden,true);assert.equal(logsPanel.hidden,true,"overview should be the default dashboard view");
logsTab.onclick();assert.equal(overviewPanel.hidden,true);assert.equal(logsPanel.hidden,false,"logs should be one click away without page scrolling");
const insightStats=elements.find(x=>x.className==="insight-stats");
assert.equal(insightStats.children[2].children[1].textContent,"1","failed runs should be visible without reading logs");
const resultFilter=elements.find(x=>x.tag==="select"&&x.children.some?.(item=>item.textContent==="Run failed"));
resultFilter.value="run_failed";resultFilter.onchange();
assert.ok(elements.some(x=>x.textContent==="1 of 2 shown"),"result filter should narrow history");
assert.ok(elements.some(x=>x.textContent?.includes("A model call reported authentication")),"run details should disclose bounded host error category");
overviewTab.onclick();
const setup=elements.find(x=>x.tag==="details"&&x.className?.includes("setup-panel"));
assert.equal(setup.open,false,"connected credential setup should stay collapsed");
assert.ok(elements.some(x=>x.textContent==="Jev is observing, not switching models"));
const routeButton=elements.find(x=>x.tag==="button"&&x.textContent==="Enable routing");
assert.ok(routeButton);assert.equal(routeButton.disabled,false);
await routeButton.onclick();
assert.equal(modes[0].payload.mode,"route");
assert.equal(routeButton.textContent,"Pause routing");
assert.ok(elements.some(x=>x.textContent?.includes("Send a real message and check Logs")));
const search=elements.find(x=>x.tag==="input"&&x.type==="search");
const filter=elements.find(x=>x.tag==="select"&&x.children.some?.(x=>x.textContent==="Selected only"));
const catalogCount=elements.find(x=>x.className==="catalog-count");
const modelCards=elements.filter(x=>x.tag==="article"&&x.className?.startsWith("gateway-model"));
const economyCard=modelCards.find(x=>x.children.some(child=>child.textContent==="custom/economy"));
assert.equal(economyCard.children.find(x=>x.className==="model-config").hidden,true,"unselected model controls should stay collapsed");
const description=economyCard.children.find(x=>x.className==="model-config").children.find(x=>x.tag==="label"&&x.textContent==="When Jev should use it")?.children[0];
const purpose=economyCard.children.find(x=>x.className==="model-config").children.find(x=>x.tag==="label"&&x.textContent?.startsWith("Suggested use"))?.children[0];
assert.ok(description&&purpose);
economyCard.children[0].children[0].children[0].checked=true;
economyCard.children[0].children[0].children[0].onchange();
description.value="Keep my custom routing instructions";description.oninput();
purpose.value="deep";purpose.onchange();
assert.equal(description.value,"Keep my custom routing instructions");
assert.ok(elements.some(x=>x.textContent==="Suggested use (updates description and recommended thinking only)"));
economyCard.children[0].children[0].children[0].checked=false;
economyCard.children[0].children[0].children[0].onchange();
search.value="sol";search.oninput();
assert.equal(catalogCount.textContent,"2 of 4 shown · 3 selected","catalog search should narrow visible models");
search.value="";filter.value="selected";filter.onchange();
assert.equal(catalogCount.textContent,"3 of 4 shown · 3 selected","selected filter should include duplicate and offline saved profiles");
filter.value="all";filter.onchange();
const saveButton=elements.find(x=>x.tag==="button"&&x.textContent==="Save routing pool");
assert.ok(elements.some(x=>x.textContent?.startsWith("All enabled profiles have identical")));
await saveButton.onclick();
assert.deepEqual(saves[0].payload.profiles.map(p=>p.id),["routine","deep","offline"]);
assert.deepEqual(saves[0].payload.profiles[2].input,["text","image"]);
const input=elements.find(x=>x.tag==="textarea");
const button=elements.find(x=>x.tag==="button"&&x.textContent==="Preview choice");
input.value="synthetic prompt";
await button.onclick();
assert.equal(previews[0].agentId,"restricted");
assert.equal(previews[0].payload.agentId,"restricted");
host.agents.selectedId=null;
host.sessions.selectedKey="agent:main:test";
await saveButton.onclick();assert.equal(saves.length,1,"agent switch must not save a stale draft");
await button.onclick();
assert.equal(previews[1].agentId,"main");
assert.equal(previews[1].payload.agentId,"main");
const analyticsTab=elements.find(x=>x.tag==="button"&&x.children.some?.(x=>x.textContent==="Analytics"));
const analyticsPanel=elements.find(x=>x.id==="jev-analytics");
analyticsTab.onclick();assert.equal(analyticsPanel.hidden,false);
const saveAnalytics=elements.find(x=>x.tag==="button"&&x.textContent==="Save analytics settings");
await saveAnalytics.onclick();assert.equal(analyticsSaves[0].payload.pricing.billing,"subscription");
assert.equal(analyticsSaves[0].payload.minConfidence,0.65);
const good=elements.find(x=>x.tag==="button"&&x.textContent==="Good result");
await good.onclick();assert.equal(ratings[0].payload.feedback,"good");
view.dispose();
configuredProfiles=[];currentMode="observe";host.agents.selectedId="restricted";
const freshStart=elements.length;
const freshView=page.mount(element("container"),{host,signal:host.signal});
await new Promise(resolve=>setImmediate(resolve));
const fresh=elements.slice(freshStart);
const starter=fresh.find(x=>x.className==="panel starter-setup");
assert.equal(starter.hidden,false,"new users should see the three-choice starter setup");
const advanced=fresh.find(x=>x.className==="advanced-models");
assert.equal(advanced.open,false,"advanced editor should start collapsed for new users");
const choices=starter.children.find(x=>x.className==="starter-choices").children.map(label=>label.children[0]);
assert.equal(choices.length,3);
choices[0].value="custom/economy";choices[0].onchange();
choices[1].value="openai/gpt-5.6-sol";choices[1].onchange();
const starterActions=starter.children.find(x=>x.className==="guide-actions");
const starterSave=starterActions.children.find(x=>x.textContent==="Save starter setup");
await starterSave.onclick();
const saved=saves.at(-1).payload;
assert.deepEqual(saved.profiles.map(profile=>profile.id),["starter_simple","starter_everyday"]);
assert.ok(saved.profiles[0].description.includes("formatting"));
assert.equal(saved.optimization,"balanced");
assert.equal(saved.continuity,true);
assert.equal(configuredProfiles.length,2);
const enableStarter=starterActions.children.find(x=>x.textContent==="Enable automatic selection");
assert.equal(enableStarter.disabled,false);
await enableStarter.onclick();
assert.equal(modes.at(-1).payload.mode,"route");
freshView.dispose();
assert.ok(disposed>=2,"event subscriptions must be released");
console.log("Dashboard audit passed: one-click tab navigation, health/setup state, compact model cards, search/filter, duplicate and offline profile preservation, stale-agent draft blocking, preview agent selection, subscription disposal.");
