import {readFile} from "node:fs/promises";
import assert from "node:assert/strict";
const manifest=JSON.parse(await readFile(new URL("../openclaw.plugin.json",import.meta.url),"utf8"));
const {default:plugin}=await import(new URL("../"+manifest.controlUi.entry,import.meta.url));
const elements=[];
function element(tag){
 const node={tag,children:[],append(...items){this.children.push(...items);},setAttribute(){},replaceChildren(...items){this.children=items;},remove(){},
  classList:{toggle(){}},focus(){},
  createCaption(){return element("caption");},createTHead(){return element("thead");},
  createTBody(){return element("tbody");},insertRow(){return element("tr");},insertCell(){return element("td");}};
 elements.push(node);return node;
}
globalThis.document={createElement:element};
let page,disposed=0;
const previews=[];
const saves=[];
const testProfiles=[
 {id:"routine",model:"openai/gpt-5.6-sol",description:"Routine work",thinking:"low",cost:"medium",quality:"strong",input:["text"],ready:true,reason:"Eligible for text prompts"},
 {id:"deep",model:"openai/gpt-5.6-sol",description:"Deep work",thinking:"high",cost:"medium",quality:"strong",input:["text"],ready:true,reason:"Eligible for text prompts"},
 {id:"offline",model:"custom/offline",description:"Temporarily unavailable",cost:"medium",quality:"strong",input:["text","image"],ready:false,reason:"Unavailable"},
];
const host={pluginId:"jev-router",signal:new AbortController().signal,connection:{connected:true,canAdmin:true},
 agents:{selectedId:"restricted",defaultId:"main"},
 sessions:{selectedKey:"agent:restricted:test"},
 ui:{registerNavigation(){},registerPage(p){page=p;}},
 subscribe(){return ()=>{disposed++;};},onEvent(){return ()=>{disposed++;};},
 async request(_method,params){
  if(params.actionId==="preview"){previews.push(params);return {ok:true,result:{reason:"no_eligible_profiles"}};}
  if(params.actionId==="save_preferences"){saves.push(params);return {ok:true,result:{saved:true}};}
  return {ok:true,result:{mode:"observe",optimization:"balanced",continuity:true,profiles:testProfiles,gatewayModels:[{model:"openai/gpt-5.6-sol",provider:"openai",name:"Sol",input:["text"],ready:true,configured:true},{model:"custom/economy",provider:"custom",name:"Economy",input:["text"],ready:true,configured:true}],records:[],limitations:[],health:{agentId:params.agentId,credential:"configured",readyProfiles:2,totalProfiles:3,gatewayModels:2,fallbacks:[],history:"persistent-local"}}};
 }};
await plugin.activate(host);
const view=page.mount(element("container"),{host,signal:host.signal});
await new Promise(resolve=>setImmediate(resolve));
const overviewPanel=elements.find(x=>x.id==="jev-overview");
const modelsPanel=elements.find(x=>x.id==="jev-models");
const logsPanel=elements.find(x=>x.id==="jev-logs");
const overviewTab=elements.find(x=>x.tag==="button"&&x.children.some?.(x=>x.textContent==="Overview"));
const logsTab=elements.find(x=>x.tag==="button"&&x.children.some?.(x=>x.textContent==="Logs"));
assert.equal(overviewPanel.hidden,false);assert.equal(modelsPanel.hidden,true);assert.equal(logsPanel.hidden,true,"overview should be the default dashboard view");
logsTab.onclick();assert.equal(overviewPanel.hidden,true);assert.equal(logsPanel.hidden,false,"logs should be one click away without page scrolling");
overviewTab.onclick();
const setup=elements.find(x=>x.tag==="details"&&x.className?.includes("setup-panel"));
assert.equal(setup.open,false,"connected credential setup should stay collapsed");
assert.ok(elements.some(x=>x.textContent==="Jev is observing, not switching models"));
const search=elements.find(x=>x.tag==="input"&&x.type==="search");
const filter=elements.find(x=>x.tag==="select"&&x.children.some?.(x=>x.textContent==="Selected only"));
const catalogCount=elements.find(x=>x.className==="catalog-count");
const modelCards=elements.filter(x=>x.tag==="article"&&x.className?.startsWith("gateway-model"));
const economyCard=modelCards.find(x=>x.children.some(child=>child.textContent==="custom/economy"));
assert.equal(economyCard.children.find(x=>x.className==="model-config").hidden,true,"unselected model controls should stay collapsed");
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
view.dispose();
assert.ok(disposed>=2,"event subscriptions must be released");
console.log("Dashboard audit passed: one-click tab navigation, health/setup state, compact model cards, search/filter, duplicate and offline profile preservation, stale-agent draft blocking, preview agent selection, subscription disposal.");
