export type InsightRecord = {
  at: string; status: string; reason: string; latencyMs: number;
  selectedProfile?: string; selectedModel?: string; observedModel?: string;
};

export function summarize(records: InsightRecord[], profiles: {id:string;model:string}[], since = 0) {
  const recent = records.filter(row => Date.parse(row.at) >= since && row.status !== "preview" && row.status !== "recommended");
  const count = (status: string) => recent.filter(row => row.status === status).length;
  const selected = new Map(profiles.map(profile => [profile.id, 0]));
  for (const row of recent) if (row.selectedProfile && selected.has(row.selectedProfile)) selected.set(row.selectedProfile, selected.get(row.selectedProfile)! + 1);
  const latencies = recent.filter(row => row.reason !== "routing_hook_not_observed" && row.latencyMs > 0).map(row => row.latencyMs).sort((a,b) => a-b);
  const middle = Math.floor(latencies.length / 2);
  const medianLatency = latencies.length ? Math.round(latencies.length % 2 ? latencies[middle] : (latencies[middle-1] + latencies[middle]) / 2) : undefined;
  return {
    total: recent.length,
    matched: count("model_verified"), kept: count("kept_current"), failed: count("run_failed"), observedOnly: count("observed_only"),
    lowConfidence: recent.filter(row => row.reason === "low_confidence").length,
    medianLatency, selected,
  };
}

export function classifyFailure(category: string) {
  return /quota/i.test(category)?"quota":/rate.?limit/i.test(category)?"rate limit":/auth|credential|unauthorized/i.test(category)?"authentication":/permission|forbidden/i.test(category)?"permission":/timeout/i.test(category)?"timeout":/connection/i.test(category)?"connection":undefined;
}

export type PriceSettings={billing?:"api"|"subscription";baselineModel?:string;rates:Record<string,{input:number;output:number}>};
export function analyzeUsage(records:(InsightRecord&{inputTokens?:number;outputTokens?:number;feedback?:"good"|"stronger"|"cheaper";completed?:boolean})[],settings:PriceSettings,since=0){
  const rows=records.filter(row=>Date.parse(row.at)>=since&&row.status!=="preview"&&row.status!=="recommended");
  const models=new Map<string,{runs:number;inputTokens:number;outputTokens:number;good:number;stronger:number;cheaper:number;completedRuns:number;failedRuns:number;estimatedCost:number;pricedRuns:number}>();
  let savings=0,compared=0;
  const baseline=settings.billing==="api"&&settings.baselineModel?settings.rates[settings.baselineModel]:undefined;
  for(const row of rows){
    const model=row.observedModel;
    if(!model)continue;
    const item=models.get(model)??{runs:0,inputTokens:0,outputTokens:0,good:0,stronger:0,cheaper:0,completedRuns:0,failedRuns:0,estimatedCost:0,pricedRuns:0};
    item.runs++;
    if(row.feedback)item[row.feedback]++;
    if(row.completed===true)item.completedRuns++;
    else if(row.completed===false)item.failedRuns++;
    if(row.inputTokens!==undefined&&row.outputTokens!==undefined){
      item.inputTokens+=row.inputTokens;item.outputTokens+=row.outputTokens;
      const rate=settings.billing==="api"?settings.rates[model]:undefined;
      if(rate){const actual=(row.inputTokens*rate.input+row.outputTokens*rate.output)/1e6;item.estimatedCost+=actual;item.pricedRuns++;
        if(baseline){savings+=(row.inputTokens*baseline.input+row.outputTokens*baseline.output)/1e6-actual;compared++;}}
    }
    models.set(model,item);
  }
  const rated=[...models.values()].reduce((n,item)=>n+item.good+item.stronger+item.cheaper,0);
  return {models,savings,compared,rated,total:rows.length};
}
